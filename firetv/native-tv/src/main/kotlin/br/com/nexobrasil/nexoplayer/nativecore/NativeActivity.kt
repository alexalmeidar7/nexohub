package br.com.nexobrasil.nexoplayer.nativecore

import android.os.Bundle
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
import org.json.JSONObject
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

class NativeActivity : ComponentActivity() {
    private lateinit var player: ExoPlayer
    private var activity by mutableIntStateOf(0)
    private var hidden by mutableStateOf(false)
    private var consumedKey: Int? = null
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = 5894
        player = ExoPlayer.Builder(this).build().apply { setAudioAttributes(AudioAttributes.DEFAULT, true) }
        setContent { NativeTv(player, activity) { hidden = it } }
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
    override fun onStop() { player.pause(); super.onStop() }
    override fun onDestroy() { player.release(); super.onDestroy() }
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
private fun NativeTv(player: ExoPlayer, activity: Int, onHidden: (Boolean)->Unit) {
    val api = remember { HouseMixClient(BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_ANON_KEY) }
    var startup by remember { mutableStateOf(true) }
    var startupStage by remember { mutableStateOf("carregando dados da rádio") }
    var station by remember { mutableStateOf<StationBootstrap?>(null) }
    var payload by remember { mutableStateOf<JSONObject?>(null) }
    var track by remember { mutableStateOf<JSONObject?>(null) }
    var screen by remember { mutableStateOf(Screen.HOME) }
    var returnScreen by remember { mutableStateOf(Screen.HOME) }
    var failure by remember { mutableStateOf<String?>(null) }
    var playerError by remember { mutableStateOf<String?>(null) }
    var retry by remember { mutableIntStateOf(0) }
    var playing by remember { mutableStateOf(player.isPlaying) }
    var buffering by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf<StationChannel?>(null) }
    var audioIntent by remember { mutableStateOf(true) }
    var controls by remember { mutableStateOf(true) }
    var interaction by remember { mutableStateOf(false) }
    var notice by remember { mutableStateOf<String?>(null) }
    var campaigns by remember { mutableStateOf<List<JSONObject>>(emptyList()) }
    var sponsorUrls by remember { mutableStateOf<List<String>>(emptyList()) }
    var weather by remember { mutableStateOf<JSONObject?>(null) }
    var history by remember { mutableStateOf<List<JSONObject>>(emptyList()) }
    var historyLoading by remember { mutableStateOf(false) }
    var historyError by remember { mutableStateOf(false) }
    val audio = station?.channels.orEmpty().filter { it.type == "audio_live" }
    val video = station?.channels.orEmpty().filter { it.type == "video_live" }
    val stationName = station?.name ?: BuildConfig.STATION_NAME

    fun select(channel: StationChannel, destination: Screen, autoplay: Boolean = true) {
        if (selected?.id != channel.id || player.mediaItemCount == 0) {
            player.setMediaItem(MediaItem.fromUri(channel.url))
            player.prepare()
            selected = channel
        }
        playerError = null
        player.playWhenReady = autoplay
        screen = destination
        controls = true
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
        if (notice != null) notice = null
        else if (interaction) interaction = false
        else if (screen in listOf(Screen.SCHEDULE,Screen.HISTORY,Screen.PROFILE,Screen.SEARCH,Screen.CATALOG)) screen = returnScreen
        else home()
    }
    BackHandler(screen != Screen.HOME || interaction || notice != null) { back() }
    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) { playing = isPlaying }
            override fun onPlaybackStateChanged(playbackState: Int) { buffering = playbackState == Player.STATE_BUFFERING }
            override fun onPlayerError(error: PlaybackException) { playerError = "Sinal indisponível. Tente novamente." }
        }
        player.addListener(listener)
        onDispose { player.removeListener(listener) }
    }
    LaunchedEffect(retry) {
        failure = null
        startup = true
        startupStage = "carregando dados da rádio"
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
            select(startupAudio,Screen.HOME,false)
            // Wait for real buffered media, bounded for live streams and slow networks.
            withTimeoutOrNull(12_000L) {
                while(playerError==null && player.bufferedPosition-player.currentPosition<10_000L) {
                    delay(100)
                }
            }
            if(playerError==null) player.playWhenReady=audioIntent
        }
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
            catch (_: Exception) { campaigns = emptyList() }
            delay(300_000L)
        }
    }
    LaunchedEffect(screen,station?.ownerId) {
        if (screen != Screen.HISTORY) return@LaunchedEffect
        val owner = station?.ownerId ?: return@LaunchedEffect
        historyLoading = true
        historyError = false
        try {
            val data = api.recentMusic(owner)
            check(data.optBoolean("ok"))
            history = data.rows("items").take(50)
        } catch (e: CancellationException) { throw e }
        catch (_: Exception) { historyError = true }
        finally { historyLoading = false }
    }
    val watch = screen == Screen.AUDIO || screen == Screen.VIDEO
    LaunchedEffect(screen,activity,interaction,notice,buffering,playerError,playing) {
        controls = true
        if (watch && !interaction && notice == null && (screen == Screen.AUDIO || (playing && !buffering && playerError == null))) {
            delay(5000)
            controls = false
        }
    }
    SideEffect { onHidden(watch && !controls && !interaction && notice == null) }
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
    LaunchedEffect(station?.ownerId) {
        weather=null
        val owner=station?.ownerId ?: return@LaunchedEffect
        while(true){
            try {
                val data=api.weather(owner)
                if(data.optBoolean("ok")) weather=data.optJSONObject("data")?.optJSONObject("current")
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
    val onChannel: (Int)->Unit = { direction ->
        val list = if(screen==Screen.VIDEO) video else audio
        if (list.isNotEmpty()) {
            val index=list.indexOfFirst { it.id==selected?.id }.coerceAtLeast(0)
            select(list[(index+direction+list.size)%list.size],screen)
        }
    }
    Box(Modifier.fillMaxSize()) {
    if(!startup) NativeLayout(
        screen=screen, station=station, stationName=stationName, payload=data, track=track,
        program=currentProgram,presenter=currentPresenter,player=player,playing=playing,buffering=buffering,
        failure=failure,playerError=playerError,controls=controls,chrome=chrome,interaction=interaction,
        banner=banners.getOrNull(bannerIndex).str("url"),sponsor=sponsorUrls.getOrNull(sponsorIndex),weather=weather,history=history,historyLoading=historyLoading,historyError=historyError,
        notice=notice,video=video,selected=selected, onRetry={retry++},onToggle=::toggle,onBack=::back,
        onOpen={destination ->
            when(destination) {
                Screen.HOME -> home()
                Screen.AUDIO -> { if(audio.isEmpty()) notice="Canal de áudio indisponível" else if(selected?.id==audio.first().id) screen=Screen.AUDIO else select(audio.first(),Screen.AUDIO,audioIntent) }
                Screen.VIDEO -> { if(video.isEmpty()) notice="Canal de vídeo indisponível" else { if(selected?.type=="audio_live") audioIntent=player.playWhenReady; select(video.first(),Screen.VIDEO) } }
                else -> openPage(destination)
            }
        },onChannel=onChannel,onVideo={select(it,Screen.VIDEO)},onInteraction={interaction=!interaction},
        onNotice={notice=it})
    AnimatedVisibility(visible=startup, enter=fadeIn(tween(650)), exit=fadeOut(tween(650))) {
        StartupSplash(startupStage)
    }
    }
}
