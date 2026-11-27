package br.com.nexobrasil.nexoplayer.nativecore

import android.app.ActivityManager
import android.content.Context
import android.net.ConnectivityManager
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import kotlinx.coroutines.delay

internal fun nativeNetworkAvailable(context:Context):Boolean=runCatching{(context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager).activeNetwork!=null}.getOrDefault(true)
internal fun nativeLoadControl(context:Context,mosaic:Boolean=false):DefaultLoadControl{
    val low=runCatching{val m=context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager;m.isLowRamDevice||m.memoryClass<192}.getOrDefault(true)
    return DefaultLoadControl.Builder().setBufferDurationsMs(if(mosaic)5000 else 10000,if(mosaic)12000 else if(low)25000 else 40000,if(mosaic)900 else 1000,if(mosaic)1500 else 2500).setPrioritizeTimeOverSizeThresholds(true).build()
}

@Composable internal fun NativePerformanceOverlay(player:ExoPlayer,mode:String,reads:Int,events:Int,recoveries:Int,lastResponse:Long,rtt:Long,sync:SyncStatus,forcePolling:Boolean,onTogglePolling:()->Unit){
    var sample by remember{mutableStateOf("")}
    LaunchedEffect(player){while(true){
        val runtime=Runtime.getRuntime();val used=(runtime.totalMemory()-runtime.freeMemory())/1048576
        val format=player.videoFormat
        val dropped=player.videoDecoderCounters?.droppedBufferCount?:0
        sample="RAM Java: ${used} MB  •  Buffer: ${(player.bufferedPosition-player.currentPosition).coerceAtLeast(0)/1000}s\nVídeo: ${format?.width?:0} × ${format?.height?:0}  •  Frames perdidos: $dropped\nBitrate do vídeo: ${(format?.bitrate?:0).coerceAtLeast(0)/1000} kbps"
        delay(1000)
    }}
    TvViewport(Modifier.fillMaxSize()){u->
        Column(Modifier.width(u.space(650)).offset(u.space(100),u.space(100)).background(Color.Black.copy(alpha=.92f),u.round(18)).padding(u.space(20)),verticalArrangement=Arrangement.spacedBy(u.space(8))){
            Copy("NEXO • Diagnóstico técnico",u,25,700)
            Copy(mode,u,22,600)
            Copy("Leituras: $reads  •  Eventos confirmados: $events  •  Reconexões: $recoveries",u,18,400,lines=2)
            Copy("API: ${rtt} ms  •  Última resposta: ${if(lastResponse>0)java.text.SimpleDateFormat("HH:mm:ss",java.util.Locale.ROOT).format(java.util.Date(lastResponse))else "—"}",u,18)
            Copy(sync.mode,u,18,400,lines=2)
            Copy(sample,u,18,400,lines=5)
            GlassButton(u,if(forcePolling)"Restaurar Realtime experimental" else "Forçar consultas de 2s",Modifier.height(u.space(48)),onClick=onTogglePolling)
            Copy("Menu 3 vezes para ocultar",u,16)
        }
    }
}
