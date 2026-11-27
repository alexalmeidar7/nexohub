package br.com.nexobrasil.nexoplayer.nativecore

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.PlaybackException
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import kotlinx.coroutines.delay
import org.json.JSONObject

@Composable internal fun NativePreroll(media:JSONObject,audio:Boolean,onStarted:()->Unit,onFinish:()->Unit){
    val context=LocalContext.current
    val finish by rememberUpdatedState(onFinish)
    val started by rememberUpdatedState(onStarted)
    val player=remember(media){ExoPlayer.Builder(context).build()}
    var remaining by remember(media){mutableIntStateOf(-1)}
    var done by remember(media){mutableStateOf(false)}
    var played by remember(media){mutableStateOf(false)}
    var qr by remember(media){mutableStateOf(false)}
    fun complete(){if(!done){done=true;player.pause();finish()}}
    DisposableEffect(player){
        val listener=object:Player.Listener{
            override fun onIsPlayingChanged(isPlaying:Boolean){if(isPlaying&&!played){played=true;started()}}
            override fun onPlaybackStateChanged(playbackState:Int){if(playbackState==Player.STATE_ENDED)complete()}
            override fun onPlayerError(error:PlaybackException){complete()}
        }
        player.addListener(listener);player.setMediaItem(MediaItem.fromUri(media.str("url")));player.prepare();player.play()
        onDispose{player.removeListener(listener);player.release()}
    }
    LaunchedEffect(player){
        var stall=0;var position=-1L
        while(!done){
            val d=player.duration
            remaining=if(d>0)((d-player.currentPosition+999)/1000).toInt().coerceAtLeast(0)else -1
            if(position==player.currentPosition)stall++ else stall=0
            position=player.currentPosition
            if(stall>=60){complete();break}
            delay(250)
        }
    }
    TvViewport(Modifier.background(Color.Black)){u->
        Box(Modifier.fillMaxSize().background(Color.Black)){
            if(audio)Artwork(safeImage(media.str("backgroundUrl")),Modifier.fillMaxSize(),scale=ContentScale.Fit)
            else AndroidView(factory={ctx->PlayerView(ctx).apply{useController=false;this.player=player;isFocusable=false}},modifier=Modifier.fillMaxSize(),onRelease={it.player=null})
            Copy("publicidade"+if(remaining>=0)" · "+remaining/60+":"+("%02d".format(remaining%60))else "",u,25,600,u.at(100,75,700,60))
            if(media.str("link").startsWith("https://")){
                GlassButton(u,"Saiba mais +",u.at(1450,890,330,65)){qr=!qr}
                if(qr)NativeQr(media.str("link"),u.at(1440,510,330,330))
            }
            if(remaining in 1..5)GlassButton(u,"pular",u.at(1600,75,210,65)){complete()}
        }
    }
}
