package br.com.nexobrasil.nexoplayer.nativecore

import android.media.audiofx.AudioEffect
import android.media.audiofx.DynamicsProcessing
import android.os.Build
import android.util.Log
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer

/** Shared dynamic leveling curve. dBFS parameters, NOT integrated LUFS.
 *  No custom AudioSink: unsupported effects must not prevent live playback. */
internal object SmartAudioProfile {
    const val THRESHOLD_DB = -20f
    const val RATIO = 2.5f
    const val MAKEUP_DB = 4f
    const val LIMIT_DB = -2f
}

@UnstableApi
@Composable internal fun NativeSmartAudio(player:ExoPlayer,source:String) {
    DisposableEffect(player,source) {
        var effect:AudioEffect?=null
        var attachedSession=0
        fun detach(){
            val previous=effect;effect=null
            runCatching{previous?.setEnabled(false)}
            runCatching{previous?.release()}
        }
        fun attach(session:Int){
            if(session<=0||session==attachedSession)return
            detach()
            attachedSession=session
            if(Build.VERSION.SDK_INT<28){Log.i("NexoSmartAudio","BYPASS $source unsupported API");return}
            try{
                effect=PlatformSmartAudio.attach(session)
                Log.i("NexoSmartAudio","ACTIVE $source session=$session")
            }catch(e:Exception){
                detach();Log.w("NexoSmartAudio","BYPASS $source "+e.javaClass.simpleName)
            }catch(e:LinkageError){
                detach();Log.w("NexoSmartAudio","BYPASS $source platform effect unavailable")
            }
        }
        val listener=object:Player.Listener{
            override fun onAudioSessionIdChanged(audioSessionId:Int){
                if(audioSessionId<=0){detach();attachedSession=0}else attach(audioSessionId)
            }
            override fun onPlayerError(error:androidx.media3.common.PlaybackException){
                detach()
                Log.w("NexoSmartAudio","BYPASS $source playback error")
            }
        }
        player.addListener(listener)
        attach(player.audioSessionId)
        onDispose{player.removeListener(listener);detach()}
    }
}

/** Isolate API 28 classes from the minSdk 26 playback path. */
@android.annotation.TargetApi(28)
private object PlatformSmartAudio {
    fun attach(session:Int):AudioEffect {
        val cfg=DynamicsProcessing.Config.Builder(
            DynamicsProcessing.VARIANT_FAVOR_TIME_RESOLUTION,2,
            false,0,true,1,false,0,true
        ).build()
        cfg.setMbcBandAllChannelsTo(0,DynamicsProcessing.MbcBand(
            true,20000f,35f,900f,SmartAudioProfile.RATIO,SmartAudioProfile.THRESHOLD_DB,
            6f,-75f,1f,0f,SmartAudioProfile.MAKEUP_DB
        ))
        cfg.setLimiterAllChannelsTo(DynamicsProcessing.Limiter(true,true,0,2f,180f,20f,SmartAudioProfile.LIMIT_DB,0f))
        val fx=DynamicsProcessing(0,session,cfg)
        try{
            check(fx.hasControl())
            check(fx.setEnabled(true)==AudioEffect.SUCCESS)
            return fx
        }catch(e:Exception){
            runCatching{fx.release()};throw e
        }
    }
}
