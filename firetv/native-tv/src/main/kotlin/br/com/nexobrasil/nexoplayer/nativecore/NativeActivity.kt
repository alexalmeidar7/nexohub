package br.com.nexobrasil.nexoplayer.nativecore

import android.os.Bundle
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
import androidx.media3.common.Player
import androidx.media3.common.PlaybackException
import androidx.media3.exoplayer.ExoPlayer
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
    private var player by mutableStateOf<ExoPlayer?>(null)
    private var rendererFallback = false
    private val spectrum = PcmSpectrum()
    private var activity by mutableIntStateOf(0)
    private var hidden by mutableStateOf(false)
    private var consumedKey: Int? = null
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = 5894
        player = makePlayer(false)
        setContent { player?.let { active -> NativeTv(active, spectrum, activity, { failed -> fallback(failed) }) { hidden = it } } }
    }
    private fun makePlayer(fallback:Boolean):ExoPlayer =
        (if(fallback) ExoPlayer.Builder(this) else ExoPlayer.Builder(this,SpectrumRenderers(this,spectrum))).build().apply {
            setAudioAttributes(AudioAttributes.DEFAULT,true)
        }
    private fun fallback(failed:ExoPlayer):Boolean {
        if(rendererFallback || player!==failed) return false
        val item=failed.currentMediaItem ?: return false
        rendererFallback=true
        val play=failed.playWhenReady
        val next=makePlayer(true)
        failed.release()
        player=next
        next.setMediaItem(item);next.prepare();next.playWhenReady=play
        return true
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
    override fun onStop() { player?.pause(); super.onStop() }
    override fun onDestroy() { player?.release(); super.onDestroy() }
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
private fun NativeTv(player: ExoPlayer, spectrum:PcmSpectrum, activity: Int, onFallback:(ExoPlayer)->Boolean, onHidden: (Boolean)->Unit) {
    val api = remember { HouseMixClient(BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_ANON_KEY) }
    var startup by remember { mutableStateOf(true) }
    var entryPending by remember { mutableStateOf(true) }
    var guestName by remember { mutableStateOf("Visitante") }
    var guestAvatar by remember { mutableIntStateOf(R.drawable.visitor_avatar) }
    var startupStage by remember { mutableStateOf("carregando dados da rádio") }
    var station by remember { mutableStateOf<StationBootstrap?>(null) }
    var payload by remember { mutableStateOf<JSONObject?>(null) }
    var track by remember { mutableStateOf<JSONObject?>(null) }
    var screen by remember { mutableStateOf(Screen.PROFILE) }
    var returnScreen by remember { mutableStateOf(Screen.HOME) }
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
    var sponsorUrls by remember { mutableStateOf<List<String>>(emptyList()) }
    var weather by remember { mutableStateOf<JSONObject?>(null) }
    val context=LocalContext.current
    val prefs=remember { context.getSharedPreferences("native_tv_settings",0) }
    val services=remember { NativeServices(api,context) }
    val scope=rememberCoroutineScope()
    var account by remember { mutableStateOf<JSONObject?>(null) }
    var ad by remember { mutableStateOf<JSONObject?>(null) }
    var resumeAfterAd by remember { mutableStateOf(true) }
    var lastAdAt by remember { mutableLongStateOf(0L) }
    var lastChannel by remember { mutableStateOf("") }
    var fromHome by remember { mutableStateOf(true) }
    LaunchedEffect(Unit){try{account=services.restore()}catch(e:CancellationException){throw e}catch(_:Exception){services.clear()}}
    var location by remember { mutableStateOf(readWeatherLocation(prefs)) }
    var cep by remember { mutableStateOf(prefs.getString("cep","").orEmpty()) }
    var panel by remember { mutableStateOf<String?>(null) }
    var forecast by remember { mutableStateOf<JSONObject?>(null) }
    var lyrics by remember { mutableStateOf<String?>(null) }
    var history by remember { mutableStateOf<List<JSONObject>>(emptyList()) }
    var historyLoading by remember { mutableStateOf(false) }
    var historyError by remember { mutableStateOf(false) }
    val audio = station?.channels.orEmpty().filter { it.type == "audio_live" }
    val video = station?.channels.orEmpty().filter { it.type == "video_live" }
    val stationName = station?.name ?: BuildConfig.STATION_NAME

    fun resumeLive(autoplay:Boolean) {
        if(player.mediaItemCount==0)return
        if(player.playbackState==Player.STATE_IDLE || player.playbackState==Player.STATE_ENDED) {
            player.seekToDefaultPosition();player.prepare()
        }
        playerError=null
        player.playWhenReady=autoplay
    }
    fun select(channel: StationChannel, destination: Screen, autoplay: Boolean = true) {
        val watch=destination==Screen.AUDIO||destination==Screen.VIDEO
        val now=System.currentTimeMillis()
        val date=LocalDate.now(brasilia).toString()
        val program=payload?.optJSONObject("currentProgram").str("id")
        val placement=if(channel.type=="audio_live")"preroll_audio" else "preroll_video"
        val eligible=watch&&autoplay&&(lastAdAt==0L||(!fromHome&&lastChannel.isNotBlank()&&lastChannel!=channel.id&&now-lastAdAt>=900000L))
        val candidates=if(eligible) campaigns.filter{it.str("start_date")<=date&&it.str("end_date")>=date&&(it.strings("program_ids").isEmpty()||program in it.strings("program_ids"))}.sortedBy{it.str("id")}.flatMap{it.rows("media")}.filter{it.str("placement")==placement&&it.str("url").startsWith("https://")} else emptyList()
        val nextAd=candidates.getOrNull(if(candidates.isEmpty())0 else ((now/300000)%candidates.size).toInt())
        // Live must not wait on the commercial API.
        if(nextAd!=null)player.pause()
        if(selected?.id!=channel.id||player.mediaItemCount==0){
            player.setMediaItem(MediaItem.fromUri(channel.url));selected=channel
        }
        playerError=null;resumeAfterAd=autoplay;ad=nextAd
        if(watch){lastChannel=channel.id;fromHome=false}
        screen=destination;controls=true
        resumeLive(autoplay&&nextAd==null)
    }
    fun toggle() {
        if (selected == null) { audio.firstOrNull()?.let { select(it,screen) }; return }
        if (player.playWhenReady && player.playbackState != Player.STATE_ENDED && playerError == null) {
            player.pause()
        } else {
            if (player.playbackState == Player.STATE_IDLE || player.playbackState == Player.STATE_ENDED) player.prepare()
            playerError = null
            player.play()
        }
        if (selected?.type == "audio_live") audioIntent = player.playWhenReady
    }
    fun home() {
        ad=null;fromHome=true
        if (selected?.type == "video_live") {
            player.stop(); player.clearMediaItems(); selected = null
            audio.firstOrNull()?.let { select(it,Screen.HOME,audioIntent) }
        }
        screen = Screen.HOME
        interaction = false
    }
    fun openPage(destination: Screen) {
        returnScreen = screen
        screen = destination
        interaction = false
        controls = true
    }
    fun back() {
        if (ad!=null) return
        if (notice != null) notice = null
        else if (panel != null) { panel=null; interaction=false }
        else if (startup || entryPending) return
        else if (interaction) interaction = false
        else if (screen in listOf(Screen.SCHEDULE,Screen.HISTORY,Screen.PROFILE,Screen.SEARCH,Screen.CATALOG)) screen = returnScreen
        else home()
    }
    BackHandler(ad!=null || screen != Screen.HOME || interaction || notice != null || panel != null) { back() }
    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) { playing = isPlaying }
            override fun onPlaybackStateChanged(playbackState: Int) { buffering = playbackState == Player.STATE_BUFFERING }
            override fun onPlayerError(error: PlaybackException) {
                android.util.Log.w("NexoPlayback",error.errorCodeName,error)
                if(ad==null && error.errorCode in 4000..5999 && onFallback(player))return
                playerError = "Sinal indisponível. Tente novamente."
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
            track = data.optJSONObject("musicData")
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
        startup = false
        var wait = 15_000L
        var refresh = 0
        while (true) {
            delay(wait)
            try {
                val data = api.nowPlaying(BuildConfig.STATION_SLUG)
                if (data.str("userId") == owner) {
                    track = data.optJSONObject("musicData")
                    wait = 15_000L
                    if (++refresh >= 8) {
                        refresh = 0
                        val full = api.stationPayload(BuildConfig.STATION_SLUG)
                        if (full.str("userId") == owner) payload = full
                    }
                } else wait = 60_000L
            } catch (e: CancellationException) { throw e }
            catch (_: Exception) { wait = (wait * 2).coerceAtMost(60_000L) }
        }
    }
    LaunchedEffect(station?.ownerId) {
        val owner = station?.ownerId ?: return@LaunchedEffect
        while (true) {
            try { campaigns = api.campaigns(owner).rows("campaigns") }
            catch (e: CancellationException) { throw e }
            catch (_: Exception) { /* retain last successful list */ }
            delay(300_000L)
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
            history = data.rows("items").distinctBy { it.str("id").ifBlank { it.str("musica")+"|"+it.str("artista")+"|"+it.str("horario") } }.take(50)
        } catch (e: CancellationException) { throw e }
        catch (_: Exception) { historyError = true }
        finally { historyLoading = false }
    }
    LaunchedEffect(player,selected?.id,entryPending,ad,playerError){
        if(!entryPending&&ad==null&&playerError!=null&&player.playWhenReady){
            delay(2500);player.seekToDefaultPosition();player.prepare();player.play()
        }
    }
    val watch = screen == Screen.AUDIO || screen == Screen.VIDEO
    LaunchedEffect(screen,activity,interaction,notice,panel,buffering,playerError,playing) {
        controls = true
        if (watch && !interaction && notice == null && panel == null && (screen == Screen.AUDIO || (playing && !buffering && playerError == null))) {
            delay(5000)
            controls = false
        }
    }
    SideEffect { onHidden(watch && !controls && !interaction && notice == null && panel == null) }
    val chrome by animateFloatAsState(if(controls) 1f else 0f, tween(350),label="watchChrome")
    val data = payload
    val currentProgram = data?.optJSONObject("currentProgram")
    val currentPresenter = data?.optJSONObject("currentPresenter")
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

    val stationDate = LocalDate.now(brasilia).toString()
    val banners = remember(campaigns,currentProgram?.str("id"),stationDate) {
        campaigns.filter { it.str("start_date") <= stationDate && it.str("end_date") >= stationDate &&
            (it.strings("program_ids").isEmpty() || currentProgram?.str("id") in it.strings("program_ids")) }
            .flatMap { it.rows("media") }.filter { it.str("placement") == "home_banner" }
    }
    var bannerIndex by remember(banners) { mutableIntStateOf(0) }
    LaunchedEffect(banners) { if (banners.size>1) while(true) { delay(5000); bannerIndex=(bannerIndex+1)%banners.size } }
    LaunchedEffect(panel,track.str("titulo"),track.str("artista")) {
        if(panel=="lyrics"){lyrics=null;try { lyrics=api.lyrics(track.str("titulo"),track.str("artista")) } catch(e:CancellationException){throw e} catch(_:Exception){lyrics="Letra indisponível para esta música."}}
    }
    val onChannel: (Int)->Unit = { direction ->
        val list = audio+video
        if (list.isNotEmpty()) {
            val index=list.indexOfFirst { it.id==selected?.id }.coerceAtLeast(0)
            val ch=list[(index+direction+list.size)%list.size]
            select(ch,if(ch.type=="video_live") Screen.VIDEO else Screen.AUDIO)
        }
    }
    Box(Modifier.fillMaxSize()) {
    if(!startup && ad==null) NativeLayout(
        screen=screen, station=station, stationName=stationName, payload=data, track=track,
        program=currentProgram,presenter=currentPresenter,player=player,playing=playing,buffering=buffering,
        failure=failure,playerError=playerError,controls=controls,chrome=chrome,interaction=interaction,
        banner=banners.getOrNull(bannerIndex).str("url"),sponsor=sponsorUrls.getOrNull(sponsorIndex),weather=weather,history=history,historyLoading=historyLoading,historyError=historyError,
        notice=notice,video=video,selected=selected, onRetry={retry++},onToggle=::toggle,onBack=::back,
        entryPending=entryPending, guestName=account?.optJSONObject("user_metadata").str("full_name").ifBlank{account?.optJSONObject("user_metadata").str("name")}.ifBlank{guestName}, guestAvatar=guestAvatar,
        spectrum=spectrum, panel=panel,forecast=forecast,lyrics=lyrics,cep=cep,api=api,services=services,account=account,
        onAccount={account=it;panel=null},onLogout={scope.launch{try{services.logout();account=null}catch(e:CancellationException){throw e}catch(_:Exception){notice="Não foi possível encerrar a sessão."}}},
        onPanel={panel=it;interaction=false},onCepSaved={digits,loc -> prefs.edit().putString("cep",digits).putString("location",loc.toString()).apply();cep=digits;location=loc;panel=null},
        onGuestSave={name,avatar -> guestName=name;guestAvatar=avatar},
        onProfileContinue={
            if(entryPending) {
                entryPending=false
                screen=Screen.HOME
                if(selected?.type=="audio_live") resumeLive(audioIntent) else audio.firstOrNull()?.let{select(it,Screen.HOME,audioIntent)}
            } else screen=returnScreen
        },
        onOpen={destination ->
            when(destination) {
                Screen.HOME -> home()
                Screen.AUDIO -> { if(audio.isEmpty()) notice="Canal de áudio indisponível" else select(audio.first(),Screen.AUDIO,audioIntent) }
                Screen.VIDEO -> { if(video.isEmpty()) notice="Canal de vídeo indisponível" else { if(selected?.type=="audio_live") audioIntent=player.playWhenReady; select(video.first(),Screen.VIDEO) } }
                Screen.SEARCH -> { panel="search";interaction=false }
                Screen.HISTORY -> { panel="history";interaction=false }
                else -> openPage(destination)
            }
        },onChannel=onChannel,onVideo={select(it,Screen.VIDEO)},onInteraction={interaction=!interaction},
        onNotice={notice=it})
    ad?.let{media->NativePreroll(media,selected?.type=="audio_live",onStarted={lastAdAt=System.currentTimeMillis()},onFinish={ad=null;resumeLive(resumeAfterAd)})}
    AnimatedVisibility(visible=startup, enter=fadeIn(tween(650)), exit=fadeOut(tween(650))) {
        StartupSplash(startupStage)
    }
    }
}
