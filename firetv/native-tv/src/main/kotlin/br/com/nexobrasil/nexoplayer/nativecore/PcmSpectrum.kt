package br.com.nexobrasil.nexoplayer.nativecore

import android.content.Context
import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.BaseAudioProcessor
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.DefaultAudioSink
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlinx.coroutines.delay
import kotlin.math.*

@UnstableApi
internal class PcmSpectrum:BaseAudioProcessor() {
    @Volatile var levels=FloatArray(42)
        private set
    private var last=0L
    private val real=DoubleArray(512)
    private val imag=DoubleArray(512)
    override fun onConfigure(inputAudioFormat:AudioProcessor.AudioFormat):AudioProcessor.AudioFormat =
        if(inputAudioFormat.encoding==C.ENCODING_PCM_16BIT) inputAudioFormat else AudioProcessor.AudioFormat.NOT_SET
    override fun queueInput(inputBuffer:ByteBuffer) {
        val now=android.os.SystemClock.elapsedRealtime()
        val channels=inputAudioFormat.channelCount.coerceAtLeast(1)
        val n=512
        val frameBytes=channels*2
        try { if(now-last>=40 && inputBuffer.remaining()>=n*frameBytes) {
            last=now
            val src=inputBuffer.duplicate().order(ByteOrder.LITTLE_ENDIAN)
            val start=src.position()
            for(i in 0 until n) {
                var v=0.0
                for(ch in 0 until channels) v+=src.getShort(start+i*frameBytes+ch*2)/32768.0
                real[i]=v/channels*(.5-.5*cos(2*PI*i/(n-1)))
                imag[i]=0.0
            }
            var j=0
            for(i in 1 until n) {
                var bit=n shr 1
                while((j and bit) != 0){j=j xor bit;bit=bit shr 1}
                j=j xor bit
                if(i<j){val x=real[i];real[i]=real[j];real[j]=x}
            }
            var len=2
            while(len<=n){
                val angle=-2*PI/len
                val c=cos(angle);val si=sin(angle)
                for(i in 0 until n step len){
                    var wr=1.0;var wi=0.0
                    for(k in 0 until len/2){
                        val x=i+k;val y=x+len/2
                        val tr=wr*real[y]-wi*imag[y];val ti=wr*imag[y]+wi*real[y]
                        real[y]=real[x]-tr;imag[y]=imag[x]-ti;real[x]+=tr;imag[x]+=ti
                        val nr=wr*c-wi*si;wi=wr*si+wi*c;wr=nr
                    }
                }
                len*=2
            }
            val prior=levels
            levels=FloatArray(42){i->
                val lo=1+(254.0.pow(i/42.0)).toInt()
                val hi=(1+254.0.pow((i+1)/42.0).toInt()).coerceAtMost(255)
                var peak=0.0
                for(k in lo.coerceAtMost(255)..maxOf(lo,hi).coerceAtMost(255))peak=maxOf(peak,hypot(real[k],imag[k])/n)
                maxOf(prior[i]*.76f,(sqrt(peak)*2.8).toFloat().coerceIn(0f,1f))
            }
        }
        } catch (_:Exception) { levels=FloatArray(42) }
        val out=replaceOutputBuffer(inputBuffer.remaining())
        out.put(inputBuffer);out.flip()
    }
    override fun onFlush(){levels=FloatArray(42)}
}
@UnstableApi
internal class SpectrumRenderers(context:Context,private val spectrum:PcmSpectrum):DefaultRenderersFactory(context) {
    override fun buildAudioSink(context:Context,enableFloatOutput:Boolean,enableAudioTrackPlaybackParams:Boolean):AudioSink =
        DefaultAudioSink.Builder(context).setEnableFloatOutput(false).setEnableAudioTrackPlaybackParams(false).setAudioProcessors(arrayOf(spectrum)).build()
}
@Composable internal fun SpectrumBars(spectrum:PcmSpectrum,playing:Boolean,color:Color,modifier:Modifier,count:Int) {
    var levels by remember { mutableStateOf(FloatArray(42)) }
    LaunchedEffect(spectrum,playing){if(!playing)levels=FloatArray(42) else while(true){levels=spectrum.levels;delay(40)}}
    Canvas(modifier) {
        repeat(count){i->
            val from=i*42/count;val to=maxOf(from+1,(i+1)*42/count)
            val level=(from until to).maxOf{levels[it]}
            val x=size.width*(i+.5f)/count
            val height=size.height*(.08f+.84f*level)
            drawLine(color,Offset(x,(size.height-height)/2),Offset(x,(size.height+height)/2),strokeWidth=size.width/count*.42f,cap=StrokeCap.Round)
        }
    }
}
