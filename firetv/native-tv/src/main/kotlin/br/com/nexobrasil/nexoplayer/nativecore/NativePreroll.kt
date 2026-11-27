package br.com.nexobrasil.nexoplayer.nativecore

import androidx.compose.foundation.background
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.togetherWith
import androidx.compose.animation.SizeTransform
import android.view.LayoutInflater
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.ui.zIndex
import kotlin.math.ceil
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

@Composable internal fun NativePreroll(media:JSONObject,audio:Boolean,onStarted:()->Unit,onFinish:()->Unit,smart:Boolean=false,breakStart:Long=0L,breakDuration:Double=0.0,serverClockOffset:Long=0L,onPlayed:()->Unit={},onBack:()->Unit={},commercialPhone:String="",smartSerial:Int=0,smartActive:Boolean=true){
    val context=LocalContext.current
    val finish by rememberUpdatedState(onFinish)
    val started by rememberUpdatedState(onStarted)
    val playedCallback by rememberUpdatedState(onPlayed)
    val skipFocus=remember{FocusRequester()}
    var progress by remember{mutableFloatStateOf(0f)}
    var breakRemaining by remember{mutableLongStateOf(-1L)}
    val currentBreakStart by rememberUpdatedState(breakStart)
    val currentBreakDuration by rememberUpdatedState(breakDuration)
    val currentClockOffset by rememberUpdatedState(serverClockOffset)
    val player=remember(media,smartSerial){
        val http=DefaultHttpDataSource.Factory().setUserAgent("NexoTV/"+BuildConfig.VERSION_NAME).setConnectTimeoutMs(15000).setReadTimeoutMs(20000)
        ExoPlayer.Builder(context,LevelingRenderers(context)).setMediaSourceFactory(DefaultMediaSourceFactory(context).setDataSourceFactory(DefaultDataSource.Factory(context,http))).build().apply{setAudioAttributes(AudioAttributes.DEFAULT,false);volume=0f}
    }

    var remaining by remember(media,smartSerial){mutableIntStateOf(-1)}
    var done by remember(media,smartSerial){mutableStateOf(false)}
    var played by remember(media,smartSerial){mutableStateOf(false)}
    var qr by remember(media,smartSerial){mutableStateOf(false)}
    var info by remember{mutableStateOf(false)};var contact by remember{mutableStateOf(false)}
    val infoFocus=remember{FocusRequester()};val closeFocus=remember{FocusRequester()};val announceFocus=remember{FocusRequester()};val qrFocus=remember{FocusRequester()}
    val phone=commercialPhone.filter{it.isDigit()}.let{if(it.length in 10..11)"55"+it else it}
    val contactUrl=if(phone.length in 12..15)"https://wa.me/"+phone else ""
    val showLink=media.str("link").startsWith("https://")
    val active by rememberUpdatedState(smartActive)
    var buttonsEntered by remember{mutableStateOf(false)}
    LaunchedEffect(smart,smartActive){if(smart){if(smartActive){delay(100);buttonsEntered=true}else buttonsEntered=false}}
    BackHandler(enabled=!smart||smartActive) {if(contact)contact=false else if(info)info=false else if(qr)qr=false else if(smart)onBack()}
    LaunchedEffect(info,buttonsEntered,smartActive){if(smart&&smartActive&&buttonsEntered){withFrameNanos{};runCatching{(if(info&&contactUrl.isNotBlank())announceFocus else if(info)closeFocus else infoFocus).requestFocus()}}}
    fun complete(){if(!done){done=true;player.stop();if(!smart||active)finish()}}
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
    LaunchedEffect(player,smartActive){if(smart&&!smartActive){player.volume=0f;player.pause()}}
    LaunchedEffect(player,played,smartActive){if(played&&(!smart||smartActive)){for(i in 1..12){player.volume=i/12f;delay(50)}}}
    LaunchedEffect(player){
        var stall=0;var position=-1L;val deadline=android.os.SystemClock.elapsedRealtime()+180000L
        while(!done){
            val d=player.duration
            remaining=if(d>0)((d-player.currentPosition+999)/1000).toInt().coerceAtLeast(0)else -1
            if(position==player.currentPosition)stall++ else stall=0
            position=player.currentPosition
            if(stall>=48||android.os.SystemClock.elapsedRealtime()>=deadline){complete();break}
            if(smart){val timing=smartBreakTiming(currentBreakStart,currentBreakDuration,System.currentTimeMillis()+currentClockOffset);progress=timing?.first?:0f;breakRemaining=timing?.second?:-1L}
            delay(250)
        }
    }
    TvViewport(Modifier.background(Color.Black)){u->
        Box(Modifier.fillMaxSize().background(Color.Black)){
            if(audio){val image=safeImage(media.str("backgroundUrl"));if(image!=null)Artwork(image,Modifier.fillMaxSize(),scale=ContentScale.Fit)else if(smart)Column(Modifier.align(Alignment.Center),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(u.space(20))){Symbol("music",Modifier.size(u.space(80)));Copy("Intervalo comercial",u,36,600);Copy("A programação volta em instantes",u,24)}}
            else key(player){AndroidView(factory={ctx->(if(smart)LayoutInflater.from(ctx).inflate(R.layout.smart_break_player,null) as PlayerView else PlayerView(ctx)).apply{useController=false;this.player=player;isFocusable=false;isFocusableInTouchMode=false;descendantFocusability=android.view.ViewGroup.FOCUS_BLOCK_DESCENDANTS}},modifier=Modifier.fillMaxSize(),onRelease={it.player=null},update={it.player=player})}
            if(smart){
                AnimatedVisibility(buttonsEntered,modifier=Modifier.align(Alignment.TopStart).padding(top=u.space(75),start=u.space(100)),enter=slideInHorizontally(tween(400)){-it/3}+fadeIn(tween(400)),exit=slideOutHorizontally(tween(400)){-it/3}+fadeOut(tween(400))){
                    Row(horizontalArrangement=Arrangement.spacedBy(u.space(14)),verticalAlignment=Alignment.CenterVertically){
                        GlassButton(u,"",Modifier.size(u.space(60)),icon="left",enabled=!info&&smartActive,onClick=onBack)
                        GlassButton(u,"smart break +",Modifier.height(u.space(60)).focusRequester(infoFocus),enabled=!info&&smartActive){info=true}
                    }
                }
            }else Row(Modifier.offset(u.space(100),u.space(75)),horizontalArrangement=Arrangement.spacedBy(u.space(12)),verticalAlignment=Alignment.CenterVertically){
                Box(Modifier.height(u.space(60)).border(u.space(2),Color.White,u.round(30)).padding(horizontal=u.space(22)),contentAlignment=Alignment.Center){Copy("publicidade"+if(remaining>=0)" · "+remaining/60+":"+("%02d".format(remaining%60))else "",u,25,600)}
                if(remaining in 1..15){LaunchedEffect(Unit){skipFocus.requestFocus()};GlassButton(u,"pular",Modifier.height(u.space(60)).focusRequester(skipFocus),icon="right",iconAfter=true){complete()}}
            }
            if(smart){
                // Identity includes the playback sequence so identical links animate on every creative change.
                val target=smartSerial to media.str("link").takeIf{showLink&&smartActive}.orEmpty()
                AnimatedContent(targetState=target,modifier=Modifier.align(Alignment.BottomEnd).padding(end=u.space(105),bottom=u.space(75)).size(u.space(246),u.space(284)),contentAlignment=Alignment.BottomEnd,transitionSpec={
                    ((slideInHorizontally(tween(250,delayMillis=250)){it+(120*u.pixelsPerUnit).toInt()}+fadeIn(tween(250,delayMillis=250))) togetherWith (slideOutHorizontally(tween(250)){it+(120*u.pixelsPerUnit).toInt()}+fadeOut(tween(250)))).using(SizeTransform(clip=false))
                },label="smartCreativeQr"){entry->
                    if(entry.second.isNotBlank()){
                        val isCurrent=entry==target
                        var focused by remember{mutableStateOf(false)}
                        val side=if(isCurrent&&qr)218 else 156
                        Column(Modifier.width(u.space(side+28)).clip(u.round(20)).then(if(isCurrent)Modifier.focusRequester(qrFocus)else Modifier).onFocusChanged{focused=it.isFocused}.focusProperties{canFocus=isCurrent&&!info&&smartActive}.background(glass).border(u.space(if(focused)3 else 1),Color.White.copy(alpha=if(focused)1f else .18f),u.round(20)).clickable(enabled=isCurrent&&!info&&smartActive){qr=!qr}.padding(u.space(12)),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(u.space(10))){
                            Copy("Saiba mais +",u,19,600)
                            NativeQr(entry.second,Modifier.size(u.space(side)).clip(u.round(8)),compact=true)
                        }
                    }
                }
            }else if(showLink){
                val side=if(qr)218 else 156
                var focused by remember{mutableStateOf(false)}
                Column(u.at(1815-side-28,1005-side-66,side+28,side+66).focusRequester(qrFocus).onFocusChanged{focused=it.isFocused}.focusProperties{canFocus=!info}.clip(u.round(20)).background(glass).border(u.space(if(focused)3 else 1),Color.White.copy(alpha=if(focused)1f else .18f),u.round(20)).clickable(enabled=!info){qr=!qr}.padding(u.space(12)),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(u.space(10))){
                    Copy("Saiba mais +",u,19,600)
                    NativeQr(media.str("link"),Modifier.size(u.space(side)).clip(u.round(8)),compact=true)
                }
            }
            if(smart)Column(Modifier.align(Alignment.TopEnd).padding(top=u.space(75),end=u.space(100)).width(u.space(330)),horizontalAlignment=Alignment.End,verticalArrangement=Arrangement.spacedBy(u.space(10))){
                Copy(if(breakRemaining>=0)"intervalo · "+formatSmartBreakTime(breakRemaining) else "intervalo · --:--",u,32,600)
                if(breakRemaining>=0)Box(Modifier.fillMaxWidth().height(u.space(8)).clip(u.round(5)).background(Color.White.copy(alpha=.25f))){Box(Modifier.fillMaxHeight().fillMaxWidth(progress).background(Color.White))}
            }
            if(smart&&info)Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha=.65f))){
                val panelX by animateDpAsState(u.space(if(contact)300 else 435),tween(350),label="smartPanelX")
                AnimatedVisibility(contact&&contactUrl.isNotBlank(),modifier=Modifier.offset(x=u.space(1366),y=u.space(413)),enter=slideInHorizontally(tween(350)){-it}+fadeIn(tween(250)),exit=slideOutHorizontally(tween(300)){-it}+fadeOut(tween(200))){
                    Box(Modifier.size(u.space(254)).clip(u.round(24)).background(Color(0xFF242529)).padding(u.space(20)),contentAlignment=Alignment.Center){
                        NativeQr(contactUrl,Modifier.fillMaxSize().clip(u.round(12)),compact=true)
                    }
                }
                Box(Modifier.offset(x=panelX,y=u.space(309)).size(u.space(1050),u.space(462)).zIndex(2f).clip(u.round(28)).background(Color(0xFF222224))){
                    Artwork(R.drawable.smart_break_popup,Modifier.fillMaxSize(),scale=ContentScale.FillBounds)
                    GlassButton(u,"",Modifier.align(Alignment.TopEnd).padding(u.space(34)).size(u.space(40)).focusRequester(closeFocus),icon="left"){contact=false;info=false}
                    Column(u.at(372,190,624,132),verticalArrangement=Arrangement.spacedBy(u.space(12)),horizontalAlignment=Alignment.Start){
                        Copy("Uma experiência de publicidade digital que conecta marcas e ouvintes durante os intervalos da programação ao vivo.",u,22,400,lines=4,align=TextAlign.Start)
                        if(contactUrl.isBlank())Copy("Contato comercial não cadastrado.",u,17,400)
                    }
                    GlassButton(u,"Anuncie no Smart Break",Modifier.align(Alignment.BottomEnd).padding(end=u.space(54),bottom=u.space(34)).height(u.space(60)).focusRequester(announceFocus).focusProperties{up=closeFocus},enabled=contactUrl.isNotBlank()){contact=!contact}
                }
            }
        }
    }
}

/** Use the House Mix source clock, not the duration of the current ad. */
internal fun smartBreakTiming(start:Long,duration:Double,now:Long):Pair<Float,Long>?{
    if(start<=0L||!duration.isFinite()||duration<=0.0)return null
    val elapsed=((now-start)/1000.0).coerceIn(0.0,duration)
    return (elapsed/duration).toFloat() to ceil(duration-elapsed).toLong()
}
internal fun formatSmartBreakTime(seconds:Long):String=String.format(java.util.Locale.ROOT,"%02d:%02d",seconds/60,seconds%60)
