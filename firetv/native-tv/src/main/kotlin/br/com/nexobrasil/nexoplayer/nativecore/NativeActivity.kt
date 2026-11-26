package br.com.nexobrasil.nexoplayer.nativecore

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.AudioAttributes
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.PlaybackException
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import org.json.JSONObject

class NativeActivity : ComponentActivity() {
    private lateinit var player: ExoPlayer
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = 5894
        player = ExoPlayer.Builder(this).build().apply {
            setAudioAttributes(AudioAttributes.DEFAULT, true)
        }
        setContent { NativeTv(player) }
    }
    override fun onStop() { player.pause(); super.onStop() }
    override fun onDestroy() { player.release(); super.onDestroy() }
}

private enum class Screen { HOME, AUDIO, VIDEO, SCHEDULE }
private fun JSONObject?.str(key: String): String =
    this?.opt(key)?.let { if (it is String) it else "" }.orEmpty()

@Composable
private fun NativeTv(player: ExoPlayer) {
    val api = remember { HouseMixClient(BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_ANON_KEY) }
    var station by remember { mutableStateOf<StationBootstrap?>(null) }
    var payload by remember { mutableStateOf<JSONObject?>(null) }
    var track by remember { mutableStateOf<JSONObject?>(null) }
    var screen by remember { mutableStateOf(Screen.HOME) }
    var failure by remember { mutableStateOf<String?>(null) }
    var playerError by remember { mutableStateOf<String?>(null) }
    var retry by remember { mutableIntStateOf(0) }
    var playing by remember { mutableStateOf(player.isPlaying) }
    var selected by remember { mutableStateOf<StationChannel?>(null) }
    val audio = station?.channels.orEmpty().filter { it.type == "audio_live" }
    val video = station?.channels.orEmpty().filter { it.type == "video_live" }
    val stationName = station?.name ?: BuildConfig.STATION_NAME

    fun select(channel: StationChannel, destination: Screen) {
        if (selected?.id != channel.id || player.mediaItemCount == 0) {
            player.setMediaItem(MediaItem.fromUri(channel.url))
            player.prepare()
            selected = channel
        }
        playerError = null
        player.play()
        screen = destination
    }

    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) { playing = isPlaying }
            override fun onPlayerError(error: PlaybackException) { playerError = "Sinal indisponível. Tente novamente." }
        }
        player.addListener(listener)
        onDispose { player.removeListener(listener) }
    }
    LaunchedEffect(retry) {
        failure = null
        try {
            val data = api.stationPayload(BuildConfig.STATION_SLUG)
            station = StationBootstrap.fromJson(data)
            payload = data
            track = data.optJSONObject("musicData")
        } catch (e: CancellationException) { throw e }
        catch (_: Exception) { failure = "Não foi possível carregar a emissora." }
    }
    LaunchedEffect(station?.ownerId) {
        val owner = station?.ownerId ?: return@LaunchedEffect
        var wait = 15_000L
        while (true) {
            delay(wait)
            try {
                val data = api.nowPlaying(BuildConfig.STATION_SLUG)
                if (data.str("userId") == owner) {
                    track = data.optJSONObject("musicData")
                    wait = 15_000L
                } else wait = 60_000L
            } catch (e: CancellationException) { throw e }
            catch (_: Exception) { wait = (wait * 2).coerceAtMost(60_000L) }
        }
    }
    fun home() {
        if (screen == Screen.VIDEO) {
            // No second player: stop video before restoring the audio channel.
            player.stop()
            player.clearMediaItems()
            selected = null
            audio.firstOrNull()?.let { select(it, Screen.HOME) }
        }
        screen = Screen.HOME
    }
    BackHandler(screen != Screen.HOME) { home() }
    val accent = Color(0xFFF20D0F).takeIf { BuildConfig.STATION_SLUG == "positivafm" } ?: Color(0xFF304D70)
    val focus = remember(screen, station != null, failure != null) { FocusRequester() }
    val ready = station != null || failure != null
    LaunchedEffect(focus, ready) { if (ready) focus.requestFocus() }
    TvViewport(Modifier.background(Color.Black)) { u ->
        Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(accent.copy(alpha=.62f), Color(0xFF111111), Color.Black)))) {
            Column(Modifier.fillMaxSize().padding(u.space(92))) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    if (!station?.logoUrl.isNullOrBlank()) AsyncImage(station?.logoUrl, "Logo", Modifier.size(u.space(88)), contentScale=ContentScale.Fit)
                    Spacer(Modifier.width(u.space(24)))
                    Text(stationName, color=Color.White, style=u.referenceText(34,700))
                    Spacer(Modifier.weight(1f))
                    Text("• AO VIVO",color=Color.White,style=u.referenceText(25,600))
                }
                Spacer(Modifier.height(u.space(55)))
                when {
                    failure != null -> {
                        Text(failure.orEmpty(),color=Color.White,style=u.referenceText(35))
                        TvAction("Tentar novamente",u,Modifier.focusRequester(focus)) { retry++ }
                    }
                    station == null -> Text("Carregando emissora…",color=Color.White,style=u.referenceText(38))
                    screen == Screen.SCHEDULE -> {
                        Text("Grade de programação",color=Color.White,style=u.referenceText(44,700))
                        val entries=payload?.optJSONArray("programas")
                        val programs=(0 until (entries?.length() ?: 0)).mapNotNull { entries?.optJSONObject(it) }
                        LazyColumn(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(u.space(12))) {
                            items(programs) { p ->
                                Text(p.str("horario_inicio").take(5)+" – "+p.str("horario_fim").take(5)+"   "+p.str("nome"),color=Color.White,style=u.referenceText(28))
                            }
                        }
                        TvAction("Voltar",u,Modifier.focusRequester(focus)) { home() }
                    }
                    screen == Screen.VIDEO -> {
                        AndroidView(factory={ context -> PlayerView(context).apply { useController=false; this.player=player } },
                            modifier=Modifier.weight(1f).fillMaxWidth(),
                            onReset={ it.player=null }, onRelease={ it.player=null }, update={ it.player=player })
                        Row(horizontalArrangement=Arrangement.spacedBy(u.space(20)),verticalAlignment=Alignment.CenterVertically) {
                            TvAction(if (playing) "Pausar" else "Reproduzir",u,Modifier.focusRequester(focus)) { if (playing) player.pause() else { player.prepare(); player.play() } }
                            TvAction("Voltar",u) { home() }
                            video.forEach { ch -> TvAction(ch.name,u) { select(ch,Screen.VIDEO) } }
                        }
                    }
                    else -> {
                        Row(Modifier.weight(1f).fillMaxWidth(),verticalAlignment=Alignment.CenterVertically) {
                            Column(Modifier.width(u.space(300)),verticalArrangement=Arrangement.spacedBy(u.space(22))) {
                                TvAction("Ouvir",u,Modifier.focusRequester(focus)) { audio.firstOrNull()?.let { select(it,Screen.AUDIO) } }
                                TvAction("Assistir",u) { video.firstOrNull()?.let { select(it,Screen.VIDEO) } }
                                TvAction("Programação",u) { screen=Screen.SCHEDULE }
                                if (screen == Screen.AUDIO) TvAction(if (playing) "Pausar" else "Reproduzir",u) {
                                    if (playing) player.pause() else { player.prepare(); player.play() }
                                }
                            }
                            Spacer(Modifier.width(u.space(55)))
                            val cover=track.str("capa")
                            Box(Modifier.size(u.space(400)).background(Color.White.copy(alpha=.08f),RoundedCornerShape(u.space(22))),contentAlignment=Alignment.Center) {
                                if (cover.isNotBlank()) AsyncImage(cover,"Capa da música",Modifier.fillMaxSize(),contentScale=ContentScale.Crop)
                                else Text("♫",color=Color.White,style=u.referenceText(110))
                            }
                            Spacer(Modifier.width(u.space(45)))
                            Column(Modifier.weight(1f)) {
                                Text("TOCANDO",color=Color.White,style=u.referenceText(23,600))
                                Text(track.str("titulo").ifBlank { stationName },color=Color.White,style=u.referenceText(48,700),maxLines=2,overflow=TextOverflow.Ellipsis)
                                Text(track.str("artista"),color=Color.White,style=u.referenceText(30))
                                Spacer(Modifier.height(u.space(30)))
                                Text(payload?.optJSONObject("currentProgram").str("nome"),color=Color.White,style=u.referenceText(31,700))
                                Text(payload?.optJSONObject("currentPresenter").str("nome"),color=Color.White,style=u.referenceText(24))
                            }
                        }
                        if (audio.isEmpty()) Text("Canal de áudio indisponível",color=Color.White,style=u.referenceText(24))
                        if (video.isEmpty()) Text("Canal de vídeo indisponível",color=Color.White,style=u.referenceText(24))
                    }
                }
                playerError?.let { Text(it,color=Color.White,style=u.referenceText(24)) }
                Text("Nexo TV nativo • versão de teste",color=Color.White.copy(alpha=.65f),style=u.referenceText(18))
            }
        }
    }
}

@Composable
private fun TvAction(label: String,u: TvUnits,modifier: Modifier=Modifier,onClick:()->Unit) {
    var focused by remember { mutableStateOf(false) }
    val shape=RoundedCornerShape(u.space(16))
    Box(modifier.onFocusChanged { focused=it.isFocused }
        .background(Color.White.copy(alpha=if (focused) .23f else .09f),shape)
        .border(if(focused) 2.dp else 0.dp,if(focused) Color.White else Color.Transparent,shape)
        .clickable(onClick=onClick).padding(horizontal=u.space(24),vertical=u.space(18))) {
        Text(label,color=Color.White,style=u.referenceText(27,600))
    }
}
