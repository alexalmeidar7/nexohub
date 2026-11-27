package br.com.nexobrasil.nexoplayer.nativecore

import android.os.Bundle
import coil.imageLoader
import coil.request.ImageRequest
import androidx.compose.ui.platform.LocalContext
import android.view.KeyEvent
import android.view.MotionEvent
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.runtime.*
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import kotlinx.coroutines.withTimeoutOrNull
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.ui.graphics.Color
import androidx.media3.common.AudioAttributes
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.Player
import androidx.media3.common.Metadata
import androidx.media3.extractor.metadata.icy.IcyInfo
import androidx.media3.extractor.metadata.id3.TextInformationFrame
import androidx.media3.common.PlaybackException
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.HttpDataSource
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import org.json.JSONObject
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

class NativeActivity : ComponentActivity() {
    private var playerState by mutableStateOf<ExoPlayer?>(null)
    private val player get()=requireNotNull(playerState)
    private var resumeOnForeground=false
    private val spectrum = PcmSpectrum()
    private var activity by mutableIntStateOf(0)
    private var hidden by mutableStateOf(false)
    private var consumedKey: Int? = null
    private var diagnostic by mutableStateOf(false)
    private var foreground by mutableStateOf(true)
    private var menuPresses=0
    private var lastMenuPress=0L
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = 5894
        val http=DefaultHttpDataSource.Factory().setUserAgent("NexoTV/"+BuildConfig.VERSION_NAME).setConnectTimeoutMs(15000).setReadTimeoutMs(20000)
        playerState = ExoPlayer.Builder(this,LevelingRenderers(this)).setLoadControl(nativeLoadControl(this)).setMediaSourceFactory(DefaultMediaSourceFactory(this).setDataSourceFactory(androidx.media3.datasource.DefaultDataSource.Factory(this,http))).build().apply {
            setAudioAttributes(AudioAttributes.DEFAULT,true)
        }
        val info=applicationInfo
        runCatching { android.util.Log.i("NexoLauncher","package="+packageName+" icon="+resources.getResourceName(info.icon)+" banner="+resources.getResourceName(info.banner)+" model="+android.os.Build.MODEL+" sdk="+android.os.Build.VERSION.SDK_INT) }
        setContent { playerState?.let{NativeTv(it, spectrum, activity,foreground,diagnostic) { hidden = it }} }
    }
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_UP && consumedKey == event.keyCode) {
            consumedKey = null
            return true
        }
        if(event.keyCode==KeyEvent.KEYCODE_MENU&&event.action==KeyEvent.ACTION_DOWN&&event.repeatCount==0){val now=android.os.SystemClock.elapsedRealtime();menuPresses=if(now-lastMenuPress<1800)menuPresses+1 else 1;lastMenuPress=now;if(menuPresses>=3){diagnostic=!diagnostic;menuPresses=0};consumedKey=event.keyCode;return true}
        if (event.action == KeyEvent.ACTION_DOWN) {
            activity++
            if (hidden && event.keyCode != KeyEvent.KEYCODE_BACK) {
                hidden = false
                consumedKey = event.keyCode
                return true
            }
        }
        return super.dispatchKeyEvent(event)
    }
    override fun dispatchGenericMotionEvent(event: MotionEvent): Boolean {
        activity++
        return super.dispatchGenericMotionEvent(event)
    }
    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        activity++
        return super.dispatchTouchEvent(event)
    }
    override fun onStart() { super.onStart();foreground=true;if(resumeOnForeground&&playerState!=null){resumeOnForeground=false;player.play()} }
    override fun onStop() { foreground=false;if(playerState!=null){resumeOnForeground=player.playWhenReady;player.pause()};super.onStop() }
    override fun onDestroy() { if(playerState!=null)player.release();super.onDestroy() }
}

internal enum class Screen { HOME, AUDIO, VIDEO, SCHEDULE, CATALOG, PROFILE, SEARCH, HISTORY }
internal fun JSONObject?.str(key: String): String = (this?.opt(key) as? String).orEmpty()
internal fun JSONObject?.rows(key: String): List<JSONObject> {
    val a=this?.optJSONArray(key) ?: return emptyList()
    return (0 until a.length()).mapNotNull { a.optJSONObject(it) }
}
internal fun JSONObject?.strings(key: String): List<String> {
    val a=this?.optJSONArray(key) ?: return emptyList()
    return (0 until a.length()).mapNotNull { a.opt(it) as? String }
}
internal val brasilia = ZoneId.of("America/Sao_Paulo")
internal fun safeImage(url: String): String? = url.takeIf { it.startsWith("https://") || it.startsWith("http://") }

