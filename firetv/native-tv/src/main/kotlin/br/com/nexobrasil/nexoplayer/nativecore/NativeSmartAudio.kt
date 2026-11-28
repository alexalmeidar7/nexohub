package br.com.nexobrasil.nexoplayer.nativecore

import android.content.Context
import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.BaseAudioProcessor
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.DefaultAudioSink
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.*

/** Shared PCM RMS leveling for live audio/video and commercials; not a LUFS meter. */
@UnstableApi
internal class NativeLeveler:BaseAudioProcessor(){
    private var gain=1.0
    private var rms=0.0
    override fun onConfigure(inputAudioFormat:AudioProcessor.AudioFormat):AudioProcessor.AudioFormat =
        if(inputAudioFormat.encoding==C.ENCODING_PCM_16BIT)inputAudioFormat else AudioProcessor.AudioFormat.NOT_SET
    override fun onFlush(){gain=1.0;rms=0.0}
    override fun queueInput(inputBuffer:ByteBuffer){
        val source=inputBuffer.order(ByteOrder.LITTLE_ENDIAN)
        val out=replaceOutputBuffer(source.remaining()).order(ByteOrder.LITTLE_ENDIAN)
        val channels=inputAudioFormat.channelCount.coerceAtLeast(1)
        val chunk=(inputAudioFormat.sampleRate/50).coerceAtLeast(1)*channels
        while(source.remaining()>=2){
            val count=minOf(chunk,source.remaining()/2)
            val start=source.position()
            var power=0.0
            for(i in 0 until count){val v=source.getShort(start+i*2)/32768.0;power+=v*v}
            val level=sqrt(power/count)
            if(level>.003){rms=if(rms==0.0)level else rms*.90+level*.10}
            val target=if(rms>.003)(.126/rms).coerceIn(.25,4.0)else 1.0
            val next=if(target<gain)gain+(target-gain)*.28 else gain+(target-gain)*.035
            for(i in 0 until count){
                val v=source.short/32768.0
                val g=gain+(next-gain)*(i+1)/count
                out.putShort((v*g*32768).roundToInt().coerceIn(-26000,26000).toShort())
            }
            gain=next
        }
        if(source.hasRemaining())out.put(source.get())
        out.flip()
    }
}
@UnstableApi
internal class LevelingRenderers(context:Context):DefaultRenderersFactory(context){
    override fun buildAudioSink(context:Context,enableFloatOutput:Boolean,enableAudioTrackPlaybackParams:Boolean):AudioSink =
        DefaultAudioSink.Builder(context).setEnableFloatOutput(false).setEnableAudioTrackPlaybackParams(false).setAudioProcessors(arrayOf(NativeLeveler())).build()
}
