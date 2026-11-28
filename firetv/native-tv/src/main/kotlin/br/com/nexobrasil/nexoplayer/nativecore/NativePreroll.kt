package br.com.nexobrasil.nexoplayer.nativecore

import androidx.compose.foundation.background
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.focusable
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
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
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.input.key.*
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
import kotlinx.coroutines.launch
import org.json.JSONObject

@Composable internal fun NativePreroll(media:JSONObject,audio:Boolean,onStarted:()->Unit,onFinish:()->Unit,smart:Boolean=false,breakStart:Long=0L,breakDuration:Double=0.0,serverClockOffset:Long=0L,onPlayed:()->Unit={},onBack:()->Unit={},commercialPhone:String="",smartSerial:Int=0,smartActive:Boolean=true,onSaveProduct:suspend (JSONObject)->Boolean={false},productAvatar:Any?=null){
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

    var info by remember{mutableStateOf(false)};var contact by remember{mutableStateOf(false)}
    val infoFocus=remember{FocusRequester()};val closeFocus=remember{FocusRequester()};val announceFocus=remember{FocusRequester()};val qrFocus=remember{FocusRequester()}
    val phone=commercialPhone.filter{it.isDigit()}.let{if(it.length in 10..11)"55"+it else it}
    val contactUrl=if(phone.length in 12..15)"https://wa.me/"+phone else ""
    val showLink=safeImage(media.str("link"))!=null
    val qrEnabled=smart&&showLink&&smartActive&&!info
    var productOpen by remember(media,smartSerial){mutableStateOf(false)}
    var productSaved by remember(media,smartSerial){mutableStateOf(false)}
    var productBusy by remember(media,smartSerial){mutableStateOf(false)}
    val productScope=rememberCoroutineScope()
    val cartFlight=remember(media,smartSerial){Animatable(0f)}
    var flying by remember(media,smartSerial){mutableStateOf(false)}
    LaunchedEffect(productSaved){if(productSaved){flying=true;cartFlight.snapTo(0f);cartFlight.animateTo(1f,tween(700));delay(900);flying=false}}
    fun openProduct(){productOpen=true;if(!productBusy&&!productSaved&&media.str("productDescription").isNotBlank()){productBusy=true;productScope.launch{try{productSaved=onSaveProduct(media)}finally{productBusy=false}}}}
    var qrFocused by remember{mutableStateOf(false)}
    val qrInteraction=remember{MutableInteractionSource()}
    val qrHovered by qrInteraction.collectIsHoveredAsState()
    val active by rememberUpdatedState(smartActive)
    var buttonsEntered by remember{mutableStateOf(false)}
    LaunchedEffect(smart,smartActive){if(smart){if(smartActive){delay(100);buttonsEntered=true}else buttonsEntered=false}}
    BackHandler(enabled=!smart||smartActive) {if(contact)contact=false else if(info)info=false else if(smart)onBack()}
    val focusManager=LocalFocusManager.current
    var neutral by remember(smartSerial){mutableStateOf(true)}
    val neutralFocus=remember{FocusRequester()}
    LaunchedEffect(info,buttonsEntered,smartActive,smartSerial){if(smart&&smartActive&&buttonsEntered){withFrameNanos{};neutral=!info&&!showLink;if(neutral)runCatching{neutralFocus.requestFocus()}else runCatching{(if(info&&contactUrl.isNotBlank())announceFocus else if(info)closeFocus else qrFocus).requestFocus()}}}
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
        Box(Modifier.fillMaxSize().background(Color.Black).onPreviewKeyEvent{event->if(smart&&neutral&&!info&&event.type==KeyEventType.KeyDown&&(event.key==Key.DirectionUp||event.key==Key.DirectionDown)){neutral=false;runCatching{infoFocus.requestFocus()};true}else false}){
            if(smart&&neutral)Box(Modifier.size(u.space(1)).focusRequester(neutralFocus).focusable())
            if(audio){val image=safeImage(media.str("backgroundUrl"));if(image!=null)Artwork(image,Modifier.fillMaxSize(),scale=ContentScale.Fit)else if(smart)Column(Modifier.align(Alignment.Center),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(u.space(20))){Symbol("music",Modifier.size(u.space(80)));Copy("Intervalo comercial",u,36,600);Copy("A programação volta em instantes",u,24)}}
            else key(player){AndroidView(factory={ctx->(if(smart)LayoutInflater.from(ctx).inflate(R.layout.smart_break_player,null) as PlayerView else PlayerView(ctx)).apply{useController=false;this.player=player;isFocusable=false;isFocusableInTouchMode=false;descendantFocusability=android.view.ViewGroup.FOCUS_BLOCK_DESCENDANTS}},modifier=Modifier.fillMaxSize(),onRelease={it.player=null},update={it.player=player})}
            if(smart){
                AnimatedVisibility(buttonsEntered,modifier=Modifier.align(Alignment.TopStart).padding(top=u.space(75),start=u.space(100)),enter=slideInHorizontally(tween(400)){-it/3}+fadeIn(tween(400)),exit=slideOutHorizontally(tween(400)){-it/3}+fadeOut(tween(400))){
                    Row(horizontalArrangement=Arrangement.spacedBy(u.space(14)),verticalAlignment=Alignment.CenterVertically){
                        GlassButton(u,"",Modifier.size(u.space(60)),icon="left",enabled=!info&&smartActive,onClick=onBack)
                        GlassButton(u,"smart break +",Modifier.height(u.space(60)).focusRequester(infoFocus).focusProperties{if(qrEnabled){down=qrFocus;right=qrFocus}},enabled=!info&&smartActive){info=true}
                    }
                }
            }else Row(Modifier.offset(u.space(100),u.space(75)),horizontalArrangement=Arrangement.spacedBy(u.space(12)),verticalAlignment=Alignment.CenterVertically){
                Box(Modifier.width(u.space(310)).height(u.space(60)).border(u.space(2),Color.White,u.round(30)).padding(horizontal=u.space(12)),contentAlignment=Alignment.Center){Copy("publicidade"+if(remaining>=0)" · "+remaining/60+":"+("%02d".format(remaining%60))else "",u,25,600)}
                AnimatedVisibility(remaining in 1..15,enter=slideInHorizontally(tween(420)){it/2}+fadeIn(tween(420)),exit=fadeOut(tween(200))){LaunchedEffect(Unit){withFrameNanos{};skipFocus.requestFocus()};GlassButton(u,"pular",Modifier.height(u.space(60)).focusRequester(skipFocus),icon="right",iconAfter=true){complete()}}
            }
            if(smart){
                // Identity includes the playback sequence so identical links animate on every creative change.
                val target=smartSerial to if(smartActive)smartCreativeDetails(media)else null
                Box(Modifier.align(Alignment.BottomEnd).padding(end=u.space(105),bottom=u.space(75)).focusRequester(qrFocus).onFocusChanged{qrFocused=it.isFocused}.focusProperties{canFocus=qrEnabled;up=infoFocus;left=infoFocus}.semantics{contentDescription="Saiba mais, QR Code da publicidade"}.hoverable(qrInteraction,enabled=qrEnabled).clickable(enabled=qrEnabled){openProduct()}){
                    AnimatedContent(targetState=target,contentAlignment=Alignment.BottomEnd,transitionSpec={
                        ((slideInHorizontally(tween(700,delayMillis=550,easing=FastOutSlowInEasing)){it+(120*u.pixelsPerUnit).toInt()}+fadeIn(tween(700,delayMillis=550))) togetherWith (slideOutHorizontally(tween(550,easing=FastOutSlowInEasing)){it+(120*u.pixelsPerUnit).toInt()}+fadeOut(tween(550)))).using(SizeTransform(clip=false))
                    },label="smartCreativeQr"){entry->
                        entry.second?.let{details->if(details.hasContent)SmartMusicCard(u,details,(qrFocused||qrHovered)&&qrEnabled&&entry==target,productOpen,productSaved)else if(details.link.isNotBlank())CreativeQr(u,details.link,focused=(qrFocused||qrHovered)&&qrEnabled&&entry==target,smart=true)}
                    }
                }
            }else if(showLink){
                Box(Modifier.align(Alignment.BottomEnd).padding(end=u.space(105),bottom=u.space(75))){if(media.str("productDescription").isNotBlank())Box(Modifier.clickable{openProduct()}){SmartMusicCard(u,smartCreativeDetails(media),false,productOpen,productSaved)}else CreativeQr(u,media.str("link"))}
            }
            if(smart){
                val ring=animateFloatAsState(progress,tween(250,easing=LinearEasing),label="breakProgress")
                Row(Modifier.align(Alignment.TopEnd).padding(top=u.space(75),end=u.space(100)).width(u.space(330)).height(u.space(60)).clip(CircleShape).background(glass,CircleShape).border(u.space(1),Color.White.copy(alpha=.16f),CircleShape).padding(horizontal=u.space(20)),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(u.space(12))){
                    Copy("voltamos em",u,22,600,Modifier.weight(1f))
                    Copy(if(breakRemaining>=0)formatSmartBreakTime(breakRemaining)else "--:--",u,22,600,Modifier.width(u.space(84)),align=TextAlign.Center)
                    if(breakRemaining>=0)Canvas(Modifier.size(u.space(30))){val sw=size.minDimension*.11f;val top=Offset(sw,sw);val arc=Size(size.width-2*sw,size.height-2*sw);drawArc(Color.White.copy(alpha=.25f),-90f,360f,false,top,arc,style=Stroke(sw));drawArc(Color.White,-90f,360f*ring.value.coerceIn(0f,1f),false,top,arc,style=Stroke(sw,cap=StrokeCap.Round))}else NativeSpinner(u,Modifier.size(u.space(30)))
                }
            }
            if(flying&&productAvatar!=null){
                val t=cartFlight.value
                NativeAvatarImage(productAvatar,u.at(1750,65,70,70).clip(CircleShape))
                if(t<1f)Box(u.at(1480+270*t,800-735*t,130-65*t,130-65*t).clip(u.round(20)).background(interactionGlass),contentAlignment=Alignment.Center){val image=media.str("productImage").ifBlank{media.str("artistImage")};if(safeImage(image)!=null)Artwork(image,Modifier.fillMaxSize(),scale=ContentScale.Crop)else Copy("✓",u,36,700)}
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

@Composable private fun CreativeQr(u:TvUnits,url:String,focused:Boolean=false,smart:Boolean=false){
    val ring by animateFloatAsState(if(focused)1f else 0f,tween(180),label="creativeRing")
    Box(if(smart)Modifier.border(u.space(3),Color.White.copy(alpha=ring),u.round(31)).padding(u.space(9))else Modifier){Column(Modifier.width(u.space(if(smart)268 else 246)).clip(u.round(22)).background(glass).border(u.space(1),Color.White.copy(alpha=.34f),u.round(22)).padding(u.space(18)),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(u.space(10))){
        if(!smart)Copy("Saiba mais +",u,19,600)
        NativeQr(url,Modifier.size(u.space(if(smart)232 else 210)).clip(u.round(8)),compact=true)
    }}
}

internal data class SmartCreativeDetails(val music:Boolean,val song:String,val artist:String,val image:String,val link:String,val description:String="",val price:String="",val cta:String=""){
    val hasMusic:Boolean get()=song.isNotBlank()||artist.isNotBlank()||image.isNotBlank()
    val hasContent:Boolean get()=hasMusic||description.isNotBlank()||price.isNotBlank()||cta.isNotBlank()
}
internal fun smartCreativeDetails(media:JSONObject):SmartCreativeDetails=SmartCreativeDetails(media.str("categoryKind")=="music",media.str("song"),media.str("artist"),safeImage(media.str("productImage").ifBlank{media.str("artistImage")}).orEmpty(),safeImage(media.str("link")).orEmpty(),media.str("productDescription"),media.str("productPrice"),media.str("buttonLabel"))
@Composable private fun SmartMusicCard(u:TvUnits,details:SmartCreativeDetails,focused:Boolean,productOpen:Boolean=false,productSaved:Boolean=false){
    val shape=u.round(24)
    val ring by animateFloatAsState(if(focused)1f else 0f,tween(180),label="musicRing")
    Box(Modifier.border(u.space(3),Color.White.copy(alpha=ring),u.round(33)).padding(u.space(9))){
    val product=!details.music&&details.description.isNotBlank()
    val width by animateDpAsState(u.space(if(details.link.isNotBlank()&&(!product||productOpen))760 else 530),tween(300),label="productWidth")
    Row(Modifier.width(width).clip(shape).background(interactionGlass).border(u.space(1),Color.White.copy(alpha=.22f),shape).padding(u.space(22)),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(u.space(20))){
        if(details.image.isNotBlank())Artwork(details.image,Modifier.size(u.space(174)).clip(u.round(18)),"Foto do artista",scale=ContentScale.Crop)
        Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(u.space(10))){
            if(details.music)Copy("Tocando agora",u,19,500,color=Color.White.copy(alpha=.72f)) else if(product)Copy("oferta especial",u,19,400,color=Color.White.copy(alpha=.72f))
            if(details.description.isNotBlank())Copy(details.description,u,27,700,lines=3)
            if(details.price.isNotBlank())Copy("▸ R$ "+details.price.removePrefix("R$").trim(),u,30,400)
            if(product)Box(Modifier.background(Color.White.copy(alpha=.28f),CircleShape).padding(horizontal=u.space(18),vertical=u.space(8))){Copy("comprar  🛒",u,22,700)}else if(details.cta.isNotBlank())Copy(details.cta,u,21,500,lines=2)
            if(details.song.isNotBlank())Copy(details.song,u,27,700,lines=3)
            if(details.artist.isNotBlank())Copy(details.artist,u,22,500,lines=2)
        }
        if(details.link.isNotBlank()&&(!product||productOpen))Column(Modifier.width(u.space(218)),verticalArrangement=Arrangement.spacedBy(u.space(8))){NativeQr(details.link,Modifier.size(u.space(218)).clip(u.round(8)),compact=true);if(product&&productSaved)Copy("Adicionado no seu carrinho",u,16,600,lines=2)}
    }}
}
