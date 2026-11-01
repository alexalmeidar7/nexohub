package br.com.nexobrasil.nexoplayer.firetv

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.Crossfade
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter

private val Night = Color(0xFF09030B)
private val BrandRed = Color(0xFFFF1018)
private val White = Color.White
private val Muted = Color(0xFFE7E0E8)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.decorView.systemUiVisibility = 5894 or 1024 or 512
        val prefs = getSharedPreferences("nexo_tv", MODE_PRIVATE)
        val session = prefs.getString("tv_session_id", null) ?: UUID.randomUUID().toString().also {
            prefs.edit().putString("tv_session_id", it).apply()
        }
        setContent {
            MaterialTheme(colorScheme = darkColorScheme(primary = BrandRed, background = Night, surface = Night)) {
                TvExperience(prefs, session)
            }
        }
    }
}

private enum class Screen { SPLASH, LOGIN, PROFILE, HOME }

private data class StationLive(
    val stationName: String = BuildConfig.STATION_NAME,
    val logo: String = "",
    val track: String = "",
    val artist: String = "",
    val cover: String = "",
    val artistImage: String = "",
    val presenter: String = "",
    val presenterPhoto: String = "",
    val program: String = ""
)

@Composable
private fun TvExperience(prefs: android.content.SharedPreferences, sessionId: String) {
    var screen by remember { mutableStateOf(Screen.SPLASH) }
    var live by remember { mutableStateOf(StationLive()) }
    var qr by remember { mutableStateOf<Bitmap?>(null) }
    var code by remember { mutableStateOf("") }
    var profileName by remember { mutableStateOf(prefs.getString("profile_name", "") ?: "") }
    var error by remember { mutableStateOf("") }
    var visitorFocused by remember { mutableStateOf(false) }
    var retry by remember { mutableIntStateOf(0) }
    val backgroundUrl = live.artistImage.ifBlank { live.cover.ifBlank { live.presenterPhoto } }
    val backgroundBitmap = rememberRemoteBitmap(backgroundUrl)
    val logoBitmap = rememberRemoteBitmap(live.logo)
    val coverBitmap = rememberRemoteBitmap(live.cover)
    val presenterBitmap = rememberRemoteBitmap(live.presenterPhoto)

    LaunchedEffect(Unit) {
        // A abertura é uma etapa real e visível, antes de consultar a sessão.
        delay(1800)
        val saved = prefs.getString("paired_code", null)
        if (!saved.isNullOrBlank()) {
            val status = runCatching {
                withContext(Dispatchers.IO) {
                    postJson("tv-pair-status", JSONObject().put("code", saved).put("tvSessionId", sessionId))
                }
            }.getOrNull()
            val row = status?.optJSONObject("row")
            if (status?.optBoolean("ok") == true && row?.optString("status") == "claimed") {
                profileName = row.optString("paired_name", "Visitante")
                screen = Screen.PROFILE
                return@LaunchedEffect
            }
            prefs.edit().remove("paired_code").remove("profile_name").remove("profile_avatar").apply()
        }
        screen = Screen.LOGIN
    }

    // Bootstrap público: música, imagem Deezer, programa/locutor no ar e logo da rádio.
    LaunchedEffect(screen) {
        if (screen == Screen.SPLASH) return@LaunchedEffect
        while (screen != Screen.PROFILE) {
            val data = runCatching {
                withContext(Dispatchers.IO) {
                    postJson("public-player-data", JSONObject().put("slug", BuildConfig.STATION_SLUG))
                }
            }.getOrNull()
            if (data != null) {
                val music = data.optJSONObject("musicData")
                val presenter = data.optJSONObject("currentPresenter")
                val program = data.optJSONObject("currentProgram")
                val company = data.optJSONObject("empresa")
                live = StationLive(
                    stationName = company?.optString("nome_empresa")?.takeIf { !it.isNullOrBlank() } ?: BuildConfig.STATION_NAME,
                    logo = company?.optString("logo_url")?.takeIf { !it.isNullOrBlank() } ?: company?.optString("logo").orEmpty(),
                    track = music?.optString("titulo").orEmpty(),
                    artist = music?.optString("artista").orEmpty(),
                    cover = music?.optString("capa").orEmpty(),
                    artistImage = data.optString("musicDeezerArtistImg").takeUnless { it == "null" }.orEmpty(),
                    presenter = presenter?.optString("nome").orEmpty(),
                    presenterPhoto = presenter?.optString("foto").orEmpty(),
                    program = program?.optString("nome").orEmpty()
                )
            }
            delay(15000)
        }
    }

    // Cria e renova o QR automaticamente, sem tela de erro ou botão "tentar novamente".
    LaunchedEffect(screen, retry) {
        if (screen != Screen.LOGIN) return@LaunchedEffect
        code = ""
        qr = null
        error = ""
        try {
            val created = withContext(Dispatchers.IO) {
                postJson("tv-pair-create", JSONObject()
                    .put("userSlug", BuildConfig.STATION_SLUG)
                    .put("tvSessionId", sessionId))
            }
            if (!created.optBoolean("ok") || created.optString("code").isBlank()) { error = created.optString("reason", "Não foi possível gerar o QR Code"); delay(5000); if (screen == Screen.LOGIN && code.isBlank()) retry++ }
            else {
                code = created.getString("code")
                val url = "${BuildConfig.PAIR_ORIGIN}/${BuildConfig.STATION_SLUG}/pair?code=$code"
                qr = withContext(Dispatchers.Default) { makeQr(url) }
            }
        } catch (t: Throwable) {
            error = t.message ?: "Não foi possível gerar o QR Code"
            delay(5000)
            if (screen == Screen.LOGIN && code.isBlank()) retry++
        }
    }

    LaunchedEffect(code, screen) {
        if (code.isBlank() || screen != Screen.LOGIN) return@LaunchedEffect
        while (screen == Screen.LOGIN) {
            delay(1800)
            val status = runCatching {
                withContext(Dispatchers.IO) {
                    postJson("tv-pair-status", JSONObject().put("code", code).put("tvSessionId", sessionId))
                }
            }.getOrNull()
            val row = status?.optJSONObject("row")
            if (status?.optBoolean("ok") == true && row?.optString("status") == "claimed") {
                profileName = row.optString("paired_name", "Visitante")
                prefs.edit().putString("paired_code", code).putString("profile_name", profileName)
                    .putString("profile_avatar", row.optString("paired_avatar")).apply()
                screen = Screen.PROFILE
                break
            }
        }
    }

    BoxWithConstraints(Modifier.fillMaxSize().background(Night)) {
        val horizontal = maxWidth * 0.052f
        val vertical = maxHeight * 0.075f
        // Fundo dinâmico: imagem do artista do Deezer; fallback para capa da faixa/locutor.
        if (backgroundBitmap != null && screen != Screen.SPLASH) {
            Image(backgroundBitmap.asImageBitmap(), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        }
        Box(Modifier.fillMaxSize().background(
            Brush.horizontalGradient(listOf(Color(0xE8000000), Color(0x99090012), Color(0xC9000000)))
        ))
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0x66000000), Color.Transparent, Color(0xAA000000)))))

        when (screen) {
            Screen.SPLASH -> Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(28.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                    Column(horizontalAlignment = Alignment.End) {
                        Text("nexo", color = White, fontSize = 58.sp, lineHeight = 58.sp, fontWeight = FontWeight.Light)
                        Text("player", color = White, fontSize = 15.sp, lineHeight = 16.sp)
                    }
                    if (logoBitmap != null) Image(logoBitmap.asImageBitmap(), null, Modifier.width(190.dp).height(130.dp), contentScale = ContentScale.Fit)
                    else Text(BuildConfig.STATION_NAME, color = BrandRed, fontSize = 26.sp, fontWeight = FontWeight.Bold)
                }
                CircularProgressIndicator(color = White, strokeWidth = 2.dp, modifier = Modifier.size(24.dp))
            }
            Screen.LOGIN -> {
                // Logo no canto superior direito, independente do estado do QR.
                if (logoBitmap != null) Image(
                    logoBitmap.asImageBitmap(), null,
                    Modifier.align(Alignment.TopEnd).padding(end = horizontal, top = vertical * 0.55f).width(190.dp).height(125.dp),
                    contentScale = ContentScale.Fit
                )
                Column(
                    Modifier.align(Alignment.TopStart).padding(start = horizontal, top = vertical * 1.1f).width(maxWidth * 0.48f),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text("bem vindo a", color = White, fontSize = 28.sp, fontWeight = FontWeight.Light)
                    Text("${live.stationName}!", color = White, fontSize = 28.sp, fontWeight = FontWeight.Light)
                    Spacer(Modifier.height(2.dp))
                    Text("VIVA ESSA", color = BrandRed, fontSize = 55.sp, lineHeight = 58.sp, fontWeight = FontWeight.Black)
                    Text("EXPERIÊNCIA!", color = BrandRed, fontSize = 55.sp, lineHeight = 58.sp, fontWeight = FontWeight.Black)
                }

                // Card de música atual e identificação do locutor no ar.
                Row(
                    Modifier.align(Alignment.BottomStart).padding(start = horizontal, bottom = vertical * 0.78f).width(maxWidth * 0.53f),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(22.dp)
                ) {
                    if (coverBitmap != null) Image(
                        coverBitmap.asImageBitmap(), null,
                        Modifier.size(138.dp).clip(RoundedCornerShape(22.dp)),
                        contentScale = ContentScale.Crop
                    ) else Box(Modifier.size(138.dp).clip(RoundedCornerShape(22.dp)).background(Color(0x55333333)))
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("tocando agora", color = BrandRed, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        Text(live.track.ifBlank { "Acompanhe a programação" }, color = White, fontSize = 25.sp, fontWeight = FontWeight.Bold, maxLines = 2)
                        Text(live.artist, color = White, fontSize = 22.sp, maxLines = 1)
                        if (live.presenter.isNotBlank()) {
                            Text("no ar: ${live.presenter}", color = White, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                        }
                    }
                }

                // Área QR alinhada à direita conforme o layout enviado.
                Column(
                    Modifier.align(Alignment.CenterEnd).padding(end = horizontal * 0.45f, top = vertical * 0.65f).width(350.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    Box(
                        Modifier.size(260.dp).clip(RoundedCornerShape(24.dp)).background(Color(0xFFFFFDF4)).padding(14.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        if (qr != null) Image(qr!!.asImageBitmap(), null, Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
                        else if (error.isNotBlank()) Text("Conectando…", color = Color.DarkGray, fontSize = 18.sp, textAlign = TextAlign.Center)
                        else CircularProgressIndicator(color = BrandRed)
                    }
                    Text("Escaneie o QR Code e entre\ncom sua conta Google", color = White, fontSize = 16.sp, lineHeight = 20.sp, fontWeight = FontWeight.Normal, textAlign = TextAlign.Center)
                    Button(
                        onClick = {
                            profileName = "Visitante"
                            prefs.edit().remove("paired_code").putBoolean("guest_mode", true)
                                .putString("profile_name", profileName).remove("profile_avatar").apply()
                            screen = Screen.HOME
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = BrandRed, contentColor = White),
                        shape = RoundedCornerShape(40.dp),
                        modifier = Modifier.fillMaxWidth().height(62.dp)
                            .onFocusChanged { visitorFocused = it.isFocused }
                            .then(if (visitorFocused) Modifier.border(3.dp, White, RoundedCornerShape(48.dp)).padding(5.dp) else Modifier)
                    ) {
                        Text("entrar como visitante", fontSize = 19.sp, fontWeight = FontWeight.Medium)
                    }
                }
            }
            Screen.PROFILE -> Column(Modifier.align(Alignment.CenterStart).padding(start = horizontal, top = vertical), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text("Bem-vindo!", color = White, fontSize = 42.sp, fontWeight = FontWeight.Bold)
                Text(profileName.ifBlank { "Ouvinte" }, color = White, fontSize = 30.sp)
                Button(onClick = { screen = Screen.HOME }) { Text("Continuar") }
            }
            Screen.HOME -> Row(Modifier.fillMaxSize().padding(horizontal = horizontal, vertical = vertical), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(42.dp)) {
                if (backgroundBitmap != null) Image(backgroundBitmap.asImageBitmap(), null, Modifier.weight(1.1f).fillMaxHeight().clip(RoundedCornerShape(24.dp)), contentScale = ContentScale.Crop)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Text(live.stationName, color = White, fontSize = 24.sp, fontWeight = FontWeight.Medium)
                    Text("NO AR", color = BrandRed, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    Text(live.track.ifBlank { "Acompanhe a programação" }, color = White, fontSize = 34.sp, lineHeight = 39.sp, fontWeight = FontWeight.SemiBold)
                    Text(live.artist, color = Muted, fontSize = 24.sp)
                    if (live.program.isNotBlank()) Text(live.program, color = Muted, fontSize = 18.sp)
                    if (live.presenter.isNotBlank()) Text("Locutor: ${live.presenter}", color = White, fontSize = 18.sp)
                    Button(onClick = { screen = Screen.LOGIN; retry++ }) { Text("Sair") }
                }
            }
        }
    }
}

@Composable
private fun rememberRemoteBitmap(url: String): Bitmap? {
    var bitmap by remember(url) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(url) {
        bitmap = if (url.isBlank()) null else withContext(Dispatchers.IO) {
            runCatching {
                val connection = (URL(url).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 7000
                    readTimeout = 7000
                    instanceFollowRedirects = true
                }
                try { connection.inputStream.use { BitmapFactory.decodeStream(it) } }
                finally { connection.disconnect() }
            }.getOrNull()
        }
    }
    return bitmap
}

private suspend fun postJson(functionName: String, body: JSONObject): JSONObject {
    val endpoint = URL("${BuildConfig.SUPABASE_URL}/functions/v1/$functionName")
    val connection = (endpoint.openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = 12000
        readTimeout = 12000
        doOutput = true
        setRequestProperty("Content-Type", "application/json")
        setRequestProperty("apikey", BuildConfig.SUPABASE_ANON_KEY)
        setRequestProperty("Authorization", "Bearer ${BuildConfig.SUPABASE_ANON_KEY}")
    }
    return try {
        connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
        val stream = if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream
        JSONObject(stream.bufferedReader().use { it.readText() })
    } finally { connection.disconnect() }
}

private fun makeQr(value: String): Bitmap {
    val size = 480
    val matrix = QRCodeWriter().encode(value, BarcodeFormat.QR_CODE, size, size)
    return Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888).also { bitmap ->
        for (x in 0 until size) for (y in 0 until size) {
            bitmap.setPixel(x, y, if (matrix[x, y]) android.graphics.Color.BLACK else android.graphics.Color.WHITE)
        }
    }
}
