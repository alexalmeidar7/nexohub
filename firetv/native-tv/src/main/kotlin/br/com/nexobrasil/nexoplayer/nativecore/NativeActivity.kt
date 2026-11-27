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
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = 5894
        val http=DefaultHttpDataSource.Factory().setUserAgent("NexoTV/"+BuildConfig.VERSION_NAME).setConnectTimeoutMs(15000).setReadTimeoutMs(20000)
        playerState = ExoPlayer.Builder(this,LevelingRenderers(this)).setMediaSourceFactory(DefaultMediaSourceFactory(this).setDataSourceFactory(androidx.media3.datasource.DefaultDataSource.Factory(this,http))).build().apply {
            setAudioAttributes(AudioAttributes.DEFAULT,true)
        }
        val info=applicationInfo
        runCatching { android.util.Log.i("NexoLauncher","package="+packageName+" icon="+resources.getResourceName(info.icon)+" banner="+resources.getResourceName(info.banner)+" model="+android.os.Build.MODEL+" sdk="+android.os.Build.VERSION.SDK_INT) }
        setContent { playerState?.let{NativeTv(it, spectrum, activity) { hidden = it }} }
    }
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_UP && consumedKey == event.keyCode) {
            consumedKey = null
            return true
        }
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
    override fun onStart() { super.onStart();if(resumeOnForeground&&playerState!=null){resumeOnForeground=false;player.play()} }
    override fun onStop() { if(playerState!=null){resumeOnForeground=player.playWhenReady;player.pause()};super.onStop() }
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
private fun NativeTv(player: ExoPlayer, spectrum:PcmSpectrum, activity: Int, onHidden: (Boolean)->Unit) {
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
    val audio = station?.channels.orEmpty().filter { it.type == "audio_live" }
    val video = station?.channels.orEmpty().filter { it.type == "video_live" }
    val stationName = station?.name ?: BuildConfig.STATION_NAME

    var playbackAttempt by remember { mutableIntStateOf(0) }
    var recoveryCount by remember { mutableIntStateOf(0) }
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
    fun select(channel: StationChannel, destination: Screen, autoplay: Boolean = true, allowCampaignWait:Boolean=true) {
        val watch=destination==Screen.AUDIO||destination==Screen.VIDEO
        val now=System.currentTimeMillis()
        val date=LocalDate.now(brasilia).toString()
        val program=nativeCurrentProgram(payload).str("id")
        val placement=if(channel.type=="audio_live")"preroll_audio" else "preroll_video"
        val eligible=watch&&autoplay&&prerollFrequency.eligible(placement,channel.id,now)
        if(eligible&&!campaignsReady&&allowCampaignWait){pendingWatch=Triple(channel,destination,autoplay);return}
        pendingWatch=null
        val candidates=if(eligible) campaigns.filter{it.str("start_date")<=date&&it.str("end_date")>=date&&(it.strings("program_ids").isEmpty()||program in it.strings("program_ids"))}.sortedBy{it.str("id")}.flatMap{it.rows("media")}.filter{it.str("placement")==placement&&it.str("url").startsWith("https://")} else emptyList()
        val nextAd=candidates.getOrNull(if(candidates.isEmpty())0 else ((now/300000)%candidates.size).toInt())
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
        if(destination==Screen.AUDIO&&autoplay&&nextAd==null){player.volume=0f;fadeRequest++}
    }
    LaunchedEffect(pendingWatch){
        val request=pendingWatch?:return@LaunchedEffect
        withTimeoutOrNull(3500L){while(!campaignsReady)delay(50)}
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
        pendingWatch=null;ad=null;smartQueue=emptyList();prerollFrequency.home()
        if (selected?.type == "video_live") {
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
    LaunchedEffect(scheduleOpening){if(scheduleOpening){withFrameNanos{};delay(220);if(scheduleOpening){panel="schedule";scheduleOpening=false;controls=true;interaction=false}}}
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
        try {
            val data = api.stationPayload(BuildConfig.STATION_SLUG)
            station = StationBootstrap.fromJson(data)
            payload = data
            sync.clear();track=null;artistArtwork="";trackStart=0L;trackLocalStart=0L
            incomingTrack=data.optJSONObject("musicData")
            incomingStart=nativeEpoch(data.opt("musicStartTime")?:incomingTrack?.opt("startTime")?:incomingTrack?.opt("startedAt"))
            incomingTrack?.let{sync.accept(SyncTrack(it.str("titulo"),it.str("artista"),incomingStart,System.currentTimeMillis(),it,data.str("musicDeezerArtistImg").ifBlank{it.str("capa")}))}
        } catch (e: CancellationException) { throw e }
        catch (_: Exception) { failure = "Não foi possível carregar a emissora."; startup = false }
    }
    LaunchedEffect(station?.ownerId) {
        val owner = station?.ownerId ?: return@LaunchedEffect
        startupStage = "preparando áudio"
        val startupAudio=audio.firstOrNull()
        if(startupAudio!=null && selected==null) {
            select(startupAudio,Screen.PROFILE,false)
            // Wait for real buffered media, bounded for live streams and slow networks.
            withTimeoutOrNull(12_000L) {
                while(playerError==null && player.bufferedPosition-player.currentPosition<10_000L) {
                    delay(100)
                }
            }
        }
        screen = Screen.PROFILE
        startupStage="sincronizando música no ar"
        if(entryPending&&selected?.type=="audio_live"&&audioIntent){resumeLive(true);withTimeoutOrNull(4000L){while(syncEpoch<=0L&&track==null&&playerError==null)delay(100)}}
        startup = false
        var wait = 2_000L
        while (true) {
            delay(wait)
            try {
                val data = api.nowPlaying(BuildConfig.STATION_SLUG)
                if (data.str("userId") == owner) {
                    val next=data.optJSONObject("musicData")?:data.str("musica").takeIf{it.isNotBlank()}?.let{JSONObject().put("titulo",it).put("artista",data.str("artista")).put("capa",data.str("capa")).put("duracao",data.optDouble("duracao",0.0))}
                    if(next!=null&&next.str("titulo").isNotBlank()){
                        val start=nativeEpoch(data.opt("musicStartTime")?:next.opt("startTime")?:next.opt("startedAt"))
                        if(incomingTrack?.toString()!=next.toString()||incomingStart!=start){incomingTrack=next;incomingStart=start}
                        sync.accept(SyncTrack(next.str("titulo"),next.str("artista"),start,System.currentTimeMillis(),next,data.str("musicDeezerArtistImg")))
                    }
                    wait=2_000L
                } else wait = 60_000L
            } catch (e: CancellationException) { throw e }
            catch (_: Exception) { wait = (wait * 2).coerceAtMost(60_000L) }
        }
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
    LaunchedEffect(panel,station?.ownerId) {
        if (panel !in listOf("history","search")) return@LaunchedEffect
        val owner = station?.ownerId ?: return@LaunchedEffect
        historyLoading = true
        historyError = false
        try {
            val data = api.recentMusic(owner)
            check(data.optBoolean("ok"))
            history = deduplicateNativeHistory(data.rows("items")).take(50)
        } catch (e: CancellationException) { throw e }
        catch (_: Exception) { historyError = true }
        finally { historyLoading = false }
    }
    LaunchedEffect(player,selected?.id,startup,ad,playbackAttempt){
        if(startup||ad!=null||!player.playWhenReady)return@LaunchedEffect
        while(player.playWhenReady&&recoveryCount<2){
            delay(12000)
            if(player.isPlaying||!player.playWhenReady||ad!=null)break
            recoveryCount++
            android.util.Log.w("NexoPlayback","LIVE_RETRY="+recoveryCount)
            sync.resetPlayback();syncEpoch=0L
            selected?.let{player.setMediaItem(liveItem(it))};player.prepare();player.play()
        }
        if(player.playWhenReady&&!player.isPlaying&&recoveryCount>=2){
            delay(12000)
            if(player.playWhenReady&&!player.isPlaying&&playerError==null)playerError="Sinal indisponível. Pressione Play para tentar novamente."
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
                if(track?.toString()!=item.content.toString())track=item.content
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
    val breakActive=listOf(track.str("titulo"),track.str("artista")).any{it.trim().equals("BREAK",true)}
    val breakDuration=track?.optDouble("duracao",0.0)?:0.0
    val breakId=selected?.id.orEmpty()+":"+(if(trackStart>0)trackStart else trackLocalStart)
    val hasSyncEpoch by remember{derivedStateOf{syncEpoch>0}}
    LaunchedEffect(watch,breakActive,breakId,ad,campaigns,playing,hasSyncEpoch){
        if(!watch||!breakActive){smartAttempt="";smartQueue=emptyList();return@LaunchedEffect}
        if(ad!=null||!playing||smartQueue.isNotEmpty()||smartAttempt==breakId)return@LaunchedEffect
        if(smartBreakTiming(trackStart,breakDuration,System.currentTimeMillis()+api.serverClockOffsetMs)?.second==0L)return@LaunchedEffect
        val date=LocalDate.now(brasilia).toString()
        val program=nativeCurrentProgram(payload).str("id")
        val media=campaigns.filter{it.str("start_date")<=date&&it.str("end_date")>=date&&(it.strings("program_ids").isEmpty()||program in it.strings("program_ids"))}.sortedBy{it.str("id")}.flatMap{it.rows("media")}.filter{it.str("url").startsWith("https://")}
        val placement=if(selected?.type=="audio_live")"smart_break_audio" else "smart_break_video"
        val queue=media.filter{it.str("placement")==placement}.sortedBy{it.optInt("order")}.ifEmpty{if(placement=="smart_break_audio")media.filter{it.str("placement")=="smart_break_video"}.sortedBy{it.optInt("order")}else emptyList()}
        if(queue.isNotEmpty()){smartAttempt=breakId;smartIndex=0;smartFailures=0;smartSerial++;smartQueue=queue;player.volume=0f}
    }
    LaunchedEffect(smartQueue.isNotEmpty(),breakDuration,trackStart){
        while(smartQueue.isNotEmpty()&&trackStart>0&&breakDuration>0){
            if(smartBreakTiming(trackStart,breakDuration,System.currentTimeMillis()+api.serverClockOffsetMs)?.second==0L){smartQueue=emptyList();break}
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
    SideEffect { onHidden(watch && ad==null && !controls && !interaction && notice == null && panel == null) }
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
    val historyAd=campaigns.filter{it.str("start_date")<=stationDate&&it.str("end_date")>=stationDate&&(it.strings("program_ids").isEmpty()||currentProgram.str("id") in it.strings("program_ids"))}.sortedBy{it.str("id")}.flatMap{it.rows("media")}.firstOrNull{it.str("placement")=="history_ads"&&safeImage(it.str("url"))!=null}
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
    LaunchedEffect(screen,entryPending,station?.ownerId) {
        visibleBackgroundAd=""
        if(screen!=Screen.HOME||entryPending)return@LaunchedEffect
        var index=0
        while(true){
            delay(60_000L)
            while(latestBackgroundAds.isEmpty()||homeAdBlocked)delay(1000)
            val pool=latestBackgroundAds
            visibleBackgroundAd=pool[index%pool.size]
            index++
            delay(10_000L)
            visibleBackgroundAd=""
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
    if(!startup && ad==null && smartQueue.isEmpty()) NativeLayout(
        screen=screen, station=station, stationName=stationName, payload=data, track=track,
        program=currentProgram,presenter=currentPresenter,artistArtwork=artistArtwork,backgroundAd=visibleBackgroundAd.takeIf{screen==Screen.HOME&&it in latestBackgroundAds}.orEmpty(),bannerLink=banners.getOrNull(bannerIndex).takeIf{it?.optBoolean("clickable")==true}.str("link"),bannerQr=bannerQr,onBannerQr={bannerQr=it},player=player,playing=playing,buffering=buffering,
        failure=failure,playerError=playerError,controls=controls,chrome=chrome,interaction=interaction,
        banner=banners.getOrNull(bannerIndex).str("url"),historyAd=historyAd,sponsor=sponsorUrls.getOrNull(sponsorIndex),weather=weather,history=history,historyLoading=historyLoading,historyError=historyError,
        notice=notice,video=video,selected=selected, onRetry={retry++},onToggle=::toggle,onBack=::animatedBack,leavingScreen=leavingScreen,onVideoTrayFocus={videoTrayFocused=it},
        entryPending=entryPending, guestName=account?.optJSONObject("user_metadata").str("full_name").ifBlank{account?.optJSONObject("user_metadata").str("name")}.ifBlank{guestName}, guestAvatar=guestAvatar,
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
        },onChannel=onChannel,onVideo={select(it,Screen.VIDEO)},onInteraction={if(interaction){interaction=false;interactionReturn++}else interaction=true},
        onNotice={notice=it})
    ad?.let{media->NativePreroll(media,selected?.type=="audio_live",onStarted={prerollFrequency.played(activeAdPlacement,System.currentTimeMillis())},onFinish={ad=null;activeAdPlacement="";scope.launch { withFrameNanos { };resumeLive(resumeAfterAd) }})}
    if(ad==null&&smartQueue.isNotEmpty())key(smartSerial){smartQueue.getOrNull(smartIndex)?.let{media->NativePreroll(media,media.str("placement")=="smart_break_audio",onStarted={},onFinish={if(smartQueue.isNotEmpty()){smartFailures++;if(smartFailures>=smartQueue.size)smartQueue=emptyList()else{smartIndex=(smartIndex+1)%smartQueue.size;smartSerial++}}},smart=true,breakStart=trackStart,breakDuration=breakDuration,serverClockOffset=api.serverClockOffsetMs,onPlayed={smartFailures=0},onBack={home()},commercialPhone=data?.optJSONObject("empresa").str("telefone_comercial"))}}
    AnimatedVisibility(visible=startup, enter=fadeIn(tween(650)), exit=fadeOut(tween(650))) {
        StartupSplash(startupStage)
    }
    }
}

internal fun nativeEpoch(value:Any?):Long {val n=(value as? Number)?.toDouble()?:value?.toString()?.toDoubleOrNull();return if(n!=null&&n.isFinite()&&n>0)(if(n<1e12)n*1000 else n).toLong()else runCatching{java.time.Instant.parse(value.toString()).toEpochMilli()}.getOrDefault(0L)}

internal fun deduplicateNativeHistory(rows:List<JSONObject>):List<JSONObject>{
    fun key(row:JSONObject)=row.str("musica").trim().lowercase(java.util.Locale.ROOT)+"|"+row.str("artista").trim().lowercase(java.util.Locale.ROOT)
    fun second(row:JSONObject):Int?{val p=row.str("horario").substringBefore(".").split(":");if(p.size<2)return null;return (p[0].toIntOrNull()?:return null)*3600+(p[1].toIntOrNull()?:return null)*60+(p.getOrNull(2)?.toIntOrNull()?:0)}
    val seen=mutableSetOf<String>();val out=mutableListOf<JSONObject>()
    for(row in rows){val k=key(row);if(k=="|")continue
        if(!seen.add(k+"|"+row.str("dia")+"|"+row.str("horario").take(8)))continue
        val prev=out.lastOrNull();val a=second(row);val b=prev?.let{second(it)}
        if(prev!=null&&key(prev)==k&&row.str("dia")==prev.str("dia")&&a!=null&&b!=null&&kotlin.math.abs(a-b)<=120)continue
        out.add(row)
    };return out
}