@Composable
private fun NativeTv(player: ExoPlayer, spectrum:PcmSpectrum, activity: Int, foreground:Boolean, diagnostic:Boolean, onHidden: (Boolean)->Unit) {
    val api = remember { HouseMixClient(BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_ANON_KEY) }
    var startup by remember { mutableStateOf(true) }
    var entryPending by remember { mutableStateOf(true) }
    var guestName by remember { mutableStateOf("Visitante") }
    var guestAvatar by remember { mutableIntStateOf(R.drawable.visitor_avatar) }
    var startupStage by remember { mutableStateOf("carregando dados da rádio") }
    var station by remember { mutableStateOf<StationBootstrap?>(null) }
    var payload by remember { mutableStateOf<JSONObject?>(null) }
    var track by remember { mutableStateOf<JSONObject?>(null) }
    var artistArtwork by remember { mutableStateOf("") }
    var incomingTrack by remember { mutableStateOf<JSONObject?>(null) }
    var incomingStart by remember { mutableLongStateOf(0L) }
    val sync=remember{NativeSmartSync<JSONObject>()}
    var syncStatus by remember{mutableStateOf(SyncStatus())}
    var syncEpoch by remember{mutableLongStateOf(0L)}
    var trackStart by remember { mutableLongStateOf(0L) }
    var trackLocalStart by remember { mutableLongStateOf(0L) }
    var fadeRequest by remember { mutableIntStateOf(0) }
    var smartQueue by remember { mutableStateOf<List<JSONObject>>(emptyList()) }
    var smartIndex by remember { mutableIntStateOf(0) }
    var smartSerial by remember { mutableIntStateOf(0) }
    var smartFailures by remember { mutableIntStateOf(0) }
    var smartAttempt by remember { mutableStateOf("") }
    var screen by remember { mutableStateOf(Screen.PROFILE) }
    var mosaic by remember { mutableStateOf(false) }
    var mosaicReturn by remember { mutableStateOf<StationChannel?>(null) }
    var returnScreen by remember { mutableStateOf(Screen.HOME) }
    var leavingScreen by remember { mutableStateOf(false) }
    var videoTrayFocused by remember { mutableStateOf(false) }
    var failure by remember { mutableStateOf<String?>(null) }
    var playerError by remember { mutableStateOf<String?>(null) }
    var retry by remember { mutableIntStateOf(0) }
    var playing by remember(player) { mutableStateOf(player.isPlaying) }
    var buffering by remember(player) { mutableStateOf(player.playbackState==Player.STATE_BUFFERING) }
    var selected by remember { mutableStateOf<StationChannel?>(null) }
    var audioIntent by remember { mutableStateOf(true) }
    var controls by remember { mutableStateOf(true) }
    var interaction by remember { mutableStateOf(false) }
    var notice by remember { mutableStateOf<String?>(null) }
    var campaigns by remember { mutableStateOf<List<JSONObject>>(emptyList()) }
    var campaignsReady by remember { mutableStateOf(false) }
    var pendingWatch by remember { mutableStateOf<Triple<StationChannel,Screen,Boolean>?>(null) }
    var sponsorUrls by remember { mutableStateOf<List<String>>(emptyList()) }
    var weather by remember { mutableStateOf<JSONObject?>(null) }
    val context=LocalContext.current
    val prefs=remember { context.getSharedPreferences("native_tv_settings",0) }
    val syncKey="smart_sync_ms:"+BuildConfig.STATION_SLUG+":"+selected?.id.orEmpty()
    var manualSync by remember(syncKey){mutableStateOf<Long?>(null)}
    fun saveSync(delayMs:Long?){
        if(delayMs==null)prefs.edit().remove(syncKey).apply()else prefs.edit().putLong(syncKey,delayMs.coerceIn(0L,120000L)).apply()
        manualSync=delayMs?.coerceIn(0L,120000L)
    }
    fun calibrateNow(){
        if(!player.isPlaying)return
        val start=sync.latestStart()?:return
        val delta=System.currentTimeMillis()+api.serverClockOffsetMs-start
        if(delta in 0L..120000L)saveSync(delta)
    }
    val services=remember { NativeServices(api,context) }
    val scope=rememberCoroutineScope()

    fun transition(action:()->Unit){
        if(leavingScreen)return
        if(screen==Screen.PROFILE||screen==Screen.AUDIO){leavingScreen=true;scope.launch{delay(240);action();leavingScreen=false}}else action()
    }
    var account by remember { mutableStateOf<JSONObject?>(null) }
    var listenerProfile by remember(account.str("id"),station?.ownerId){mutableStateOf<JSONObject?>(null)}
    var selectedProfileId by remember(account.str("id"),station?.ownerId){mutableStateOf("")}
    LaunchedEffect(account.str("id"),station?.ownerId){val user=account.str("id");val owner=station?.ownerId?:return@LaunchedEffect;if(user.isNotBlank())try{listenerProfile=services.listenerProfile(owner,user)}catch(e:CancellationException){throw e}catch(_:Exception){}}
    val mainProfileName=listenerProfile.str("nome").ifBlank{nativeGoogleName(account)}.ifBlank{guestName}
    val mainAvatar=if(account!=null)nativeProfileAvatar(nativeGooglePhoto(account).ifBlank{listenerProfile.str("avatar_url")})else guestAvatar
    val selectedProfile=listenerProfile.rows("sub_profiles").firstOrNull{it.str("id")==selectedProfileId}
    val displayProfileName=selectedProfile.str("name").ifBlank{mainProfileName}
    val displayAvatar=if(selectedProfile!=null)nativeProfileAvatar(selectedProfile.str("avatar_url"))else mainAvatar
    var ad by remember { mutableStateOf<JSONObject?>(null) }
    var resumeAfterAd by remember { mutableStateOf(true) }
    val prerollFrequency=remember{NativePrerollFrequency()}
    var activeAdPlacement by remember{mutableStateOf("")}
    LaunchedEffect(Unit){try{account=services.restore()}catch(e:CancellationException){throw e}catch(_:Exception){services.clear()}}
    var location by remember { mutableStateOf(readWeatherLocation(prefs)) }
    var cep by remember { mutableStateOf(prefs.getString("cep","").orEmpty()) }
    var panel by remember { mutableStateOf<String?>(null) }
    var scheduleOpening by remember { mutableStateOf(false) }
    var interactionReturn by remember { mutableIntStateOf(0) }
    var fromInteraction by remember { mutableStateOf(false) }
    fun closePanel(){if(fromInteraction){interactionReturn++;controls=true};fromInteraction=false;panel=null;interaction=false}
    var forecast by remember { mutableStateOf<JSONObject?>(null) }
    var lyrics by remember { mutableStateOf<String?>(null) }
    var history by remember { mutableStateOf<List<JSONObject>>(emptyList()) }
    var historyLoading by remember { mutableStateOf(false) }
    var historyError by remember { mutableStateOf(false) }
    var historyFetchedAt by remember { mutableLongStateOf(0L) }
    var historyWarmFinished by remember { mutableStateOf(false) }
    val audio = station?.channels.orEmpty().filter { it.type == "audio_live" }
    val video = station?.channels.orEmpty().filter { it.type == "video_live" }
    val stationName = station?.name ?: BuildConfig.STATION_NAME

    var playbackAttempt by remember { mutableIntStateOf(0) }
    var recoveryCount by remember { mutableIntStateOf(0) }
    var totalRecoveries by remember{mutableIntStateOf(0)}
    var musicReads by remember{mutableIntStateOf(0)}
    var verifiedWakes by remember{mutableIntStateOf(0)}
    var musicMode by remember{mutableStateOf("Consulta 2s")}
    var lastMusicResponse by remember{mutableLongStateOf(0L)}
    var lastMusicRtt by remember{mutableLongStateOf(0L)}
    var forcePolling by remember{mutableStateOf(prefs.getBoolean("music_force_polling",false))}
    fun liveItem(channel:StationChannel):MediaItem {
        val url=channel.url.trim()
        val item=MediaItem.Builder().setMediaId(channel.id).setUri(url)
        if(url.contains(".m3u8",ignoreCase=true))item.setMimeType(MimeTypes.APPLICATION_M3U8)
        return item.build()
    }
    fun resumeLive(autoplay:Boolean) {
        if(player.mediaItemCount==0)return
        if(player.playbackState==Player.STATE_IDLE || player.playbackState==Player.STATE_ENDED || player.playerError!=null) {
            sync.resetPlayback();syncEpoch=0L
            selected?.let{player.setMediaItem(liveItem(it))};player.prepare()
        }
        playerError=null
        if(autoplay&&!player.isPlaying){player.volume=0f;fadeRequest++}
        player.playWhenReady=autoplay
        if(autoplay) playbackAttempt++
    }
    fun smartMediaFor():List<JSONObject>{
        val date=LocalDate.now(brasilia).toString();val program=nativeCurrentProgram(payload).str("id")
        val media=campaigns.filter{it.str("start_date")<=date&&it.str("end_date")>=date&&(it.strings("program_ids").isEmpty()||program in it.strings("program_ids"))}.sortedBy{it.str("id")}.flatMap{it.rows("media")}.filter{it.str("url").startsWith("https://")}
        return smartBreakVideoMedia(media)
    }
    fun select(channel: StationChannel, destination: Screen, autoplay: Boolean = true, allowCampaignWait:Boolean=true) {
        mosaic=false
        val watch=destination==Screen.AUDIO||destination==Screen.VIDEO
        val now=System.currentTimeMillis()
        val date=LocalDate.now(brasilia).toString()
        val program=nativeCurrentProgram(payload).str("id")
        val placement=if(channel.type=="audio_live")"preroll_audio" else "preroll_video"
        val eligible=watch&&autoplay&&prerollFrequency.eligible(placement,channel.id,now)
        if(watch&&autoplay&&!campaignsReady&&allowCampaignWait){pendingWatch=Triple(channel,destination,autoplay);return}
        pendingWatch=null
        val candidates=if(eligible) campaigns.filter{it.str("start_date")<=date&&it.str("end_date")>=date&&(it.strings("program_ids").isEmpty()||program in it.strings("program_ids"))}.sortedBy{it.str("id")}.flatMap{it.rows("media")}.filter{it.str("placement")==placement&&it.str("url").startsWith("https://")} else emptyList()
        val entryTrack=incomingTrack?:track
        val entryStart=if(incomingTrack!=null)incomingStart else trackStart
        val directSmart=if(watch&&autoplay&&isNativeBreak(entryTrack)&&smartBreakTiming(entryStart,entryTrack?.optDouble("duracao",0.0)?:0.0,now+api.serverClockOffsetMs)?.second!=0L)smartMediaFor()else emptyList()
        val nextAd=if(directSmart.isNotEmpty())null else candidates.getOrNull(if(candidates.isEmpty())0 else ((now/300000)%candidates.size).toInt())
        // Live must not wait on the commercial API.
        if(nextAd!=null)player.pause()
        smartQueue=emptyList()
        if(selected?.id!=channel.id||selected?.url!=channel.url||player.mediaItemCount==0||player.playerError!=null){
            sync.resetPlayback();syncEpoch=0L
            player.setMediaItem(liveItem(channel));selected=channel;recoveryCount=0
            android.util.Log.i("NexoPlayback","SELECT "+channel.type+" host="+android.net.Uri.parse(channel.url.trim()).host)
            player.prepare()
        }
        playerError=null;resumeAfterAd=autoplay;ad=nextAd
        if(watch)prerollFrequency.enter(placement,channel.id)
        activeAdPlacement=if(nextAd!=null)placement else ""
        if(watch)android.util.Log.i("NexoPlayback","PREROLL placement="+placement+" eligible="+eligible+" campaignsReady="+campaignsReady+" candidates="+candidates.size)
        screen=destination;controls=true
        resumeLive(autoplay&&nextAd==null)
        if(directSmart.isNotEmpty()){
            smartAttempt=channel.id+":"+(if(entryStart>0)entryStart else trackLocalStart);smartIndex=0;smartFailures=0;smartSerial++;smartQueue=directSmart;player.volume=0f
        }else if(destination==Screen.AUDIO&&autoplay&&nextAd==null){player.volume=0f;fadeRequest++}
    }
    LaunchedEffect(pendingWatch){
        val request=pendingWatch?:return@LaunchedEffect
        withTimeoutOrNull(700L){while(!campaignsReady)delay(50)}
        if(pendingWatch==request)select(request.first,request.second,request.third,false)
    }
    fun toggle() {
        if (selected == null) { audio.firstOrNull()?.let { select(it,screen) }; return }
        if (player.playWhenReady && player.playbackState != Player.STATE_ENDED && playerError == null) {
            player.pause()
        } else {
            recoveryCount=0
            resumeLive(true)
        }
        if (selected?.type == "audio_live") audioIntent = player.playWhenReady
    }
    fun home() {
        mosaic=false
        pendingWatch=null;ad=null;smartQueue=emptyList();prerollFrequency.home()
        if (selected?.type == "video_live" || selected==null) {
            sync.resetPlayback();syncEpoch=0L
            player.stop(); player.clearMediaItems(); selected = null
            audio.firstOrNull()?.let { select(it,Screen.HOME,audioIntent) }
        }
        screen = Screen.HOME
        interaction = false
    }
    fun openPage(destination: Screen) {
        pendingWatch=null
        returnScreen = screen
        screen = destination
        interaction = false
        controls = true
    }
    LaunchedEffect(scheduleOpening){if(scheduleOpening){withFrameNanos{};withFrameNanos{};if(scheduleOpening){panel="schedule";scheduleOpening=false;controls=true;interaction=false}}}
    fun back() {
        if (ad!=null) return
        if(pendingWatch!=null){pendingWatch=null;return}
        if (notice != null) notice = null
        else if (panel != null) closePanel()
        else if(scheduleOpening){scheduleOpening=false}
        else if (startup || entryPending) return
        else if (interaction) {interaction = false;interactionReturn++}
        else if (screen in listOf(Screen.SCHEDULE,Screen.HISTORY,Screen.PROFILE,Screen.SEARCH,Screen.CATALOG)) screen = returnScreen
        else home()
    }
    fun animatedBack(){if(ad==null&&pendingWatch==null&&panel==null&&notice==null&&!interaction&&!scheduleOpening&&!entryPending)transition{back()}else back()}
    BackHandler(ad!=null || pendingWatch!=null || screen != Screen.HOME || interaction || notice != null || panel != null) { animatedBack() }
    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onMetadata(metadata:Metadata){
                if(!player.isPlaying)return
                var title="";var artist=""
                for(i in 0 until metadata.length())when(val entry=metadata.get(i)){
                    is IcyInfo->title=entry.title.orEmpty()
                    is TextInformationFrame->when(entry.id){
                        "TIT2","TT2"->title=entry.values.firstOrNull().orEmpty()
                        "TPE1","TP1"->artist=entry.values.firstOrNull().orEmpty()
                    }
                }
                if(title.isNotBlank())sync.timedMetadata(SyncSignal(title,artist,player.currentPosition,System.currentTimeMillis()))
            }
            override fun onIsPlayingChanged(isPlaying: Boolean) { playing = isPlaying; if(isPlaying){playerError=null;android.util.Log.i("NexoPlayback","LIVE_PLAYING")} }
            override fun onPlaybackStateChanged(playbackState: Int) { buffering = playbackState == Player.STATE_BUFFERING;android.util.Log.i("NexoPlayback","STATE="+playbackState+" requested="+player.playWhenReady) }
            override fun onPlaybackSuppressionReasonChanged(playbackSuppressionReason:Int){android.util.Log.w("NexoPlayback","SUPPRESSION="+playbackSuppressionReason)}
            override fun onPlayerError(error: PlaybackException) {
                android.util.Log.w("NexoPlayback",error.errorCodeName,error)
                val cause=generateSequence<Throwable>(error){it.cause}.take(8).toList()
                val http=cause.filterIsInstance<HttpDataSource.InvalidResponseCodeException>().firstOrNull()?.responseCode
                val detail=http?.let{"HTTP "+it}?:cause.last().javaClass.simpleName
                android.util.Log.w("NexoPlayback","LIVE_FAILURE code="+error.errorCodeName+" detail="+detail+" channel="+selected?.type)
                playerError = "Sinal indisponível ("+error.errorCodeName+" · "+detail+"). Pressione Play para tentar novamente."
            }
        }
        player.addListener(listener)
        onDispose { player.removeListener(listener) }
    }
    LaunchedEffect(retry) {
        failure = null
        startup = true
        startupStage = "carregando dados da rádio"
        withFrameNanos { }
        withFrameNanos { }
        val cacheKey="station_bootstrap:"+BuildConfig.STATION_SLUG
        if(station==null){runCatching{val cached=JSONObject(prefs.getString(cacheKey,"").orEmpty());val cachedAt=prefs.getLong(cacheKey+":at",0);if(System.currentTimeMillis()-cachedAt in 0L..86400000L){val cachedStation=StationBootstrap.fromJson(cached);if(cachedStation.ownerId.isNotBlank()){payload=cached;station=cachedStation}}}}
        try {
            val data = api.stationPayload(BuildConfig.STATION_SLUG)
            val resolved=StationBootstrap.fromJson(data)
            check(resolved.ownerId.isNotBlank())
            val changedOwner=station?.ownerId!=resolved.ownerId
            if(changedOwner){sync.clear();track=null;artistArtwork="";trackStart=0L;trackLocalStart=0L;incomingTrack=null;incomingStart=0L;if(selected!=null){player.stop();player.clearMediaItems();selected=null}}
            station = resolved
            payload = data
            prefs.edit().putString(cacheKey,data.toString()).putLong(cacheKey+":at",System.currentTimeMillis()).apply()
            incomingTrack=data.optJSONObject("musicData")
            incomingStart=nativeEpoch(data.opt("musicStartTime")?:incomingTrack?.opt("startTime")?:incomingTrack?.opt("startedAt"))
            incomingTrack?.let{sync.accept(SyncTrack(it.str("titulo"),it.str("artista"),incomingStart,System.currentTimeMillis(),it,data.str("musicDeezerArtistImg").ifBlank{it.str("capa")}))}
        } catch (e: CancellationException) { throw e }
        catch (_: Exception) { if(station==null){failure = "Não foi possível carregar a emissora."; startup = false} }
    }
    LaunchedEffect(station?.ownerId) {
        val owner = station?.ownerId ?: return@LaunchedEffect
        startupStage = "preparando áudio"
        val startupAudio=audio.firstOrNull()
        if(startupAudio!=null && selected==null) {
            select(startupAudio,Screen.PROFILE,false)
            // Wait for real buffered media, bounded for live streams and slow networks.
            withTimeoutOrNull(3_000L) {
                while(playerError==null && player.bufferedPosition-player.currentPosition<10_000L) {
                    delay(100)
                }
            }
        }
        screen = Screen.PROFILE
        startupStage="sincronizando música no ar"
        // Keep the prepared stream silent throughout splash and cover warmup.
        startup = false
        delay(650)
        if(entryPending&&screen==Screen.PROFILE&&selected?.type=="audio_live"&&audioIntent)resumeLive(true)
    }
    LaunchedEffect(station?.ownerId,foreground,forcePolling){
        val owner=station?.ownerId?:return@LaunchedEffect
        if(!foreground)return@LaunchedEffect
        val proof=MusicReadGuard()
        val wake=if(forcePolling)null else NativeMusicWake(api,owner)
        var waiting=0L;var errors=0;var expected:MusicEvent?=null;var expectedAt=0L;var previous:MusicEvent?=null
        var lastCall=0L
        try{while(true){
            val signal=if(wake!=null)wake.await(waiting)else{delay(waiting);null}
            val elapsed=android.os.SystemClock.elapsedRealtime()
            if(signal!=null){if(signal.reset){proof.reset();expected=null}else{expected=signal.event;expectedAt=elapsed}}
            if(wake!=null&&!wake.healthy()){proof.reset();expected=null;wake.reconnectIfNeeded()}
            val pause=(1000L-(elapsed-lastCall)).coerceAtLeast(0L);if(pause>0)delay(pause)
            lastCall=android.os.SystemClock.elapsedRealtime()
            try{
                musicReads++
                val data=api.nowPlaying(BuildConfig.STATION_SLUG)
                check(data.str("userId")==owner)
                lastMusicRtt=android.os.SystemClock.elapsedRealtime()-lastCall;lastMusicResponse=System.currentTimeMillis();errors=0
                val next=data.optJSONObject("musicData")?:data.str("musica").takeIf{it.isNotBlank()}?.let{JSONObject().put("titulo",it).put("artista",data.str("artista")).put("capa",data.str("capa")).put("duracao",data.optDouble("duracao",0.0))}
                if(next!=null&&next.str("titulo").isNotBlank()){
                    val start=nativeEpoch(data.opt("musicStartTime")?:next.opt("startTime")?:next.opt("startedAt"))
                    val event=MusicEvent(next.str("titulo"),next.str("artista"),start)
                    if(start<=0L||incomingStart<=0L||start>=incomingStart){
                        if(previous!=null&&!event.matches(previous!!)){val verified=expected?.matches(event)==true&&android.os.SystemClock.elapsedRealtime()-expectedAt<=8000;proof.observe(verified);if(verified)verifiedWakes++;expected=null}
                        previous=event
                        if(incomingTrack?.toString()!=next.toString()||incomingStart!=start){incomingTrack=next;incomingStart=start}
                        sync.accept(SyncTrack(event.title,event.artist,start,System.currentTimeMillis(),next,data.str("musicDeezerArtistImg")))
                    }
                }
                if(expected!=null&&android.os.SystemClock.elapsedRealtime()-expectedAt>8000){expected=null;proof.reset()}
                val dur=incomingTrack?.optDouble("duracao",0.0)?:0.0
                val untilEnd=if(incomingStart>0&&dur>0)incomingStart+(dur*1000).toLong()-(System.currentTimeMillis()+api.serverClockOffsetMs)else Long.MIN_VALUE
                val critical=isNativeBreak(incomingTrack)||untilEnd<=15000L||expected!=null
                waiting=proof.interval(wake?.healthy()==true&&!forcePolling,critical)
                musicMode=if(waiting>2000)"Realtime + segurança 10s" else if(wake?.healthy()==true)"Realtime + segurança 2s" else "Consulta 2s"
                android.util.Log.d("NexoMusicRead","mode=$musicMode calls=$musicReads confirmed=$verifiedWakes rtt=$lastMusicRtt")
            }catch(e:CancellationException){throw e}catch(_:Exception){proof.reset();expected=null;errors++;waiting=(2000L*(1L shl errors.coerceAtMost(3))).coerceAtMost(16000L);musicMode="Reconectando metadados"}
        }}finally{wake?.close()}
    }
    LaunchedEffect(station?.ownerId,incomingTrack.str("titulo"),incomingTrack.str("artista"),incomingStart){
        val owner=station?.ownerId?:return@LaunchedEffect
        val title=incomingTrack.str("titulo");val artist=incomingTrack.str("artista");val start=incomingStart
        if(title.isBlank())return@LaunchedEffect
        while(true){
            try{
                val full=api.stationPayload(BuildConfig.STATION_SLUG)
                if(full.str("userId")==owner){
                    payload=full
                    val current=full.optJSONObject("musicData")
                    val actualStart=nativeEpoch(full.opt("musicStartTime"))
                    if(current.str("titulo")==title&&current.str("artista")==artist&&(start<=0||actualStart==start)){
                        sync.enrich(title,artist,start,full.str("musicDeezerArtistImg").ifBlank{current.str("capa")})
                    }
                }
            }catch(e:CancellationException){throw e}catch(_:Exception){}
            delay(120_000L)
        }
    }
    LaunchedEffect(station?.ownerId) {
        val owner = station?.ownerId ?: return@LaunchedEffect
        campaignsReady=false
        while (true) {
            try { val response=api.campaigns(owner);check(response.optJSONArray("campaigns")!=null);campaigns=response.rows("campaigns");campaignsReady=true;android.util.Log.i("NexoAds","campaigns="+campaigns.size+" home="+campaigns.flatMap{it.rows("media")}.count{it.str("placement")=="home_banner"}) }
            catch (e: CancellationException) { throw e }
            catch (_: Exception) { /* retain last successful list */ }
            delay(if(campaignsReady)60_000L else 5_000L)
        }
    }
    suspend fun refreshHistory(owner:String){
        if(historyLoading)return
        historyLoading=true;historyError=false
        try{val data=api.recentMusic(owner);check(data.optBoolean("ok"));history=deduplicateNativeHistory(data.rows("items")).take(50);historyFetchedAt=System.currentTimeMillis()}
        catch(e:CancellationException){throw e}catch(_:Exception){historyError=true}finally{historyLoading=false}
    }
    LaunchedEffect(station?.ownerId){
        val owner=station?.ownerId?:return@LaunchedEffect
        historyWarmFinished=false
        try{val key="history_cache:"+owner;runCatching{val cached=org.json.JSONArray(prefs.getString(key,"[]"));history=(0 until cached.length()).mapNotNull{cached.optJSONObject(it)}};refreshHistory(owner);if(history.isNotEmpty())prefs.edit().putString(key,org.json.JSONArray(history).toString()).apply();while(startup)delay(200);for(batch in history.take(50).chunked(2)){coroutineScope{batch.map{song->async{resolveHistoryCover(context,song,track)}}.awaitAll()};delay(300)}}finally{historyWarmFinished=true}
    }
    LaunchedEffect(panel,station?.ownerId){if(panel in listOf("history","search")){val owner=station?.ownerId?:return@LaunchedEffect;if(System.currentTimeMillis()-historyFetchedAt>60_000L)refreshHistory(owner)}}
    LaunchedEffect(player,selected?.id,startup,ad,foreground,mosaic,playbackAttempt){
        if(startup||ad!=null||!foreground||mosaic||selected==null)return@LaunchedEffect
        var position=player.currentPosition;var stalledAt=0L;var nextRetry=0L
        while(true){
            delay(1000)
            val now=android.os.SystemClock.elapsedRealtime();val current=player.currentPosition
            if(!player.playWhenReady||player.playbackSuppressionReason!=Player.PLAYBACK_SUPPRESSION_REASON_NONE){stalledAt=0L;position=current;continue}
            if(player.isPlaying&&current>position+100){stalledAt=0L;recoveryCount=0;nextRetry=0;playerError=null}
            else{if(stalledAt==0L)stalledAt=now;val expired=now-stalledAt>=8000L||player.playerError!=null||player.playbackState==Player.STATE_ENDED
                if(expired&&now>=nextRetry&&nativeNetworkAvailable(context)){
                    recoveryCount++;totalRecoveries++;nextRetry=now+(2000L*(1L shl recoveryCount.coerceAtMost(4))).coerceAtMost(30000L)
                    android.util.Log.w("NexoPlayback","SMART_RECOVERY="+recoveryCount)
                    val ch=selected?:continue;sync.resetPlayback();syncEpoch=0L;player.setMediaItem(liveItem(ch));player.prepare();player.play();stalledAt=now
                }else if(expired)playerError=if(nativeNetworkAvailable(context))"Reconectando ao sinal…" else "Sem conexão. Reconectando automaticamente…"
            };position=current
        }
    }
    LaunchedEffect(player){
        val window=androidx.media3.common.Timeline.Window()
        while(true){
            val now=System.currentTimeMillis()
            val serverNow=now+api.serverClockOffsetMs
            val pdt=runCatching{
                if(!player.isPlaying||!player.isCurrentMediaItemLive||player.currentTimeline.isEmpty)null else {
                    player.currentTimeline.getWindow(player.currentMediaItemIndex,window)
                    window.windowStartTimeMs.takeIf{it>0}?.plus(player.currentPosition)
                }
            }.getOrNull()
            val result=sync.resolve(now,serverNow,player.currentPosition,player.isPlaying,pdt,manualSync)
            if(syncStatus.mode!=result.status.mode)android.util.Log.i("NexoSmartSync",result.status.mode)
            syncStatus=result.status
            syncEpoch=result.epoch?:0L
            result.track?.let{item->
                val changed=trackStart!=item.start||track.str("titulo")!=item.title||track.str("artista")!=item.artist
                if(track!==item.content&&track?.toString()!=item.content.toString())track=item.content
                artistArtwork=item.artwork;trackStart=item.start
                if(changed||trackLocalStart==0L)trackLocalStart=if(item.start>0&&result.epoch!=null)now-(result.epoch-item.start).coerceAtLeast(0L)else now
            }
            delay(250)
        }
    }
    LaunchedEffect(player,playing,fadeRequest,smartQueue.isNotEmpty()){
        if(playing&&smartQueue.isEmpty()){
            val initial=player.volume.coerceIn(0f,1f)
            if(initial<1f)for(step in 1..20){player.volume=initial+(1f-initial)*step/20f;delay(50)}
        }
    }
    val watch = screen == Screen.AUDIO || screen == Screen.VIDEO
    val sourceBreak=if(isNativeBreak(incomingTrack)&&smartBreakTiming(incomingStart,incomingTrack?.optDouble("duracao",0.0)?:0.0,System.currentTimeMillis()+api.serverClockOffsetMs)?.second!=0L)incomingTrack else null
    val breakActive=isNativeBreak(track)||(smartQueue.isNotEmpty()&&sourceBreak!=null)
    val breakMetadata=if(isNativeBreak(track))track else sourceBreak
    val breakStart=if(isNativeBreak(track))trackStart else incomingStart
    val breakDuration=breakMetadata?.optDouble("duracao",0.0)?:0.0
    val breakId=selected?.id.orEmpty()+":"+(if(breakStart>0)breakStart else trackLocalStart)
    val hasSyncEpoch by remember{derivedStateOf{syncEpoch>0}}
    LaunchedEffect(watch,breakActive,breakId,ad,campaigns,playing,hasSyncEpoch){
        if(!watch||!breakActive){smartAttempt="";smartQueue=emptyList();return@LaunchedEffect}
        if(ad!=null||!playing||smartQueue.isNotEmpty()||smartAttempt==breakId)return@LaunchedEffect
        if(smartBreakTiming(breakStart,breakDuration,System.currentTimeMillis()+api.serverClockOffsetMs)?.second==0L)return@LaunchedEffect
        val queue=selected?.let{smartMediaFor()}.orEmpty()
        if(queue.isNotEmpty()){smartAttempt=breakId;smartIndex=0;smartFailures=0;smartSerial++;smartQueue=queue;player.volume=0f}
    }
    LaunchedEffect(smartQueue.isNotEmpty(),breakDuration,breakStart){
        while(smartQueue.isNotEmpty()&&breakStart>0&&breakDuration>0){
            if(smartBreakTiming(breakStart,breakDuration,System.currentTimeMillis()+api.serverClockOffsetMs)?.second==0L){smartQueue=emptyList();break}
            delay(250)
        }
    }
    LaunchedEffect(smartQueue.isNotEmpty()){
        if(smartQueue.isEmpty()){if(player.isPlaying){player.volume=0f;fadeRequest++}else player.volume=1f}
    }
    LaunchedEffect(screen,activity,interaction,notice,panel,buffering,playerError,playing,scheduleOpening,interactionReturn,videoTrayFocused) {
        controls = true
        if (watch && !videoTrayFocused && !scheduleOpening && !interaction && notice == null && panel == null && (screen == Screen.AUDIO || (playing && !buffering && playerError == null))) {
            delay(8000)
            controls = false
        }
    }
    SideEffect { onHidden(!mosaic && watch && ad==null && !controls && !interaction && notice == null && panel == null) }
    LaunchedEffect(screen,controls,panel,interaction){if(screen!=Screen.VIDEO||!controls||panel!=null||interaction)videoTrayFocused=false}
    val chrome by animateFloatAsState(if(controls) 1f else 0f, tween(350),label="watchChrome")
    val data = payload
    var programMinute by remember{mutableStateOf(ZonedDateTime.now(brasilia).withSecond(0).withNano(0))}
    LaunchedEffect(Unit){while(true){delay(1000);programMinute=ZonedDateTime.now(brasilia).withSecond(0).withNano(0)}}
    val currentProgram=remember(data,programMinute){nativeCurrentProgram(data,programMinute)}
    val currentPresenter=remember(data,currentProgram){val ids=currentProgram.strings("apresentadores_ids").ifEmpty{listOf(currentProgram.str("apresentador_id"))};data.rows("apresentadores").firstOrNull{it.str("id") in ids}?:data?.optJSONObject("currentPresenter")}
    LaunchedEffect(station?.ownerId,currentProgram.str("id")) {
        sponsorUrls = emptyList()
        val owner=station?.ownerId ?: return@LaunchedEffect
        val id=currentProgram.str("id").takeIf{it.isNotBlank()} ?: return@LaunchedEffect
        while(true) {
            try {
                val now=ZonedDateTime.now(brasilia)
                val day=now.format(DateTimeFormatter.ofPattern("EEEE",Locale("pt","BR"))).replace("-feira","").replaceFirstChar{it.titlecase()}
                val data=api.sponsors(owner,now.toLocalDate().toString(),day,now.format(DateTimeFormatter.ofPattern("HH:mm")))
                if(data.optBoolean("ok") && data.optJSONObject("currentProgram").str("id")==id) {
                    sponsorUrls=data.rows("sponsorLogos").mapNotNull { row ->
                        val url=row.str("logo_url")
                        when {
                            url.contains("default-sponsor-logo.png")->null
                            url.startsWith("/")&&!url.startsWith("//")->"https://housemix.nexobrasil.net"+url
                            else->safeImage(url)
                        }
                    }.distinct()
                }
            } catch(e:CancellationException){throw e} catch(_:Exception){}
            delay(60_000)
        }
    }
    LaunchedEffect(station?.ownerId,location) {
        weather=null
        val owner=station?.ownerId ?: return@LaunchedEffect
        while(true){
            try {
                val data=api.weather(owner,location)
                if(data.optBoolean("ok")) { forecast=data.optJSONObject("data"); weather=forecast?.optJSONObject("current") }
            }catch(e:CancellationException){throw e}catch(_:Exception){}
            delay(300_000)
        }
    }
    var sponsorIndex by remember(sponsorUrls){mutableIntStateOf(0)}
    LaunchedEffect(sponsorUrls){if(sponsorUrls.size>1)while(true){delay(4000);sponsorIndex=(sponsorIndex+1)%sponsorUrls.size}}

    val stationDate = programMinute.toLocalDate().toString()
    val banners = remember(campaigns,currentProgram?.str("id"),stationDate) {
        campaigns.filter { it.str("start_date") <= stationDate && it.str("end_date") >= stationDate &&
            (it.strings("program_ids").isEmpty() || currentProgram?.str("id") in it.strings("program_ids")) }
            .sortedBy{it.str("id")}.flatMap { it.rows("media") }.filter { it.str("placement") == "home_banner" && safeImage(it.str("url"))!=null }
    }
    val eligibleInteractionAds=remember(campaigns,stationDate,currentProgram.str("id")){nativeInteractionAds(campaigns,stationDate,currentProgram.str("id"))}
    val historyAd=eligibleInteractionAds["history_ads"]?.firstOrNull()
    val panelPlacement=nativeInteractionPlacement(panel)
    val panelAds=eligibleInteractionAds[panelPlacement].orEmpty()
    val panelAdIdentity=panelAds.map{it.str("url")+"|"+it.str("link")}
    var panelAdIndex by remember(panel,panelAdIdentity){mutableIntStateOf(0)}
    LaunchedEffect(panel,panelAdIdentity){if(panel!="chat"&&panelAds.size>1)while(true){delay(300000L);panelAdIndex=(panelAdIndex+1)%panelAds.size}}
    val panelAd=panelAds.getOrNull(panelAdIndex)
    val interactionPreload=eligibleInteractionAds.values.flatten().mapNotNull{safeImage(it.str("url"))}.distinct().take(10)
    LaunchedEffect(interactionPreload){for(url in interactionPreload)context.imageLoader.enqueue(ImageRequest.Builder(context).data(url).size(600,240).build())}
    val backgroundAds=campaigns.filter{it.str("start_date")<=stationDate&&it.str("end_date")>=stationDate&&(it.strings("program_ids").isEmpty()||currentProgram.str("id") in it.strings("program_ids"))}.flatMap{it.rows("media")}.filter{it.str("placement")=="background_ads"}
    val bannerIdentity=banners.map{it.str("url")+"|"+it.str("link")}
    LaunchedEffect(bannerIdentity,campaignsReady){if(campaignsReady)android.util.Log.i("NexoAds","eligible home banners="+banners.size+" history="+(historyAd!=null))}
    LaunchedEffect(bannerIdentity){for(media in banners.take(4)){val url=safeImage(media.str("url"))?:continue;context.imageLoader.enqueue(ImageRequest.Builder(context).data(url).size(1120,280).build())}}
    var bannerIndex by remember(bannerIdentity) { mutableIntStateOf(0) }
    var bannerQr by remember { mutableStateOf(false) }
    LaunchedEffect(bannerIdentity,bannerQr) { if (!bannerQr&&banners.size>1) while(true) { delay(300000); bannerIndex=(bannerIndex+1)%banners.size } }
    val homeAdBlocked by rememberUpdatedState(interaction||panel!=null||notice!=null)
    val latestBackgroundAds by rememberUpdatedState(backgroundAds.map{it.str("url")}.filter{safeImage(it)!=null}.distinct())
    var visibleBackgroundAd by remember { mutableStateOf("") }
    var backgroundAdEndsAt by remember { mutableLongStateOf(0L) }
    LaunchedEffect(screen,entryPending,station?.ownerId) {
        visibleBackgroundAd="";backgroundAdEndsAt=0L
        if(screen!=Screen.HOME||entryPending)return@LaunchedEffect
        var index=0
        while(true){
            delay(60_000L)
            while(latestBackgroundAds.isEmpty()||homeAdBlocked)delay(1000)
            val pool=latestBackgroundAds
            backgroundAdEndsAt=android.os.SystemClock.elapsedRealtime()+HOME_BACKGROUND_AD_MS
            visibleBackgroundAd=pool[index%pool.size]
            index++
            delay(HOME_BACKGROUND_AD_MS)
            visibleBackgroundAd="";backgroundAdEndsAt=0L
        }
    }
    LaunchedEffect(panel,track.str("titulo"),track.str("artista")) {
        if(panel=="lyrics"){lyrics=null;try { lyrics=api.lyrics(track.str("titulo"),track.str("artista"),track?.optInt("duracao",0)?:0) } catch(e:CancellationException){throw e} catch(_:Exception){lyrics="Letra indisponível para esta música."}}
    }
    val onChannel: (Int)->Unit = { direction ->
        val list = audio+video
        if (list.isNotEmpty()) {
            val index=list.indexOfFirst { it.id==selected?.id }.coerceAtLeast(0)
            val ch=list[(index+direction+list.size)%list.size]
            val destination=if(ch.type=="video_live") Screen.VIDEO else Screen.AUDIO
            if(screen!=destination)transition{select(ch,destination)}else select(ch,destination)
        }
    }
    Box(Modifier.fillMaxSize()) {
    if(!startup && mosaic && ad==null && smartQueue.isEmpty()) NativeMosaic(video,data,foreground=foreground,onExit={mosaic=false;val ch=mosaicReturn?:video.firstOrNull();if(ch!=null)select(ch,Screen.VIDEO)else home()},onSelect={select(it,Screen.VIDEO)})
    else if(!startup && ad==null && smartQueue.isEmpty()) NativeLayout(
        screen=screen, inputSerial=activity, station=station, stationName=stationName, payload=data, track=track,
        program=currentProgram,presenter=currentPresenter,artistArtwork=artistArtwork,backgroundAd=visibleBackgroundAd.takeIf{screen==Screen.HOME&&it in latestBackgroundAds}.orEmpty(),bannerLink=banners.getOrNull(bannerIndex).takeIf{it?.optBoolean("clickable")==true}.str("link"),bannerQr=bannerQr,onBannerQr={bannerQr=it},player=player,playing=playing,buffering=buffering,
        failure=failure,playerError=playerError,controls=controls,chrome=chrome,interaction=interaction,
        banner=banners.getOrNull(bannerIndex).str("url"),historyAd=historyAd,panelAd=panelAd,chatAds=eligibleInteractionAds["chat_ads"].orEmpty(),backgroundAdEndsAt=backgroundAdEndsAt,sponsor=sponsorUrls.getOrNull(sponsorIndex),weather=weather,history=history,historyLoading=historyLoading,historyError=historyError,
        notice=notice,video=video,selected=selected, onRetry={retry++},onToggle=::toggle,onBack=::animatedBack,leavingScreen=leavingScreen,onVideoTrayFocus={videoTrayFocused=it},
        entryPending=entryPending, guestName=displayProfileName, guestAvatar=guestAvatar, displayAvatar=displayAvatar, mainProfileName=mainProfileName, mainAvatar=mainAvatar, listenerProfile=listenerProfile, onListenerProfile={listenerProfile=it}, onSelectProfile={selectedProfileId=it},
        spectrum=spectrum, panel=panel,forecast=forecast,lyrics=lyrics,cep=cep,api=api,services=services,account=account,
        onAccount={account=it;panel=null},onLogout={scope.launch{try{services.logout();account=null}catch(e:CancellationException){throw e}catch(_:Exception){notice="Não foi possível encerrar a sessão."}}},
        scheduleOpening=scheduleOpening,interactionReturn=interactionReturn,channelOpening=pendingWatch?.second,syncStatus=syncStatus,manualSync=manualSync,onSaveSync=::saveSync,onCalibrateSync=::calibrateNow,canCalibrateSync=playing&&sync.latestStart()?.let{System.currentTimeMillis()+api.serverClockOffsetMs-it in 0L..120000L}==true,
        onPanel={next->if(next==null)closePanel()else{fromInteraction=interaction;panel=next;interaction=false}},onCepSaved={digits,loc -> prefs.edit().putString("cep",digits).putString("location",loc.toString()).apply();cep=digits;location=loc;panel=null},
        onGuestSave={name,avatar -> guestName=name;guestAvatar=avatar},
        onProfileContinue={transition{
            if(entryPending) {
                entryPending=false
                screen=Screen.HOME
                if(selected?.type=="audio_live") resumeLive(audioIntent) else audio.firstOrNull()?.let{select(it,Screen.HOME,audioIntent)}
            } else screen=returnScreen
        }},
        onOpen={destination ->
            val navigate:()->Unit={when(destination) {
                Screen.HOME -> home()
                Screen.AUDIO -> { if(audio.isEmpty()) notice="Canal de áudio indisponível" else select(audio.first(),Screen.AUDIO,audioIntent) }
                Screen.VIDEO -> { if(video.isEmpty()) notice="Canal de vídeo indisponível" else { if(selected?.type=="audio_live") audioIntent=player.playWhenReady; select(video.first(),Screen.VIDEO) } }
                Screen.SEARCH -> { fromInteraction=false;panel="search";interaction=false }
                Screen.SCHEDULE -> { if(!scheduleOpening)scheduleOpening=true }
                Screen.HISTORY -> { panel="history";interaction=false }
                else -> openPage(destination)
            }}
            if(destination in listOf(Screen.HOME,Screen.PROFILE,Screen.VIDEO,Screen.CATALOG))transition(navigate) else navigate()
        },onChannel=onChannel,onVideo={select(it,Screen.VIDEO)},onMosaic={if(video.size>1){mosaicReturn=selected;pendingWatch=null;ad=null;smartQueue=emptyList();player.pause();player.stop();player.clearMediaItems();selected=null;sync.resetPlayback();syncEpoch=0L;mosaic=true}},onInteraction={if(interaction){interaction=false;interactionReturn++}else interaction=true},
        onNotice={notice=it})
    ad?.let{media->NativePreroll(media,selected?.type=="audio_live",onStarted={prerollFrequency.played(activeAdPlacement,System.currentTimeMillis())},onFinish={ad=null;activeAdPlacement="";scope.launch { withFrameNanos { };resumeLive(resumeAfterAd) }})}
    val activeSmartMedia=if(ad==null)smartQueue.getOrNull(smartIndex)?.let{smartSerial to it}else null
    var retainedSmartMedia by remember{mutableStateOf<Pair<Int,JSONObject>?>(null)}
    SideEffect{if(activeSmartMedia!=null)retainedSmartMedia=activeSmartMedia}
    AnimatedVisibility(visible=activeSmartMedia!=null,enter=fadeIn(tween(500)),exit=fadeOut(tween(500))){
        (activeSmartMedia?:retainedSmartMedia)?.let{(serial,media)->NativePreroll(media,false,onStarted={},onFinish={if(smartQueue.isNotEmpty()&&smartSerial==serial){smartFailures++;if(smartFailures>=smartQueue.size)smartQueue=emptyList()else{smartIndex=(smartIndex+1)%smartQueue.size;smartSerial++}}},smart=true,breakStart=breakStart,breakDuration=breakDuration,serverClockOffset=api.serverClockOffsetMs,onPlayed={if(smartSerial==serial)smartFailures=0},onBack={home()},commercialPhone=data?.optJSONObject("empresa").str("telefone_comercial"),smartSerial=serial,smartActive=activeSmartMedia!=null)}
    }
    AnimatedVisibility(visible=startup, enter=fadeIn(tween(650)), exit=fadeOut(tween(650))) {
        StartupSplash(startupStage)
    }
    if(diagnostic)NativePerformanceOverlay(player,musicMode,musicReads,verifiedWakes,totalRecoveries,lastMusicResponse,lastMusicRtt,syncStatus,forcePolling){forcePolling=!forcePolling;prefs.edit().putBoolean("music_force_polling",forcePolling).apply()}
    }
}

