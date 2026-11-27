package br.com.nexobrasil.nexoplayer.nativecore

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.border
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.text.style.TextAlign
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.AudioAttributes
import androidx.media3.common.MimeTypes
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.common.Player
import androidx.media3.common.PlaybackException
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import kotlinx.coroutines.delay
import org.json.JSONObject

@Composable internal fun NativePreroll(media:JSONObject,audio:Boolean,onStarted:()->Unit,onFinish:()->Unit,smart:Boolean=false,breakStart:Long=0L,breakDuration:Double=0.0,onPlayed:()->Unit={},onBack:()->Unit={},commercialPhone:String=""){
    val context=LocalContext.current
    val finish by rememberUpdatedState(onFinish)
    val started by rememberUpdatedState(onStarted)
    val playedCallback by rememberUpdatedState(onPlayed)
    val skipFocus=remember{FocusRequester()}
    var progress by remember{mutableFloatStateOf(0f)}
    val player=remember(media){
        val http=DefaultHttpDataSource.Factory().setUserAgent("NexoTV/"+BuildConfig.VERSION_NAME).setConnectTimeoutMs(15000).setReadTimeoutMs(20000)
        ExoPlayer.Builder(context,LevelingRenderers(context)).setMediaSourceFactory(DefaultMediaSourceFactory(context).setDataSourceFactory(DefaultDataSource.Factory(context,http))).build().apply{setAudioAttributes(AudioAttributes.DEFAULT,false);volume=0f}
    }

    var remaining by remember(media){mutableIntStateOf(-1)}
    var done by remember(media){mutableStateOf(false)}
    var played by remember(media){mutableStateOf(false)}
    var qr by remember(media){mutableStateOf(false)}
    var info by remember{mutableStateOf(false)};var contact by remember{mutableStateOf(false)}
    val infoFocus=remember{FocusRequester()};val closeFocus=remember{FocusRequester()};val contactFocus=remember{FocusRequester()};val qrFocus=remember{FocusRequester()}
    val phone=commercialPhone.filter{it.isDigit()}.let{if(it.length in 10..11)"55"+it else it}
    val contactUrl=if(phone.length in 12..15)"https://wa.me/"+phone else ""
    val showLink=media.str("link").startsWith("https://")
    BackHandler {if(contact)contact=false else if(info)info=false else if(qr)qr=false else if(smart)onBack()}
    LaunchedEffect(info,contact){withFrameNanos{};runCatching{(if(contact)contactFocus else if(info)closeFocus else if(showLink)qrFocus else infoFocus).requestFocus()}}
    fun complete(){if(!done){done=true;player.stop();finish()}}
    DisposableEffect(player){
        val listener=object:Player.Listener{
            override fun onIsPlayingChanged(isPlaying:Boolean){if(isPlaying&&!played){played=true;started();playedCallback()}}
            override fun onPlaybackStateChanged(playbackState:Int){if(playbackState==Player.STATE_ENDED)complete()}
            override fun onPlayerError(error:PlaybackException){android.util.Log.w("NexoPlayback",(if(smart)"SMART_BREAK_" else if(audio)"PREROLL_AUDIO_" else "PREROLL_VIDEO_")+error.errorCodeName,error);complete()}
        }
        player.addListener(listener);try{
            val url=media.str("url").trim();val item=MediaItem.Builder().setUri(url)
            if(url.contains(".m3u8",true))item.setMimeType(MimeTypes.APPLICATION_M3U8)
            player.setMediaItem(item.build());player.prepare();player.play()
        }catch(_:Exception){complete()}
        onDispose{player.removeListener(listener);player.release()}
    }
    LaunchedEffect(player,played){if(played){for(i in 1..12){player.volume=i/12f;delay(50)}}}
    LaunchedEffect(player){
        var stall=0;var position=-1L;val deadline=android.os.SystemClock.elapsedRealtime()+180000L
        while(!done){
            val d=player.duration
            remaining=if(d>0)((d-player.currentPosition+999)/1000).toInt().coerceAtLeast(0)else -1
            if(position==player.currentPosition)stall++ else stall=0
            position=player.currentPosition
            if(stall>=48||android.os.SystemClock.elapsedRealtime()>=deadline){complete();break}
            if(smart&&breakDuration>0&&breakStart>0)progress=((System.currentTimeMillis()-breakStart)/(breakDuration*1000)).toFloat().coerceIn(0f,1f)
            delay(250)
        }
    }
    TvViewport(Modifier.background(Color.Black)){u->
        Box(Modifier.fillMaxSize().background(Color.Black)){
            if(audio){val image=safeImage(media.str("backgroundUrl"));if(image!=null)Artwork(image,Modifier.fillMaxSize(),scale=ContentScale.Fit)else if(smart)Column(Modifier.align(Alignment.Center),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(u.space(20))){Symbol("music",Modifier.size(u.space(80)));Copy("Intervalo comercial",u,36,600);Copy("A programação volta em instantes",u,24)}}
            else AndroidView(factory={ctx->PlayerView(ctx).apply{useController=false;this.player=player;isFocusable=false}},modifier=Modifier.fillMaxSize(),onRelease={it.player=null})
            if(smart){
                Row(u.at(1440,75,390,64),horizontalArrangement=Arrangement.spacedBy(u.space(14)),verticalAlignment=Alignment.CenterVertically){
                    GlassButton(u,"",Modifier.size(u.space(60)),icon="left",enabled=!info,onClick=onBack)
                    GlassButton(u,"smart break +",Modifier.height(u.space(60)).focusRequester(infoFocus),enabled=!info){info=true}
                }
            }else Box(Modifier.offset(u.space(100),u.space(75)).height(u.space(60)).border(u.space(2),Color.White,u.round(30)).padding(horizontal=u.space(22)),contentAlignment=Alignment.Center){Copy("publicidade"+if(remaining>=0)" · "+remaining/60+":"+("%02d".format(remaining%60))else "",u,25,600)}
            if(showLink){
                val side=if(qr)218 else 156
                var focused by remember{mutableStateOf(false)}
                Column(u.at(1815-side-28,1005-side-66,side+28,side+66).focusRequester(qrFocus).onFocusChanged{focused=it.isFocused}.focusProperties{canFocus=!info}.clip(u.round(20)).background(glass).border(u.space(if(focused)3 else 1),Color.White.copy(alpha=if(focused)1f else .18f),u.round(20)).clickable(enabled=!info){qr=!qr}.padding(u.space(12)),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(u.space(10))){
                    Copy("Saiba mais +",u,19,600)
                    NativeQr(media.str("link"),Modifier.size(u.space(side)).clip(u.round(8)),compact=true)
                }
            }
            if(!smart&&remaining in 1..15){LaunchedEffect(Unit){skipFocus.requestFocus()};GlassButton(u,"pular",u.at(500,75,210,65).focusRequester(skipFocus)){complete()}}
            if(smart&&breakDuration>0&&breakStart>0)Box(u.at(100,155,650,8).background(Color.White.copy(alpha=.25f))){Box(Modifier.fillMaxHeight().fillMaxWidth(progress).background(Color.White))}
            if(smart&&info)Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha=.65f)),contentAlignment=Alignment.Center){
                Column(Modifier.width(u.space(800)).background(Color(0xFF242529),u.round(28)).padding(u.space(36)),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(u.space(24))){
                    if(!contact){
                        GlassButton(u,"",Modifier.align(Alignment.End).size(u.space(54)).focusRequester(closeFocus),icon="left"){info=false}
                        Copy("O que é o Smart Break?",u,32,700,align=TextAlign.Center)
                        Copy("Uma experiência de publicidade digital que conecta marcas e ouvintes durante os intervalos da programação ao vivo.",u,24,400,lines=4,align=TextAlign.Center)
                        GlassButton(u,"Entre no Smart Break / Dep. Comercial",Modifier.height(u.space(64)),enabled=contactUrl.isNotBlank()){contact=true}
                        if(contactUrl.isBlank())Copy("Contato comercial não cadastrado.",u,19,400)
                    }else{
                        NativeQr(contactUrl,Modifier.size(u.space(220)).clip(u.round(12)),compact=true)
                        GlassButton(u,"",Modifier.size(u.space(54)).focusRequester(contactFocus),icon="left"){contact=false}
                    }
                }
            }
        }
    }
}
