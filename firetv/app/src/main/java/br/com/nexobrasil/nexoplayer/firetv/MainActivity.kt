package br.com.nexobrasil.nexoplayer.firetv

import android.graphics.Bitmap
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter

private val Night = Color(0xFF08030B)
private val Red = Color(0xFFFF1018)
private val White = Color(0xFFFFFFFF)
private val Muted = Color(0xFFD6D0D7)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.decorView.systemUiVisibility = 5894 or 1024 or 512
        val prefs = getSharedPreferences("nexo_tv", MODE_PRIVATE)
        val tvSessionId = prefs.getString("tv_session_id", null) ?: UUID.randomUUID().toString().also {
            prefs.edit().putString("tv_session_id", it).apply()
        }
        setContent {
            MaterialTheme(colorScheme = darkColorScheme(primary = Red, background = Night, surface = Color(0xFF21151F))) {
                TvFlow(prefs, tvSessionId)
            }
        }
    }
}

private enum class TvScreen { SPLASH, PAIRING, PROFILE }

@Composable
private fun TvFlow(prefs: android.content.SharedPreferences, tvSessionId: String) {
    var screen by remember { mutableStateOf(TvScreen.SPLASH) }
    var code by remember { mutableStateOf<String?>(null) }
    var qr by remember { mutableStateOf<Bitmap?>(null) }
    var profileName by remember { mutableStateOf(prefs.getString("profile_name", null) ?: "") }
    var profileAvatar by remember { mutableStateOf(prefs.getString("profile_avatar", null) ?: "") }
    var message by remember { mutableStateOf("Preparando sua experiência…") }
    var errorDetail by remember { mutableStateOf("") }
    var retry by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        delay(900)
        val savedCode = prefs.getString("paired_code", null)
        if (!savedCode.isNullOrBlank()) {
            try {
                val status = withContext(Dispatchers.IO) {
                    postJson("tv-pair-status", JSONObject().put("code", savedCode).put("tvSessionId", tvSessionId))
                }
                val row = status.optJSONObject("row")
                if (status.optBoolean("ok") && row?.optString("status") == "claimed") {
                    profileName = row.optString("paired_name", "Visitante")
                    profileAvatar = row.optString("paired_avatar", "")
                    screen = TvScreen.PROFILE
                    return@LaunchedEffect
                }
            } catch (_: Throwable) { }
            prefs.edit().remove("paired_code").remove("profile_name").remove("profile_avatar").remove("guest_mode").apply()
        }
        screen = TvScreen.PAIRING
    }

    LaunchedEffect(retry, screen) {
        if (screen != TvScreen.PAIRING) return@LaunchedEffect
        code = null
        qr = null
        message = "Conectando à Positiva FM…"
        errorDetail = ""
        try {
            val created = withContext(Dispatchers.IO) {
                postJson("tv-pair-create", JSONObject()
                    .put("userSlug", BuildConfig.STATION_SLUG)
                    .put("tvSessionId", tvSessionId))
            }
            if (!created.optBoolean("ok")) {
                val reason = created.optString("reason", "erro_desconhecido")
                throw IllegalStateException(reason)
            }
            val newCode = created.getString("code")
            val pairUrl = "${BuildConfig.PAIR_ORIGIN}/${BuildConfig.STATION_SLUG}/pair?code=$newCode"
            code = newCode
            qr = makeQr(pairUrl)
            message = "Escaneie o QR Code, entre com sua conta Google e confirme o código que aparece na sua TV."
        } catch (t: Throwable) {
            errorDetail = t.message ?: "falha_de_conexao"
            message = "Não foi possível conectar. Verifique a internet e tente novamente."
        }
    }

    LaunchedEffect(code) {
        val current = code ?: return@LaunchedEffect
        while (screen == TvScreen.PAIRING) {
            delay(1800)
            try {
                val status = withContext(Dispatchers.IO) {
                    postJson("tv-pair-status", JSONObject().put("code", current).put("tvSessionId", tvSessionId))
                }
                val row = status.optJSONObject("row")
                if (status.optBoolean("ok") && row?.optString("status") == "claimed") {
                    profileName = row.optString("paired_name", "Visitante")
                    profileAvatar = row.optString("paired_avatar", "")
                    prefs.edit().remove("guest_mode").putString("paired_code", current)
                        .putString("profile_name", profileName)
                        .putString("profile_avatar", profileAvatar).apply()
                    screen = TvScreen.PROFILE
                    break
                }
            } catch (_: Throwable) { }
        }
    }

    Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(Color(0xFF17000A), Night, Color(0xFF10051A)))).padding(52.dp)) {
        when (screen) {
            TvScreen.SPLASH -> Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(24.dp)) {
                Text("POSITIVA FM", color = Red, fontSize = 27.sp, fontWeight = FontWeight.Black, letterSpacing = 2.sp)
                Text("nexo player", color = White, fontSize = 20.sp, fontWeight = FontWeight.Medium)
                CircularProgressIndicator(color = Red, strokeWidth = 3.dp)
            }
            TvScreen.PAIRING -> Row(Modifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(48.dp)) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(20.dp)) {
                    Text("POSITIVA FM", color = Red, fontSize = 19.sp, fontWeight = FontWeight.Bold)
                    Text("Sua rádio na TV.", color = White, fontSize = 48.sp, fontWeight = FontWeight.Black)
                    Text(message, color = Muted, fontSize = 23.sp, lineHeight = 32.sp)
                    if (errorDetail.isNotBlank()) Text("Detalhe técnico: $errorDetail", color = Color(0xFFFFA6AA), fontSize = 14.sp)
                    if (errorDetail.isNotBlank()) Button(onClick = { retry++ }, colors = ButtonDefaults.buttonColors(containerColor = Red)) { Text("Tentar novamente", color = White) }
                    Text("Acesso seguro pelo celular", color = White, fontSize = 17.sp)
                    Button(
                        onClick = {
                            // Visitante funciona localmente, sem depender do QR ou do servidor.
                            profileName = "Visitante"
                            profileAvatar = ""
                            prefs.edit()
                                .remove("paired_code")
                                .putBoolean("guest_mode", true)
                                .putString("profile_name", profileName)
                                .remove("profile_avatar")
                                .apply()
                            screen = TvScreen.PROFILE
                        },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Red,
                            contentColor = readableForeground(Red)
                        ),
                        modifier = Modifier.widthIn(min = 260.dp)
                    ) {
                        Text("ENTRAR COMO VISITANTE", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    }
                }
                Column(Modifier.width(310.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    if (qr != null) Image(qr!!.asImageBitmap(), contentDescription = "QR Code de acesso", modifier = Modifier.size(270.dp).background(White, RoundedCornerShape(20.dp)).padding(12.dp))
                    else CircularProgressIndicator(color = Red, modifier = Modifier.size(54.dp))
                    Text(code ?: "----", color = White, fontSize = 35.sp, fontWeight = FontWeight.Black, letterSpacing = 7.sp)
                    Text("APONTE A CÂMERA DO CELULAR", color = White, fontSize = 12.sp, textAlign = TextAlign.Center)
                }
            }
            TvScreen.PROFILE -> Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.Start, verticalArrangement = Arrangement.spacedBy(26.dp)) {
                Text("bem-vindo de volta", color = White, fontSize = 30.sp, fontWeight = FontWeight.Bold)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(22.dp)) {
                    Box(Modifier.size(112.dp).background(Color(0xFF56343B), RoundedCornerShape(22.dp)), contentAlignment = Alignment.Center) {
                        Text(if (profileName.isBlank()) "🙂" else profileName.take(1).uppercase(), color = White, fontSize = 42.sp, fontWeight = FontWeight.Bold)
                    }
                    Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
                        Text(profileName.ifBlank { "Visitante" }, color = White, fontSize = 25.sp, fontWeight = FontWeight.SemiBold)
                        Text("Perfil conectado", color = Muted, fontSize = 16.sp)
                        Button(onClick = {
                            prefs.edit().remove("paired_code").remove("profile_name").remove("profile_avatar").apply()
                            profileName = ""
                            screen = TvScreen.PAIRING
                            retry++
                        }, colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF353035))) { Text("sair", color = White) }
                    }
                }
            }
        }
    }
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

private fun readableForeground(background: Color): Color {
    val luminance = 0.2126 * background.red + 0.7152 * background.green + 0.0722 * background.blue
    return if (luminance > 0.52) Color.Black else Color.White
}

private fun makeQr(value: String): Bitmap {
    val matrix = QRCodeWriter().encode(value, BarcodeFormat.QR_CODE, 420, 420)
    val bitmap = Bitmap.createBitmap(420, 420, Bitmap.Config.ARGB_8888)
    for (x in 0 until 420) for (y in 0 until 420) {
        bitmap.setPixel(x, y, if (matrix[x, y]) android.graphics.Color.BLACK else android.graphics.Color.WHITE)
    }
    return bitmap
}