internal fun nativeEpoch(value:Any?):Long {val n=(value as? Number)?.toDouble()?:value?.toString()?.toDoubleOrNull();return if(n!=null&&n.isFinite()&&n>0)(if(n<1e12)n*1000 else n).toLong()else runCatching{java.time.Instant.parse(value.toString()).toEpochMilli()}.getOrDefault(0L)}

internal fun deduplicateNativeHistory(rows:List<JSONObject>):List<JSONObject>{
    fun key(row:JSONObject)=historyNormalized(row.str("musica"))+"|"+historyNormalized(row.str("artista"))
    fun second(row:JSONObject):Int?{val p=row.str("horario").substringBefore(".").split(":");if(p.size<2)return null;return (p[0].toIntOrNull()?:return null)*3600+(p[1].toIntOrNull()?:return null)*60+(p.getOrNull(2)?.toIntOrNull()?:0)}
    val seen=mutableSetOf<String>();val out=mutableListOf<JSONObject>()
    for(row in rows){val k=key(row);if(k=="|")continue
        if(!seen.add(k+"|"+row.str("dia")+"|"+row.str("horario").take(8)))continue
        val prev=out.lastOrNull();val a=second(row);val b=prev?.let{second(it)}
        if(prev!=null&&key(prev)==k&&row.str("dia")==prev.str("dia")&&a!=null&&b!=null&&kotlin.math.abs(a-b)<=180)continue
        out.add(row)
    };return out
}

