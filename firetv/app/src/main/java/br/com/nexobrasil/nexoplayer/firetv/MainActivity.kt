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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

private val Bg = Color(0xFF090B12)
private val Accent = Color(0xFF006B3C)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.decorView.systemUiVisibility = 5894 or 1024 or 512
        val prefs = getSharedPreferences("nexo_tv", MODE_PRIVATE)
        val sessionId = prefs.getString("tv_session_id", null) ?: UUID.randomUUID().toString().also {
            prefs.edit().putString("tv_session_id", it).apply()
        }
        setContent {
            MaterialTheme(colorScheme = darkColorScheme(
                background = Bg, surface = Color(0xFF171B24), primary = Accent,
                onBackground = Color.White, onSurface = Color.White
            )) {
                NativePairingScreen(sessionId)
            }
        }
    }
}

@Composable
private fun NativePairingScreen(sessionId: String) {
    var code by remember { mutableStateOf<String?>(null) }
    var qr by remember { mutableStateOf<Bitmap?>(null) }
    var message by remember { mutableStateOf("Conectando à Positiva FM…") }
    var error by remember { mutableStateOf(false) }
    var pairedName by remember { mutableStateOf<String?>(null) }
    var guest by remember { mutableStateOf(false) }
    var retry by remember { mutableIntStateOf(0) }

    LaunchedEffect(retry) {
        code = null; qr = null; error = false; pairedName = null; guest = false
        try {
            val created = withContext(Dispatchers.IO) {
                postJson("tv-pair-create", JSONObject()
                    .put("userSlug", BuildConfig.STATION_SLUG)
                    .put("tvSessionId", sessionId))
            }
            if (!created.optBoolean("ok")) error("Não foi possível gerar o código.")
            val newCode = created.getString("code")
            val pairUrl = "${BuildConfig.PAIR_ORIGIN}/${BuildConfig.STATION_SLUG}/pair?code=$newCode"
            code = newCode
            qr = makeQr(pairUrl)
            message = "Escaneie o QR Code com seu celular, faça login com Google e confirme o pareamento."
        } catch (t: Throwable) {
            error = true
            message = "Não foi possível conectar. Verifique a internet e tente novamente."
        }
    }

    LaunchedEffect(code) {
        val current = code ?: return@LaunchedEffect
        while (pairedName == null) {
            delay(2000)
            try {
                val status = withContext(Dispatchers.IO) {
                    postJson("tv-pair-status", JSONObject().put("code", current).put("tvSessionId", sessionId))
                }
                val row = status.optJSONObject("row")
                if (status.optBoolean("ok") && row?.optString("status") == "claimed") {
                    guest = row.isNull("paired_user_id") && row.isNull("paired_email")
                    pairedName = if (guest) "Visitante" else row.optString("paired_name", "Conectado")
                    message = if (guest) "Acesso de visitante confirmado." else "Conta conectada com sucesso."
                }
            } catch (_: Throwable) { }
        }
    }

    Box(Modifier.fillMaxSize().background(Bg).padding(48.dp), contentAlignment = Alignment.Center) {
        if (pairedName != null) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(18.dp)) {
                Text("POSItiva FM", fontSize = 18.sp, color = Color(0xFFB5C2BE), fontWeight = FontWeight.Bold)
                Text("TV CONECTADA", fontSize = 34.sp, fontWeight = FontWeight.Black)
                Text(pairedName!!, fontSize = 26.sp, color = Color(0xFF80D6A8))
                Text("Pareamento concluído. A próxima etapa é carregar os perfis e a experiência do player.", color = Color.LightGray, textAlign = TextAlign.Center)
            }
        } else {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(56.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(22.dp)) {
                    Text(BuildConfig.STATION_NAME.uppercase(), color = Color(0xFF80D6A8), fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    Text("Sua rádio na TV.", color = Color.White, fontSize = 42.sp, fontWeight = FontWeight.Black, lineHeight = 48.sp)
                    Text(message, color = Color(0xFFBEC5D0), fontSize = 20.sp, lineHeight = 28.sp)
                    if (error) Button(onClick = { retry++ }) { Text("Tentar novamente") }
                    Text("Acesso seguro pelo celular", color = Color(0xFF80D6A8), fontSize = 15.sp)
                }
                Column(Modifier.width(300.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    if (qr != null) {
                        Image(qr!!.asImageBitmap(), contentDescription = "QR Code para parear a TV", modifier = Modifier.size(260.dp).background(Color.White, RoundedCornerShape(16.dp)).padding(12.dp))
                        Text(code ?: "----", fontSize = 32.sp, fontWeight = FontWeight.Black, letterSpacing = 8.sp)
                    } else {
                        CircularProgressIndicator(color = Color(0xFF80D6A8))
                    }
                    Text("APONTE A CÂMERA DO CELULAR", color = Color.LightGray, fontSize = 12.sp, textAlign = TextAlign.Center)
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
    connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
    val stream = if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream
    val result = stream.bufferedReader().use { it.readText() }
    connection.disconnect()
    return JSONObject(result)
}

private fun makeQr(value: String): Bitmap {
    val matrix = QRCodeWriter().encode(value, BarcodeFormat.QR_CODE, 420, 420)
    val bitmap = Bitmap.createBitmap(420, 420, Bitmap.Config.ARGB_8888)
    for (x in 0 until 420) for (y in 0 until 420) {
        bitmap.setPixel(x, y, if (matrix[x, y]) android.graphics.Color.BLACK else android.graphics.Color.WHITE)
    }
    return bitmap
}