internal fun isNativeBreak(track:JSONObject?):Boolean=listOf(track.str("titulo"),track.str("artista")).any{it.trim().equals("BREAK",true)}

/** Both live channels show the dedicated video creative during a Smart Break. */
internal fun smartBreakVideoMedia(media:List<JSONObject>):List<JSONObject> = media.filter{it.str("placement")=="smart_break_video"&&it.str("url").startsWith("https://")}.sortedBy{it.optInt("order")}

internal const val HOME_BACKGROUND_AD_MS=10_000L
internal fun nativeInteractionPlacement(panel:String?):String=when(panel){"lyrics"->"lyrics_ads";"chat"->"chat_ads";"poll","battle"->"poll_ads";"weather"->"weather_ads";"history"->"history_ads";else->""}
internal fun nativeInteractionAds(campaigns:List<JSONObject>,date:String,program:String):Map<String,List<JSONObject>>{
    val placements=setOf("lyrics_ads","chat_ads","poll_ads","weather_ads","history_ads")
    return campaigns.filter{it.str("start_date")<=date&&it.str("end_date")>=date&&(it.strings("program_ids").isEmpty()||program in it.strings("program_ids"))}.sortedBy{it.str("id")}.flatMap{it.rows("media")}.filter{it.str("placement") in placements&&safeImage(it.str("url"))!=null}.groupBy{it.str("placement")}
}
internal fun homeBackgroundAdProgress(endsAt:Long,now:Long):Float=(1f-(endsAt-now).toFloat()/HOME_BACKGROUND_AD_MS).coerceIn(0f,1f)
