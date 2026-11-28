package br.com.nexobrasil.nexoplayer.nativecore

import androidx.compose.animation.animateContentSize
import androidx.compose.animation.Crossfade
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.SizeTransform
import androidx.compose.foundation.focusable
import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.animation.expandHorizontally
import androidx.compose.animation.shrinkHorizontally
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.*
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.draw.clipToBounds
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.input.key.*
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.zIndex
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.foundation.basicMarquee
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.ui.graphics.SolidColor
import androidx.activity.compose.BackHandler
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import kotlinx.coroutines.delay
import org.json.JSONObject
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.util.Locale

internal fun TvUnits.at(x:Number,y:Number,w:Number,h:Number) = Modifier.offset(space(x),space(y)).size(space(w),space(h))
internal val LocalControlsEnabled = compositionLocalOf { true }
internal val glass = Brush.linearGradient(listOf(Color(0x705C5C60),Color(0x80232327),Color(0xA018181B)))
internal val interactionGlass = Brush.linearGradient(listOf(Color(0xED303034),Color(0xF2212125),Color(0xF518181B)))
private fun accentGlass(c:Color)=Brush.linearGradient(listOf(androidx.compose.ui.graphics.lerp(c,Color.White,.24f),c,Color(0xFF292124)))
internal fun TvUnits.round(radius:Number)=RoundedCornerShape(space(radius))

@Composable internal fun Copy(text:String,u:TvUnits,size:Int,weight:Int=400,modifier:Modifier=Modifier,lines:Int=1,color:Color=Color.White,align:TextAlign=TextAlign.Start) {
    Text(text,modifier=modifier,color=color,style=u.referenceText(size,weight).copy(lineHeight=u.text(size*1.16f)),maxLines=lines,overflow=TextOverflow.Ellipsis,textAlign=align)
}
@Composable internal fun Artwork(model:Any?,modifier:Modifier,desc:String?=null,scale:ContentScale=ContentScale.Fit,filter:ColorFilter?=null) {
    if(model!=null && model!="") AsyncImage(model,desc,modifier,contentScale=scale,colorFilter=filter)
}
@Composable internal fun GlassButton(u:TvUnits,label:String,modifier:Modifier=Modifier,icon:String?=null,accent:Color?=null,enabled:Boolean=true,outline:Boolean=false,accentRing:Boolean=false,loading:Boolean=false,iconAfter:Boolean=false,onClick:()->Unit) {
    var focused by remember { mutableStateOf(false) }
    val shape=CircleShape
    val active=enabled && LocalControlsEnabled.current
    Row(modifier.drawBehind{if(focused){val gap=u.space(5).toPx();drawRoundRect(Color.White,Offset(-gap,-gap),Size(size.width+2*gap,size.height+2*gap),CornerRadius((size.height+2*gap)/2),style=Stroke(u.space(2).toPx()))}}.clip(shape).onFocusChanged { focused=it.isFocused }.focusProperties { canFocus=active }
        .background(if(outline) Brush.linearGradient(listOf(Color.Transparent,Color.Transparent)) else if(accent!=null && !accentRing) accentGlass(accent) else glass,shape)
        .border(u.space(if(accentRing) 3 else if(outline) 2 else 1),if(outline) Color.White else if(accentRing) accent ?: Color.White else Color.White.copy(alpha=.16f),shape)
        .clickable(enabled=active,onClick=onClick).semantics { contentDescription=label.ifEmpty{when(icon){"play"->"Reproduzir";"pause"->"Pausar";"left"->"Voltar";"up"->"Canal anterior";"down"->"Próximo canal";"search"->"Buscar";"spark"->"Interatividade";else->"Controle"}} }
        .padding(horizontal=u.space(if(icon!=null && label.isEmpty()) 0 else 20)),
        verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.Center) {
        if(loading) NativeSpinner(u,Modifier.size(u.space(29))) else if(icon!=null&&!iconAfter) Symbol(icon,Modifier.size(u.space(29)))
        if(label.isNotEmpty()) {
            if(icon!=null&&!iconAfter) Spacer(Modifier.width(u.space(10)))
            Copy(label,u,22,500)
        }
        if(!loading&&icon!=null&&iconAfter){if(label.isNotEmpty())Spacer(Modifier.width(u.space(10)));Symbol(icon,Modifier.size(u.space(29)))}
    }
}

@Composable internal fun Symbol(kind:String,modifier:Modifier) {
    Canvas(modifier) {
        val w=size.width;val h=size.height;val sw=w*.075f
        fun p(x:Float,y:Float)=Offset(w*x,h*y)
        fun line(a:Offset,b:Offset)=drawLine(Color.White,a,b,sw,StrokeCap.Round)
        fun path(vararg pts:Pair<Float,Float>) { val path=Path();pts.forEachIndexed { i,v->if(i==0)path.moveTo(w*v.first,h*v.second) else path.lineTo(w*v.first,h*v.second) };drawPath(path,Color.White,style=Stroke(sw,cap=StrokeCap.Round)) }
        when(kind) {
            "play" -> { val s=Path().apply{moveTo(w*.34f,h*.20f);lineTo(w*.80f,h*.50f);lineTo(w*.34f,h*.80f);close()};drawPath(s,Color.White) }
            "pause" -> { line(p(.37f,.24f),p(.37f,.76f));line(p(.63f,.24f),p(.63f,.76f)) }
            "left" -> path(.62f to .20f,.32f to .50f,.62f to .80f)
            "right" -> path(.32f to .20f,.62f to .50f,.32f to .80f)
            "up" -> path(.20f to .62f,.50f to .32f,.80f to .62f)
            "down" -> path(.20f to .38f,.50f to .68f,.80f to .38f)
            "search" -> { drawCircle(Color.White,w*.27f,p(.40f,.40f),style=Stroke(sw));line(p(.60f,.60f),p(.84f,.84f)) }
            "audio" -> { drawArc(Color.White,180f,180f,false,p(.12f,.12f),Size(w*.76f,h*.76f),style=Stroke(sw));line(p(.12f,.50f),p(.12f,.80f));line(p(.88f,.50f),p(.88f,.80f));line(p(.12f,.80f),p(.30f,.80f));line(p(.70f,.80f),p(.88f,.80f)) }
            "video" -> { drawRoundRect(Color.White,p(.10f,.20f),Size(w*.80f,h*.56f),androidx.compose.ui.geometry.CornerRadius(w*.08f),style=Stroke(sw));line(p(.32f,.90f),p(.68f,.90f)) }
            "catalog" -> { drawRect(Color.White,p(.12f,.37f),Size(w*.76f,h*.50f),style=Stroke(sw));path(.12f to .37f,.08f to .22f,.81f to .06f,.86f to .22f,.12f to .37f) }
            "calendar" -> { drawRoundRect(Color.White,p(.12f,.20f),Size(w*.76f,h*.67f),androidx.compose.ui.geometry.CornerRadius(w*.08f),style=Stroke(sw));line(p(.12f,.43f),p(.88f,.43f));line(p(.32f,.10f),p(.32f,.30f));line(p(.68f,.10f),p(.68f,.30f)) }
            "plus" -> { line(p(.5f,.16f),p(.5f,.84f));line(p(.16f,.5f),p(.84f,.5f)) }
            "spark" -> { path(.5f to .10f,.60f to .39f,.88f to .50f,.60f to .61f,.50f to .90f,.40f to .61f,.12f to .50f,.40f to .39f,.50f to .10f) }
            "sun" -> {drawCircle(Color.White,w*.23f,p(.50f,.50f),style=Stroke(sw));repeat(8){i->val a=i*Math.PI/4;val x=kotlin.math.cos(a).toFloat();val y=kotlin.math.sin(a).toFloat();line(p(.5f+x*.34f,.5f+y*.34f),p(.5f+x*.46f,.5f+y*.46f))}}
            "cloud" -> {drawRoundRect(Color.White,p(.10f,.45f),Size(w*.80f,h*.34f),androidx.compose.ui.geometry.CornerRadius(w*.16f),style=Stroke(sw));drawArc(Color.White,190f,160f,false,p(.23f,.18f),Size(w*.47f,h*.48f),style=Stroke(sw))}
            "mic" -> {drawRoundRect(Color.White,p(.36f,.07f),Size(w*.28f,h*.54f),androidx.compose.ui.geometry.CornerRadius(w*.14f),style=Stroke(sw));drawArc(Color.White,0f,180f,false,p(.20f,.25f),Size(w*.60f,h*.52f),style=Stroke(sw));line(p(.50f,.77f),p(.50f,.92f));line(p(.33f,.92f),p(.67f,.92f))}
            "rain" -> {drawRoundRect(Color.White,p(.10f,.28f),Size(w*.80f,h*.35f),androidx.compose.ui.geometry.CornerRadius(w*.16f),style=Stroke(sw));repeat(3){i->val x=.28f+i*.22f;line(p(x,.72f),p(x-.06f,.90f))}}
            "chat" -> {drawRoundRect(Color.White,p(.12f,.12f),Size(w*.76f,h*.58f),androidx.compose.ui.geometry.CornerRadius(w*.13f),style=Stroke(sw));path(.30f to .70f,.30f to .88f,.52f to .70f)}
            "history" -> {drawArc(Color.White,-100f,290f,false,p(.12f,.12f),Size(w*.76f,h*.76f),style=Stroke(sw));path(.12f to .18f,.12f to .44f,.37f to .44f);line(p(.50f,.50f),p(.50f,.26f));line(p(.50f,.50f),p(.68f,.62f))}
            "poll" -> {repeat(3){i->val y=.23f+i*.25f;path(.10f to y,.19f to (y+.08f),.32f to (y-.07f));line(p(.45f,y),p(.9f,y))}}
            "battle" -> {line(p(.16f,.16f),p(.83f,.83f));line(p(.83f,.16f),p(.16f,.83f));line(p(.11f,.70f),p(.30f,.89f));line(p(.70f,.89f),p(.89f,.70f))}
            "music" -> { line(p(.53f,.12f),p(.53f,.70f));line(p(.53f,.12f),p(.82f,.28f));drawOval(Color.White,p(.20f,.65f),Size(w*.33f,h*.22f),style=Stroke(sw)) }
            "user" -> { drawCircle(Color.White,w*.18f,p(.50f,.30f),style=Stroke(sw));drawArc(Color.White,180f,180f,false,p(.15f,.54f),Size(w*.70f,h*.60f),style=Stroke(sw)) }
        }
    }
}

@Composable private fun RailItem(u:TvUnits,icon:String,label:String,accent:Color,modifier:Modifier=Modifier,avatar:Any=R.drawable.visitor_avatar,loading:Boolean=false,onClick:()->Unit) {
    var focused by remember { mutableStateOf(false) }
    val shape=CircleShape
    val active=LocalControlsEnabled.current
    Row(modifier.onFocusChanged { focused=it.isFocused }.focusProperties { canFocus=active }
        .height(u.space(76)).clip(shape)
        .background(if(focused&&active) accentGlass(accent) else Brush.linearGradient(listOf(Color.Transparent,Color.Transparent)),shape)
        .border(u.space(if(focused) 3 else 0),if(focused) Color.White else Color.Transparent,shape)
        .clickable(enabled=active,onClick=onClick).semantics { contentDescription=label }
        .padding(u.space(7)),verticalAlignment=Alignment.CenterVertically) {
        Box(Modifier.size(u.space(62)).background(accentGlass(accent),shape).clip(shape),contentAlignment=Alignment.Center) {
            if(loading)NativeSpinner(u,Modifier.size(u.space(32))) else if(icon=="user") NativeAvatarImage(avatar,Modifier.fillMaxSize())
            else Symbol(icon,Modifier.size(u.space(30)))
        }
        AnimatedVisibility(visible=focused&&active,
            enter=expandHorizontally(tween(260,easing=CubicBezierEasing(.2f,.82f,.2f,1f)),expandFrom=Alignment.Start)+fadeIn(tween(220,delayMillis=60)),
            exit=shrinkHorizontally(tween(260,easing=CubicBezierEasing(.2f,.82f,.2f,1f)),shrinkTowards=Alignment.Start)+fadeOut(tween(220))) {
            Row(verticalAlignment=Alignment.CenterVertically){Spacer(Modifier.width(u.space(12)));Copy(label,u,24,600);Spacer(Modifier.width(u.space(22)))}
        }
    }
}

@OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)
@Composable internal fun NativeLayout(
    screen:Screen,inputSerial:Int,station:StationBootstrap?,stationName:String,payload:JSONObject?,track:JSONObject?,program:JSONObject?,presenter:JSONObject?,artistArtwork:String,backgroundAd:String,bannerLink:String,bannerQr:Boolean,onBannerQr:(Boolean)->Unit,
    player:ExoPlayer,playing:Boolean,buffering:Boolean,failure:String?,playerError:String?,controls:Boolean,chrome:Float,interaction:Boolean,videoPrompt:Boolean,youtubeRequested:Boolean,onYoutubePlaying:(Boolean)->Unit,onYoutubeError:(String?)->Unit,
    banner:String,historyAd:JSONObject?,panelAd:JSONObject?,chatAds:List<JSONObject>,backgroundAdEndsAt:Long,sponsor:String?,weather:JSONObject?,history:List<JSONObject>,historyLoading:Boolean,historyError:Boolean,notice:String?,video:List<StationChannel>,selected:StationChannel?,
    onRetry:()->Unit,onToggle:()->Unit,onBack:()->Unit,onOpen:(Screen)->Unit,onChannel:(Int)->Unit,onVideo:(StationChannel)->Unit,onMosaic:()->Unit,
    onInteraction:()->Unit,onNotice:(String?)->Unit,leavingScreen:Boolean,onVideoTrayFocus:(Boolean)->Unit,
    entryPending:Boolean,guestName:String,guestAvatar:Int,displayAvatar:Any,mainProfileName:String,mainAvatar:Any,listenerProfile:JSONObject?,onListenerProfile:(JSONObject)->Unit,onSelectProfile:(String)->Unit,onGuestSave:(String,Int)->Unit,onProfileContinue:()->Unit,
    spectrum:PcmSpectrum,panel:String?,panelPinned:Boolean,onPin:()->Unit,forecast:JSONObject?,lyrics:String?,cep:String,api:HouseMixClient,services:NativeServices,account:JSONObject?,onAccount:(JSONObject)->Unit,onLogout:()->Unit,onPanel:(String?)->Unit,onCepSaved:(String,JSONObject)->Unit,scheduleOpening:Boolean,interactionReturn:Int,channelOpening:Screen?,syncStatus:SyncStatus,manualSync:Long?,onSaveSync:(Long?)->Unit,onCalibrateSync:()->Unit,canCalibrateSync:Boolean
) {
    val accent = remember(payload) {
        val colors=payload?.optJSONObject("playerColors")
        val raw=colors.str("dominantColor").ifBlank{colors.str("homeAccent")}.ifBlank{colors.str("primary")}.ifBlank{colors.str("accent")}
        runCatching{Color(android.graphics.Color.parseColor(raw))}.getOrElse{
            if(BuildConfig.STATION_SLUG=="positivafm") Color(0xFFF20D0F) else Color(0xFF343434)
        }
    }
    val focus=remember(screen){FocusRequester()}
    val screenMotion=remember(screen){Animatable(0f)}
    LaunchedEffect(screen,leavingScreen){screenMotion.animateTo(if(leavingScreen&&screen!=Screen.PROFILE)0f else 1f,tween(if(leavingScreen)220 else 300))}
    val trayFocus=remember{FocusRequester()}
    var trayOpen by remember(screen){mutableStateOf(false)}
    LaunchedEffect(screen,controls,panel,interaction,panelPinned){if(screen!=Screen.VIDEO||!controls||(panel!=null&&!panelPinned)||interaction){trayOpen=false;onVideoTrayFocus(false)}}
    val rail=remember{List(5){FocusRequester()}}
    val programFocus=remember{FocusRequester()}
    val searchFocus=remember{FocusRequester()}
    val clockFocus=remember{FocusRequester()}
    val backFocus=remember{FocusRequester()}
    val channelUp=remember{FocusRequester()}
    val channelDown=remember{FocusRequester()}
    val sparkFocus=remember{FocusRequester()}
    val bannerFocus=remember{FocusRequester()}
    val likeFocus=remember{FocusRequester()}
    val modal=(panel!=null&&!panelPinned)||notice!=null||interaction
    var clockPeek by remember(screen){mutableStateOf(false)}
    val panelAllowsNavigation=panel==null||panelPinned||panel=="schedule"
    val scheduleOverlay=panel=="schedule"
    var scheduleFromRail by remember{mutableStateOf(false)}
    val scheduleFocus=remember{FocusRequester()}
    LaunchedEffect(screen,banner,bannerLink,panel,interaction,notice){onBannerQr(false)}
    val homeBackgroundAd=screen==Screen.HOME&&backgroundAd.isNotBlank()
    val focusManager=LocalFocusManager.current
    var homeFocusSuppressed by remember{mutableStateOf(false)}
    var adInput by remember{mutableIntStateOf(inputSerial)}
    LaunchedEffect(homeBackgroundAd){if(homeBackgroundAd){homeFocusSuppressed=true;focusManager.clearFocus(force=true);adInput=inputSerial}else if(homeFocusSuppressed){focusManager.clearFocus(force=true);adInput=inputSerial}}
    LaunchedEffect(inputSerial,screen,homeBackgroundAd){if(screen!=Screen.HOME)homeFocusSuppressed=false else if(!homeBackgroundAd&&homeFocusSuppressed&&inputSerial!=adInput){homeFocusSuppressed=false;withFrameNanos{};runCatching{focus.requestFocus()}}}
    val watchScreen=screen==Screen.AUDIO||screen==Screen.VIDEO
    val encourage by rememberInteractivePrompt(watchScreen&&(screen==Screen.AUDIO||controls)&&panel==null&&!interaction&&notice==null&&!leavingScreen&&channelOpening==null,inputSerial)
    LaunchedEffect(encourage,videoPrompt,interaction,panel){if((encourage||videoPrompt)&&!interaction&&panel==null){withFrameNanos{};runCatching{sparkFocus.requestFocus()}}}
    val ready=station!=null||failure!=null
    var restoredInteraction by remember { mutableIntStateOf(interactionReturn) }
    LaunchedEffect(screen,ready,modal,if(watchScreen)controls else true,interactionReturn) {
        if(ready&&!modal&&!homeBackgroundAd&&!homeFocusSuppressed&&(!watchScreen||controls)){withFrameNanos{};val restore=interactionReturn!=restoredInteraction;if(restore)restoredInteraction=interactionReturn;runCatching{(if(restore&&(screen==Screen.HOME||watchScreen))sparkFocus else focus).requestFocus()}}
    }
    val homeBannerVisible=screen==Screen.HOME&&!homeBackgroundAd&&!interaction&&safeImage(banner)!=null
    val bannerMotion=animateFloatAsState(if(homeBannerVisible)1f else 0f,tween(if(homeBannerVisible)550 else 350),label="homeBannerMotion")
    val homeChrome=animateFloatAsState(if(homeBackgroundAd)0f else 1f,tween(350),label="homeAdChrome")
    LaunchedEffect(homeBannerVisible){if(!homeBannerVisible)onBannerQr(false)}
    val scheduleDate=LocalDate.now(brasilia)
    val programRows=remember(payload){payload.rows("programas")}
    val scheduleKey=remember(programRows){programRows.map{it.toString()}}
    val scheduleGrid by produceState<List<List<Segment>>?>(null,scheduleKey,scheduleDate){value=null;value=withContext(Dispatchers.Default){(0..6).map{d->programRows.flatMap{segments(it,scheduleDate.plusDays(d.toLong()))}}}}
    LaunchedEffect(scheduleOpening,scheduleGrid){if(scheduleOpening&&scheduleGrid!=null){withFrameNanos{};withFrameNanos{};onPanel("schedule")}}
    val cover=track.str("capa").takeUnless{url->payload.rows("apresentadores").any{it.str("foto").isNotBlank()&&it.str("foto").substringBefore("?")==url.substringBefore("?")}}.orEmpty()
    val title=track.str("titulo").ifBlank{"Ao vivo"}
    val artist=track.str("artista")
    val people=remember(payload){payload.rows("apresentadores").associateBy{it.str("id")}}
    val presenters=program.strings("apresentadores_ids").ifEmpty{listOf(program.str("apresentador_id"))}.mapNotNull{people[it]}.ifEmpty{listOfNotNull(presenter)}
    val artistPhoto=artistArtwork.takeUnless{url->presenters.any{it.str("foto")==url}}.orEmpty()
    var presenterIndex by remember(program.str("id"),presenters.map{it.str("id")}){mutableIntStateOf(0)}
    LaunchedEffect(program.str("id"),presenters.map{it.str("id")}){if(presenters.size>1)while(true){delay(4000);presenterIndex=(presenterIndex+1)%presenters.size}}
    val activePresenter=presenters.getOrNull(presenterIndex)
    val portraitContext=androidx.compose.ui.platform.LocalContext.current
    val portraitUrls=presenters.map{it.str("foto")}.filter{safeImage(it)!=null}.distinct()
    LaunchedEffect(portraitUrls){portraitUrls.forEach{url->coil.Coil.imageLoader(portraitContext).enqueue(coil.request.ImageRequest.Builder(portraitContext).data(url).size(768,972).build())}}
    val reminderContext=androidx.compose.ui.platform.LocalContext.current
    val reminderPrefs=remember{reminderContext.getSharedPreferences("native_tv_settings",0)}
    val reminderProfile=account.str("id").ifBlank{guestName}
    var reminderText by remember{mutableStateOf("")}
    LaunchedEffect(payload,reminderProfile){while(true){val next=java.time.ZonedDateTime.now(brasilia).plusMinutes(5);val ids=reminderPrefs.getStringSet("reminders:"+reminderProfile,emptySet()).orEmpty();payload.rows("programas").filter{it.str("id") in ids&&occurs(it,next.toLocalDate())&&it.str("horario_inicio").take(5)==next.format(DateTimeFormatter.ofPattern("HH:mm"))}.firstOrNull()?.let{p->val key="reminder-sent:"+reminderProfile+":"+p.str("id");if(reminderPrefs.getString(key,"")!=next.toLocalDate().toString()){reminderPrefs.edit().putString(key,next.toLocalDate().toString()).apply();reminderText=p.str("nome")+" começa em 5 minutos.";delay(12000);reminderText=""}};delay(10000)}}
    val logo=station?.logoUrl
    val youtubeId=remember(selected?.url){youtubeVideoId(selected?.url.orEmpty())}
    TvViewport(Modifier.background(Color.Black)) { u ->
        Box(Modifier.fillMaxSize().clipToBounds().background(Color.Black)) {
            val watch=screen==Screen.VIDEO||screen==Screen.AUDIO
            if(screen!=Screen.VIDEO) {
                Box(Modifier.fillMaxSize().background(Brush.linearGradient(if(BuildConfig.STATION_SLUG=="positivafm") listOf(Color(0xFFDF1B22),Color(0xFF8D1E23),Color(0xFF111114)) else listOf(accent,Color(red=accent.red*.56f,green=accent.green*.56f,blue=accent.blue*.56f),Color(0xFF111114)))))
                if(screen==Screen.HOME||screen==Screen.AUDIO||screen==Screen.SCHEDULE) {
                    var showArtist by remember(artistPhoto){mutableStateOf(true)}
                    LaunchedEffect(artistPhoto){while(artistPhoto.isNotBlank()){delay(if(showArtist) 20000 else 10000);showArtist=!showArtist}}
                    val fade by androidx.compose.animation.core.animateFloatAsState(if(showArtist && artistPhoto.isNotBlank()) 1f else 0f,tween(1500),label="artist")
                    Crossfade(artistPhoto,animationSpec=tween(800),label="artistChange"){url->Artwork(safeImage(url),Modifier.fillMaxSize().alpha(fade),scale=ContentScale.Crop)}
                    Box(Modifier.fillMaxSize().alpha(fade).background(Brush.horizontalGradient(listOf(Color.Black.copy(alpha=.74f),Color.Black.copy(alpha=.45f)))))
                    if(screen==Screen.HOME) Crossfade(backgroundAd,animationSpec=tween(700),label="backgroundAd"){url->if(url.isNotBlank())Artwork(safeImage(url),Modifier.fillMaxSize(),scale=ContentScale.Crop)}
                    if(screen==Screen.HOME||screen==Screen.SCHEDULE||screen==Screen.AUDIO) AnimatedVisibility(screen!=Screen.HOME||backgroundAd.isBlank(),modifier=u.at(1152,108,768,972),enter=fadeIn(tween(650))+slideInHorizontally(tween(650)){it/10},exit=fadeOut(tween(500))){AnimatedPresenter(u,activePresenter.str("foto"),Modifier.fillMaxSize())}
                    Box(Modifier.fillMaxSize().graphicsLayer{alpha=if(screen==Screen.HOME)homeChrome.value else 1f}.background(Brush.verticalGradient(listOf(Color.Transparent,Color.Transparent,Color.Black.copy(alpha=.78f)))))
                }
            }
            if(screen==Screen.VIDEO) {
                if(youtubeId!=null){
                    val embeddedBounds=when{
                        panel!=null||interaction->u.at(100,150,1200,670)
                        controls||chrome>.01f->u.at(100,150,1720,690)
                        videoPrompt->u.at(100,0,1720,900)
                        else->Modifier.fillMaxSize()
                    }
                    NativeYoutubeEmbed(youtubeId,embeddedBounds,youtubeRequested,false,onYoutubePlaying,onYoutubeError)
                }else{
                AndroidView(factory={ctx->PlayerView(ctx).apply{useController=false;this.player=player;isFocusable=false;isFocusableInTouchMode=false;descendantFocusability=android.view.ViewGroup.FOCUS_BLOCK_DESCENDANTS}},modifier=Modifier.fillMaxSize(),onReset={it.player=null},onRelease={it.player=null},update={it.player=player})
                Box(Modifier.fillMaxSize().alpha(chrome).background(Brush.verticalGradient(listOf(Color.Black.copy(alpha=.7f),Color.Transparent,Color.Transparent,Color.Black.copy(alpha=.85f)))))
                }
            }
            if(!ready) {
                Artwork(logo,u.at(830,340,260,190))
                Copy("Carregando…",u,32,500,u.at(710,570,500,60),align=TextAlign.Center)
            } else if(failure!=null) {
                Copy(failure,u,35,500,u.at(100,300,1500,70))
                GlassButton(u,"Tentar novamente",u.at(100,400,330,64).focusRequester(focus),onClick=onRetry)
            } else {
                CompositionLocalProvider(LocalControlsEnabled provides (!modal&&!leavingScreen&&!homeBackgroundAd&&!homeFocusSuppressed)) {
                Box(Modifier.fillMaxSize().graphicsLayer{alpha=screenMotion.value;translationY=(1f-screenMotion.value)*u.space(18).toPx()}){
                if(!watch && screen!=Screen.PROFILE) Header(u,logo,title,artist,cover,playing,accent,screen,weather,if(screen==Screen.HOME) Modifier.focusRequester(focus).focusProperties{down=rail[0];right=searchFocus} else Modifier,spectrum,onToggle,{onOpen(Screen.SEARCH)},{onPanel("cep")},Modifier.focusRequester(searchFocus).focusProperties{if(screen==Screen.HOME)left=focus;right=clockFocus},Modifier.focusRequester(clockFocus).focusProperties{left=searchFocus;down=if(homeBackgroundAd)rail[0] else sparkFocus},onClockPeek={clockPeek=it})
                if(screen==Screen.HOME) {
                    val programLeft = 265f
                    Box(u.at(96,254,102,432).background(glass,CircleShape).border(u.space(1),Color.White.copy(alpha=.16f),CircleShape))
                    Column(Modifier.offset(u.space(108),u.space(272)).zIndex(2f),verticalArrangement=Arrangement.spacedBy(u.space(4))) {
                        fun route(i:Int)=Modifier.focusRequester(rail[i]).focusProperties{
                            up=if(i==0)focus else rail[i-1]
                            down=if(i==4){if(homeBackgroundAd)rail[0] else if(homeBannerVisible)bannerFocus else sparkFocus}else rail[i+1]
                            right=if(homeBackgroundAd)focus else programFocus
                        }
                        RailItem(u,"audio","Ouvir",accent,route(0),loading=channelOpening==Screen.AUDIO){onOpen(Screen.AUDIO)}
                        RailItem(u,"video","Assistir",accent,route(1),loading=channelOpening==Screen.VIDEO){onOpen(Screen.VIDEO)}
                        RailItem(u,"catalog","On Demand",accent,route(2)){onOpen(Screen.CATALOG)}
                        RailItem(u,"calendar","Grade de programação",accent,route(3),loading=scheduleOpening&&scheduleFromRail){scheduleFromRail=true;onOpen(Screen.SCHEDULE)}
                        RailItem(u,"user","Olá, $guestName",accent,route(4),avatar=displayAvatar){onOpen(Screen.PROFILE)}
                    }
                    if(!homeBackgroundAd||homeChrome.value>.01f) CompositionLocalProvider(LocalControlsEnabled provides (!modal&&!leavingScreen&&!homeBackgroundAd&&!homeFocusSuppressed)){
                    Column(u.at(programLeft,272,505,340).graphicsLayer{alpha=homeChrome.value},verticalArrangement=Arrangement.spacedBy(u.space(12))) {
                        HomeProgramInfo(u,program,activePresenter,stationName,accent)
                        Spacer(Modifier.height(u.space(6)))
                        ExpandableProgram(u,Modifier.focusRequester(programFocus).focusProperties{left=rail[0];right=sparkFocus;down=if(homeBannerVisible)bannerFocus else sparkFocus},loading=scheduleOpening&&!scheduleFromRail){scheduleFromRail=false;onOpen(Screen.SCHEDULE)}
                    }
                    }
                    if(safeImage(banner)!=null) {
                        val model:Any?=if(banner.substringBefore("?")=="https://qazvgmgdidjhbvcuinpy.supabase.co/storage/v1/object/public/comercial/452ebd1e-61a0-42dd-bf80-231a3f426c83/player-ads/00198081-b99d-4548-8561-ff953209d17a.png") R.drawable.home_hotpark else safeImage(banner)
                        var bannerFocused by remember{mutableStateOf(false)}
                        Box(u.at(400,842,1120,140).zIndex(1f).graphicsLayer{alpha=bannerMotion.value;translationY=(1f-bannerMotion.value)*u.space(24).toPx()}.focusRequester(bannerFocus)
                            .focusProperties{up=rail[4];right=sparkFocus;canFocus=!modal&&homeBannerVisible}
                            .onFocusChanged{bannerFocused=it.isFocused;if(!it.isFocused)onBannerQr(false)}
                            .drawBehind{if(bannerFocused){val gap=u.space(5).toPx();drawRoundRect(Color.White,Offset(-gap,-gap),Size(size.width+gap*2,size.height+gap*2),CornerRadius(u.space(16).toPx()),style=Stroke(u.space(3).toPx()))}}
                            .clickable(enabled=!modal&&homeBannerVisible){if(safeImage(bannerLink)!=null)onBannerQr(!bannerQr)}){
                            if(model!=null)AsyncImage(model,"Banner publicitário",Modifier.fillMaxSize().clip(u.round(12)),contentScale=ContentScale.Fit,onSuccess={android.util.Log.i("NexoAds","HOME_BANNER_VISIBLE")},onError={android.util.Log.w("NexoAds","HOME_BANNER_LOAD_FAILED",it.result.throwable)})
                        }
                        AnimatedVisibility(bannerQr&&safeImage(bannerLink)!=null,modifier=u.at(184,810,198,204).zIndex(3f),enter=fadeIn(tween(220)),exit=fadeOut(tween(180))){
                            Box(Modifier.fillMaxSize().background(glass,u.round(20)).padding(u.space(10)),contentAlignment=Alignment.Center){
                                if(bannerLink.isNotBlank())NativeQr(bannerLink,Modifier.size(u.space(178)).clip(u.round(5)),compact=true)
                            }
                        }
                        if(bannerQr)BackHandler{onBannerQr(false)}
                    }
                    if(!homeBackgroundAd||homeChrome.value>.01f) GlassButton(u,"",u.at(1744,874,76,76).graphicsLayer{alpha=homeChrome.value}.focusRequester(sparkFocus).focusProperties{left=if(homeBannerVisible)bannerFocus else programFocus;up=clockFocus},icon="spark",accent=accent,accentRing=true,enabled=!homeBackgroundAd){onInteraction()}
                    if(homeBackgroundAd&&backgroundAdEndsAt>0L)HomeBackgroundCountdown(u,backgroundAdEndsAt,u.at(100,940,64,64))
                    Copy("Nexo TV v"+BuildConfig.VERSION_NAME,u,15,400,u.at(100,1050,800,24),color=Color.White.copy(alpha=.55f))
                }
                if(watch) {
                    if(screen==Screen.AUDIO) {
                        NativeAnimatedAudioCover(u,services,account,station?.ownerId.orEmpty(),title,artist,cover,u.at(100,296,440,440),Modifier.focusRequester(likeFocus).focusProperties{down=focus;right=sparkFocus})
                        Column(u.at(582,376,625,330),verticalArrangement=Arrangement.spacedBy(u.space(18))) {
                            Copy("tocando",u,20,700)
                            NativeTrackText(u,title.uppercase(),artist.uppercase(),50,27,u.space(18),2)
                            // Standard live audio renderer is used until PCM compatibility is confirmed on Fire TV.
                            if(buffering) Copy("Carregando…",u,22,500)
                        }
                    }
                    if(screen==Screen.AUDIO||controls||chrome>.01f) {
                        WatchHeader(u,logo,stationName,screen,accent,weather,if(screen==Screen.VIDEO) chrome else 1f,controls||screen==Screen.AUDIO,displayAvatar,{onOpen(Screen.PROFILE)},{onPanel("cep")},Modifier.focusRequester(clockFocus).focusProperties{down=likeFocus;left=likeFocus},onClockPeek={clockPeek=it})
                    }
                    if(screen==Screen.VIDEO && youtubeId==null && chrome>.01f && title!="Ao vivo") {
                        NativeLike(u,services,account,station?.ownerId.orEmpty(),title,artist,cover,u.at(134,455,850,165).alpha(chrome),Modifier.focusRequester(likeFocus).focusProperties{down=focus;right=clockFocus},videoStyle=true,enabled=controls)
                    }
                    if(screen==Screen.AUDIO && !interaction && panelAllowsNavigation) Crossfade(sponsor,modifier=u.at(1537,636,283,283),animationSpec=tween(350),label="audioSponsor"){url->if(url!=null)Artwork(url,Modifier.fillMaxSize(),scale=ContentScale.Fit)}
                    val hasTray=screen==Screen.VIDEO&&(video.size>1||BuildConfig.STATION_SLUG=="positivafm")
                    val lift by animateDpAsState(u.space(if(hasTray&&trayOpen)145 else 0),tween(340),label="trayLift")
                    val trayY by animateDpAsState(u.space(if(trayOpen)875 else 1038),tween(340),label="trayY")
                    val programX by animateDpAsState(u.space(if(screen==Screen.AUDIO&&!controls)100 else 280),tween(350),label="programX")
                    if(!interaction && panelAllowsNavigation && (screen==Screen.AUDIO || chrome>.01f)) Row(Modifier.offset(programX,u.space(928)-lift).width(u.space(900)).height(u.space(85)).alpha(if(screen==Screen.VIDEO)chrome else 1f),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(u.space(15))) {
                        Badge(u,"Agora",accent)
                        Column { Copy(program.str("nome"),u,26,700);Copy(program.str("horario_inicio").take(5)+" – "+program.str("horario_fim").take(5)+"   "+activePresenter.str("nome"),u,18) }
                    }
                    if(chrome>.01f && panelAllowsNavigation) {
                        GlassButton(u,"",u.at(100,936,40,40).offset(y=-lift).alpha(chrome).focusRequester(backFocus).focusProperties{right=focus},icon="left",enabled=controls){onBack()}
                        GlassButton(u,"",u.at(160,912,88,88).offset(y=-lift).alpha(chrome).focusRequester(focus).focusProperties{left=backFocus;up=channelUp;down=channelDown;right=sparkFocus},icon=if(playing)"pause" else "play",enabled=controls){onToggle()}
                        GlassButton(u,"",u.at(184,854,40,40).offset(y=-lift).alpha(chrome).focusRequester(channelUp).focusProperties{down=focus;right=if(title!="Ao vivo"||screen==Screen.AUDIO)likeFocus else sparkFocus;up=if(title!="Ao vivo"||screen==Screen.AUDIO)likeFocus else sparkFocus},icon="up",enabled=controls){onChannel(-1)}
                        GlassButton(u,"",u.at(184,1018,40,40).offset(y=-lift).alpha(chrome).focusRequester(channelDown).focusProperties{up=focus;right=if(hasTray)trayFocus else programFocus;down=if(hasTray)trayFocus else FocusRequester.Default},icon="down",enabled=controls){onChannel(1)}
                        if(!interaction) GlassButton(u,"programação",u.at(1490,922,225,64).offset(y=-lift).alpha(chrome).focusRequester(programFocus).focusProperties{left=focus;right=sparkFocus;down=if(hasTray)trayFocus else FocusRequester.Default},icon="calendar",enabled=controls,loading=scheduleOpening){onOpen(Screen.SCHEDULE)}
                        if(hasTray&&!interaction){
                            val main=video.firstOrNull{!it.name.contains("cast",true)&&!it.name.contains("podcast",true)}?:video.firstOrNull()
                            val cast=video.firstOrNull{it.name.contains("cast",true)||it.name.contains("podcast",true)}
                            Row(Modifier.offset(u.space(278),trayY).size(u.space(1320),u.space(180)).alpha(chrome).onFocusChanged{trayOpen=it.hasFocus;onVideoTrayFocus(it.hasFocus)}.focusGroup(),horizontalArrangement=Arrangement.spacedBy(u.space(22))){
                                if(BuildConfig.STATION_SLUG=="positivafm"){
                                    if(main!=null)VideoChannelCard(u,R.drawable.positiva_channel_one,"Canal 1",selected?.id==main.id&&playing,controls,Modifier.focusRequester(trayFocus).focusProperties{up=focus}){onVideo(main)}
                                    VideoChannelCard(u,R.drawable.positiva_channel_two,"Positiva Cast",cast!=null&&selected?.id==cast.id&&playing,controls,if(main==null)Modifier.focusRequester(trayFocus).focusProperties{up=focus}else Modifier.focusProperties{up=focus}){
                                        if(cast!=null)onVideo(cast)
                                        else onNotice("Canal Positiva Cast ainda não cadastrado nesta emissora.")
                                    }
                                }else video.forEachIndexed{index,ch->VideoChannelCard(u,safeImage(ch.coverUrl),ch.name,selected?.id==ch.id&&playing,controls,if(index==0)Modifier.focusRequester(trayFocus).focusProperties{up=focus}else Modifier.focusProperties{up=focus}){onVideo(ch)}}
                                if(video.size>1)VideoChannelCard(u,null,"Mosaico",false,controls,Modifier.focusProperties{up=focus}){onMosaic()}
                            }
                        }
                    }
                    if(panelAllowsNavigation && !interaction) {
                        val sparkVisible=screen==Screen.AUDIO||controls||videoPrompt
                        val sparkAlpha by animateFloatAsState(if(sparkVisible)1f else 0f,tween(400),label="sparkVisibility")
                        if(sparkAlpha>.01f||sparkVisible){
                            if(encourage||videoPrompt) NativeInteractionInvitation(u,accent,u.at(1694,872,164,164).offset(y=-lift).alpha(sparkAlpha))
                            GlassButton(u,"",u.at(1744,922,64,64).offset(y=-lift).alpha(sparkAlpha).focusRequester(sparkFocus).focusProperties{left=if(controls||screen==Screen.AUDIO)programFocus else FocusRequester.Cancel;up=if(!controls&&screen==Screen.VIDEO)FocusRequester.Cancel else if(screen==Screen.AUDIO||title!="Ao vivo")likeFocus else clockFocus;down=if(controls&&hasTray)trayFocus else FocusRequester.Cancel},icon="spark",enabled=sparkVisible){onInteraction()}
                        }
                    }
                    playerError?.let { Copy(it,u,25,500,u.at(100,800,900,50)) }
                }
                if(screen==Screen.SCHEDULE) Schedule(u,payload,program,accent,focus,onBack,account.str("id").ifBlank{guestName},scheduleGrid)
                if(screen==Screen.CATALOG) {
                    Copy("On Demand",u,38,600,u.at(115,248,1200,70))
                    val entries=payload.rows("channels").filter{it.str("type")!="audio_live"&&it.str("type")!="video_live"}
                    if(entries.isEmpty()) Box(u.at(115,320,560,110).background(glass,u.round(22)).padding(u.space(25))) { Copy("Ainda não há conteúdos On Demand disponíveis nesta rádio.",u,23,400,lines=3) }
                    else Column(u.at(115,320,1600,550).verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(u.space(20))) {
                        entries.forEach{ch-> GlassButton(u,ch.str("catalog_name").ifBlank{ch.str("name")},Modifier.height(u.space(70))){onNotice("A reprodução do catálogo ainda está em migração.")} }
                    }
                    GlassButton(u,"Voltar",u.at(100,950,155,56).focusRequester(focus),icon="left",onClick=onBack)
                }
                if(screen==Screen.PROFILE) {
                    if(account!=null) NativeAuthenticatedProfiles(u,logo,accent,focus,mainProfileName,mainAvatar,listenerProfile,station?.ownerId,account,services,onListenerProfile,onSelectProfile,onProfileContinue,onLogout,leavingScreen)
                    else NativeProfiles(u,logo,accent,focus,entryPending,guestName,guestAvatar,onProfileContinue,onGuestSave,
                        onConnect={onPanel("pair")},account=null,onLogout=onLogout)
                }
                }
                }
                if(interaction && (panel==null||panelPinned)&&!homeBackgroundAd) InteractionCards(u, {onPanel(it)}, onInteraction,sparkFocus,screen==Screen.HOME)
                if(scheduleOverlay){Box(Modifier.fillMaxSize()){Schedule(u,payload,program,accent,scheduleFocus,{onPanel(null)},account.str("id").ifBlank{guestName},scheduleGrid)}} else if(panel!=null) NativePanel(u,panel,payload,track,history,historyLoading,historyError,forecast,lyrics,cep,api,station?.ownerId,accent,{onPanel(null)},onCepSaved,onOpen,services,account,onAccount,historyAd,panelAd,chatAds,pinned=panelPinned,onPin=onPin,panelBottom=if(screen==Screen.VIDEO&&trayOpen)760 else 850)
                AnimatedVisibility(clockPeek&&cep.length==8&&panel==null&&!interaction&&notice==null&&screen!=Screen.PROFILE,modifier=Modifier.fillMaxSize(),enter=fadeIn(tween(300))+slideInVertically(tween(320,easing=FastOutSlowInEasing)){-it/30},exit=fadeOut(tween(260))+slideOutVertically(tween(300)){-it/30}){
                    NativePanel(u,"weather",payload,track,history,historyLoading,historyError,forecast,lyrics,cep,api,station?.ownerId,accent,{},onCepSaved,onOpen,services,account,onAccount,preview=true)
                }

            }
            NativeRewardOverlay(u,LocalNexoRewards.current,screen,accent)
            if(reminderText.isNotBlank()) Box(u.at(580,170,760,72).background(glass,u.round(24)).padding(u.space(15)),contentAlignment=Alignment.Center){Copy(reminderText,u,24,600)}
            if(notice!=null) Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha=.60f)),contentAlignment=Alignment.Center) {
                val close=remember{FocusRequester()};LaunchedEffect(notice){close.requestFocus()}
                Column(Modifier.width(u.space(620)).background(glass,u.round(28)).padding(u.space(38)),verticalArrangement=Arrangement.spacedBy(u.space(28))) {
                    GlassButton(u,"",Modifier.align(Alignment.End).size(u.space(56)).focusRequester(close),icon="left"){onNotice(null)}
                    Copy(notice,u,28,500,lines=4)
                }
            }
        }
    }
}

@Composable private fun Badge(u:TvUnits,label:String,accent:Color,compact:Boolean=false) {
    Box(Modifier.background(accentGlass(accent),u.round(if(compact)10 else 13)).border(u.space(1),Color.White.copy(alpha=.25f),u.round(if(compact)10 else 13)).padding(horizontal=u.space(if(compact)13 else 15),vertical=u.space(if(compact)5 else 6))) { Copy(label,u,if(compact)15 else 21,650) }
}
@Composable private fun Clock(u:TvUnits,modifier:Modifier,weather:JSONObject?,onPeek:(Boolean)->Unit,onClick:()->Unit) {
    var clock by remember { mutableStateOf(LocalTime.now(brasilia)) }
    LaunchedEffect(Unit){while(true){clock=LocalTime.now(brasilia);delay(15000)}}
    val temp=weather?.opt("temperature_2m") as? Number
    val weatherCode=(weather?.opt("weather_code") as? Number)?.toInt()
    var focused by remember { mutableStateOf(false) }
    val active=LocalControlsEnabled.current
    val clockInteraction=remember{MutableInteractionSource()}
    val hovered by clockInteraction.collectIsHoveredAsState()
    LaunchedEffect(active,focused,hovered){onPeek(active&&(focused||hovered))}
    val latestPeek by rememberUpdatedState(onPeek)
    DisposableEffect(Unit){onDispose{latestPeek(false)}}
    Row(modifier.clip(CircleShape).hoverable(clockInteraction,enabled=active).onFocusChanged{focused=it.isFocused}.focusProperties{canFocus=active}.background(glass,CircleShape).border(u.space(if(focused)3 else 1),Color.White.copy(alpha=if(focused)1f else .17f),CircleShape).clickable(enabled=active,onClick=onClick).semantics{contentDescription="Configurar previsão do tempo pelo CEP"},horizontalArrangement=Arrangement.Center,verticalAlignment=Alignment.CenterVertically){
        Copy(clock.format(DateTimeFormatter.ofPattern("HH:mm")),u,29,400)
        run {Spacer(Modifier.width(u.space(12)));Copy("|",u,22,400,color=Color.White.copy(alpha=.55f));Spacer(Modifier.width(u.space(12)));NativeWeatherIcon(weatherCode?:-1,Modifier.size(u.space(34)),isDay=weather?.optInt("is_day",1)!=0);Spacer(Modifier.width(u.space(8)));Copy(temp?.let{kotlin.math.round(it.toDouble()).toInt().toString()+"°"}?:"--°",u,28,400)}
    }
}
@OptIn(ExperimentalFoundationApi::class)
@Composable private fun Header(u:TvUnits,logo:String?,title:String,artist:String,cover:String,playing:Boolean,accent:Color,screen:Screen,weather:JSONObject?,trackFocus:Modifier,spectrum:PcmSpectrum,onToggle:()->Unit,onSearch:()->Unit,onCep:()->Unit,searchModifier:Modifier=Modifier,clockModifier:Modifier=Modifier,onClockPeek:(Boolean)->Unit={}) {
    Artwork(logo,u.at(100,63,90,90))
    var focused by remember { mutableStateOf(false) }
    val shape=u.round(16)
    val active=LocalControlsEnabled.current
    Row(u.at(214,70,400,76).then(trackFocus).onFocusChanged{focused=it.isFocused}.focusProperties{canFocus=active}.background(glass,shape).border(u.space(if(focused)3 else 1),Color.White.copy(alpha=if(focused)1f else .15f),shape).clickable(enabled=active,onClick=onToggle).padding(u.space(8)),verticalAlignment=Alignment.CenterVertically) {
        Artwork(safeImage(cover)?:logo,Modifier.size(u.space(60)).clip(u.round(8)),scale=ContentScale.Crop)
        Spacer(Modifier.width(u.space(15)))
        Column(Modifier.weight(1f).clipToBounds()){key(title){Copy(title.uppercase(),u,22,700,Modifier.basicMarquee(iterations=Int.MAX_VALUE,initialDelayMillis=2000,repeatDelayMillis=3000,velocity=24.dp))};key(artist){Copy(artist,u,18,400,Modifier.basicMarquee(iterations=Int.MAX_VALUE,initialDelayMillis=2000,repeatDelayMillis=3000,velocity=24.dp))}}
        Spacer(Modifier.width(u.space(10)))
        Box(Modifier.size(u.space(50)).clip(CircleShape).background(Color.Black.copy(alpha=.22f)),contentAlignment=Alignment.Center){
            Canvas(Modifier.size(u.space(30))){val w=size.width;val h=size.height;if(playing){drawRoundRect(Color.White,Offset(w*.20f,h*.15f),Size(w*.22f,h*.70f),CornerRadius(w*.07f));drawRoundRect(Color.White,Offset(w*.58f,h*.15f),Size(w*.22f,h*.70f),CornerRadius(w*.07f))}else{val triangle=Path().apply{moveTo(w*.30f,h*.12f);lineTo(w*.87f,h*.50f);lineTo(w*.30f,h*.88f);close()};drawPath(triangle,Color.White)}}
        }
    }
    GlassButton(u,"",u.at(1512,76,56,56).then(searchModifier),icon="search",onClick=onSearch)
    Clock(u,u.at(1592,76,230,56).then(clockModifier),weather,onClockPeek,onCep)
}
@Composable internal fun WatchHeader(u:TvUnits,logo:String?,name:String,screen:Screen,accent:Color,weather:JSONObject?,alpha:Float,enabled:Boolean,guestAvatar:Any,onProfile:()->Unit,onCep:()->Unit,clockModifier:Modifier=Modifier,onClockPeek:(Boolean)->Unit={}) {
    Row(u.at(100,76,1000,64).alpha(alpha),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(u.space(25))) {
        Artwork(logo,Modifier.size(u.space(70),u.space(60)));Copy(name,u,22,500);Badge(u,if(screen==Screen.VIDEO)"Vídeo" else "Áudio",accent)
    }
    Copy("• AO VIVO",u,20,600,u.at(1350,91,135,44).alpha(alpha))
    Clock(u,u.at(1485,76,240,62).alpha(alpha).then(clockModifier),weather,onClockPeek,onCep)
    var avatarFocused by remember{mutableStateOf(false)}
    val avatarInteraction=remember{MutableInteractionSource()}
    val avatarHovered by avatarInteraction.collectIsHoveredAsState()
    val avatarEnabled=enabled&&LocalControlsEnabled.current
    val avatarRing by animateFloatAsState(if(avatarEnabled&&(avatarFocused||avatarHovered))1f else 0f,tween(180),label="avatarRing")
    Box(u.at(1751,67,80,80).alpha(alpha).onFocusChanged{avatarFocused=it.isFocused}.focusProperties{canFocus=avatarEnabled}.hoverable(avatarInteraction,enabled=avatarEnabled).border(u.space(2.5f),Color.White.copy(alpha=avatarRing),CircleShape).clickable(enabled=avatarEnabled,onClick=onProfile).semantics{contentDescription="Perfil"},contentAlignment=Alignment.Center){
        Box(Modifier.size(u.space(62)).clip(CircleShape).background(accentGlass(accent))){NativeAvatarImage(guestAvatar,Modifier.fillMaxSize())}
    }
}

internal fun nativeCurrentProgram(payload:JSONObject?,now:java.time.ZonedDateTime=java.time.ZonedDateTime.now(brasilia)):JSONObject? {
    val today=now.toLocalDate();val m=now.hour*60+now.minute
    return payload.rows("programas").filter{it.optBoolean("ativo",true)}.flatMap{segments(it,today)}.filter{m in it.start until it.end}.sortedWith(compareByDescending<Segment>{it.p.optBoolean("variavel")}.thenByDescending{it.start}).firstOrNull()?.p ?: payload?.optJSONObject("currentProgram")
}
private fun minute(s:String):Int? { val h=s.take(2).toIntOrNull()?:return null;val m=s.substringAfter(":").take(2).toIntOrNull()?:return null;return (h*60+m).takeIf{it in 0..1439} }
private fun labelMinute(m:Int)=String.format(Locale.ROOT,"%02d:%02d",m/60,m%60)
private val days=listOf("Segunda","Terça","Quarta","Quinta","Sexta","Sábado","Domingo")
private fun occurs(p:JSONObject,date:LocalDate):Boolean = if(p.optBoolean("variavel")) p.str("data_variavel").take(10)==date.toString() else p.strings("dias_semana").any{it.equals(days[date.dayOfWeek.value-1],true)}
private data class Segment(val p:JSONObject,val start:Int,val end:Int)
private fun segments(p:JSONObject,date:LocalDate):List<Segment>{
    val a=minute(p.str("horario_inicio"))?:return emptyList();val b=minute(p.str("horario_fim"))?:return emptyList()
    return buildList {
        if(occurs(p,date)) add(Segment(p,a,if(b<a)1440 else (b+1).coerceAtMost(1440)))
        if(b<a&&occurs(p,date.minusDays(1)))add(Segment(p,0,(b+1).coerceAtMost(1440)))
    }
}
@Composable private fun Schedule(u:TvUnits,payload:JSONObject?,current:JSONObject?,accent:Color,focus:FocusRequester,onBack:()->Unit,profile:String,prepared:List<List<Segment>>?) {
    val today=LocalDate.now(brasilia)
    val now=LocalTime.now(brasilia).let{it.hour*60+it.minute}
    val programs=payload.rows("programas")
    val liveFocus=remember{FocusRequester()}
    val context=androidx.compose.ui.platform.LocalContext.current
    val prefs=remember{context.getSharedPreferences("native_tv_settings",0)}
    val people=payload.rows("apresentadores").associateBy{it.str("id")}
    var details by remember{mutableStateOf<JSONObject?>(null)}
    val scroll=rememberScrollState()
    val initial=u.space(((now/30)*56-230).coerceAtLeast(0))
    val density=androidx.compose.ui.platform.LocalDensity.current
    val halfHourPx=with(density){u.space(56).roundToPx()}.coerceAtLeast(1)
    val firstSlot by remember(scroll,halfHourPx){derivedStateOf{(scroll.value/halfHourPx-12).coerceAtLeast(0)}}
    val lastSlot=(firstSlot+34).coerceAtMost(47)
    var focusedSegment by remember{mutableStateOf("")}
    LaunchedEffect(prepared,current.str("id")){withFrameNanos{};runCatching{focus.requestFocus()};if(prepared!=null){scroll.scrollTo(with(density){initial.roundToPx()});withFrameNanos{};runCatching{liveFocus.requestFocus()}}}
    GlassButton(u,"",u.at(1768,148,52,52).focusRequester(focus),icon="left",onClick=onBack)
    Column(u.at(100,216,1720,654).background(Color(0xF5101113),u.round(30)).padding(u.space(14))) {
        Row(horizontalArrangement=Arrangement.spacedBy(u.space(12))) {
            Box(Modifier.width(u.space(120)).height(u.space(74)).background(Color(0xFF303136),u.round(23)),contentAlignment=Alignment.Center){Copy("Horário",u,20,600)}
            repeat(7){d-> val date=today.plusDays(d.toLong())
                Box(Modifier.weight(1f).height(u.space(74)).background(Color(0xFF303136),u.round(23)),contentAlignment=Alignment.Center){Copy((if(d==0)"hoje" else days[date.dayOfWeek.value-1].take(3).lowercase())+" "+date.format(DateTimeFormatter.ofPattern("dd/MM")),u,20,700)}
            }
        }
        Spacer(Modifier.height(u.space(8)))
        if(prepared==null||programs.isEmpty()) Box(Modifier.weight(1f).fillMaxWidth(),contentAlignment=Alignment.Center){Column(horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(u.space(18))){if(prepared==null)NativeSpinner(u,Modifier.size(u.space(52)));Copy(if(prepared==null)"Carregando programação…" else "Nenhuma programação cadastrada.",u,28,500)}} else Row(Modifier.weight(1f).verticalScroll(scroll),horizontalArrangement=Arrangement.spacedBy(u.space(12))) {
            Box(Modifier.width(u.space(120)).height(u.space(2688)).background(Color(0xFF212224),u.round(18))) {
                for(n in firstSlot..lastSlot){ Box(Modifier.offset(y=u.space(n*56)).height(u.space(56)).fillMaxWidth(),contentAlignment=Alignment.Center){Copy(labelMinute(n*30),u,18,700,color=if(n==now/30)Color.White else Color(0xFF8B8D94))} }
            }
            repeat(7){d->
                val date=today.plusDays(d.toLong())
                Box(Modifier.weight(1f).height(u.space(2688)).background(Color(0xFF171819),u.round(18))) {
                    prepared[d].filter{seg->seg.end>=firstSlot*30&&seg.start<=(lastSlot+1)*30||"$d:${seg.p.str("id")}:${seg.start}"==focusedSegment||d==0&&seg.p.str("id")==current.str("id")&&now in seg.start until seg.end}.forEach{seg->key(d,seg.p.str("id"),seg.start){
                        val segmentKey="$d:${seg.p.str("id")}:${seg.start}"
                        val p=seg.p;val live=d==0&&p.str("id")==current.str("id")&&now in seg.start until seg.end
                        var focused by remember(p.str("id"),seg.start){mutableStateOf(false)}
                        val shape=u.round(20)
                        val height=((seg.end-seg.start)*56f/30-8).coerceAtLeast(35f)
                        Column(Modifier.offset(y=u.space(seg.start*56f/30)).height(u.space(height)).fillMaxWidth()
                            .then(if(live)Modifier.focusRequester(liveFocus)else Modifier).onFocusChanged{focused=it.isFocused;if(it.isFocused)focusedSegment=segmentKey}
                            .background(if(live||focused)accentGlass(accent) else Brush.linearGradient(listOf(Color(0xFF303136),Color(0xFF202123))),shape)
                            .border(u.space(if(focused)3 else 0),if(focused)Color.White else Color.Transparent,shape)
                            .clip(shape).clickable{details=p}.padding(horizontal=u.space(15),vertical=u.space(10)),verticalArrangement=Arrangement.spacedBy(u.space(5))) {
                            Copy(p.str("nome"),u,19,700,lines=if(height>100)3 else 1)
                            if(seg.end-seg.start>90) {
                                val ids=p.strings("apresentadores_ids").ifEmpty{listOf(p.str("apresentador_id"))}
                                Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(u.space(5))) {
                                    ids.take(2).forEach{id-> AsyncImage(safeImage(people[id].str("foto")),null,Modifier.size(u.space(56)).clip(CircleShape).background(accentGlass(accent)).alpha(if(live||focused)1f else .4f),contentScale=ContentScale.Crop,alignment=Alignment.TopCenter,colorFilter=if(live||focused)null else ColorFilter.colorMatrix(ColorMatrix().apply{setToSaturation(0f)}))}
                                }
                            }
                            Spacer(Modifier.weight(1f))
                            if(height>64)Copy((if(live)"no ar • " else "")+labelMinute(seg.start)+"–"+labelMinute(seg.end),u,16,500)
                        }
                    }}
                }
            }
        }
    }
    details?.let{p->
        Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha=.55f)),contentAlignment=Alignment.Center) {
            val back=remember{FocusRequester()};LaunchedEffect(p){back.requestFocus()}
            Row(Modifier.size(u.space(1200),u.space(560)).clip(u.round(32)).background(Color(0xFF242529)).padding(start=u.space(40),end=u.space(40)),horizontalArrangement=Arrangement.spacedBy(u.space(35))) {
                val ids=p.strings("apresentadores_ids").ifEmpty{listOf(p.str("apresentador_id"))}
                var index by remember(p.str("id")){mutableIntStateOf(0)}
                LaunchedEffect(ids){if(ids.size>1)while(true){delay(4000);index=(index+1)%ids.size}}
                AnimatedPresenter(u,people[ids.getOrNull(index)].str("foto"),Modifier.width(u.space(400)).fillMaxHeight().padding(top=u.space(40)),bottomAligned=true)
                Column(Modifier.weight(1f).padding(vertical=u.space(40)),verticalArrangement=Arrangement.spacedBy(u.space(18))) {
                    Copy(p.str("nome"),u,40,700,lines=2)
                    Copy(p.str("horario_inicio").take(5)+" – "+p.str("horario_fim").take(5),u,25)
                    Copy(p.str("descricao").ifBlank{"Descrição não cadastrada."},u,23,400,lines=6)
                    Spacer(Modifier.weight(1f))
                    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(u.space(18),Alignment.End),verticalAlignment=Alignment.CenterVertically){ReminderButton(u,prefs,profile,p);GlassButton(u,"",Modifier.size(u.space(56)).focusRequester(back),icon="left"){details=null}}
                }
            }
        }
    }
}


/** Guest selection uses the Lote 16 two-row profile geometry. Identity remains session-local. */
@Composable private fun NativeProfiles(
    u:TvUnits,logo:String?,accent:Color,focus:FocusRequester,entryPending:Boolean,
    guestName:String,guestAvatar:Int,onContinue:()->Unit,onSave:(String,Int)->Unit,onConnect:()->Unit,account:JSONObject?,onLogout:()->Unit
) {
    var editing by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf(guestName) }
    var avatar by remember { mutableIntStateOf(guestAvatar) }
    val editFocus=remember { FocusRequester() }
    var first by remember{mutableStateOf(false)};var second by remember{mutableStateOf(false)}
    LaunchedEffect(editing){if(!editing){first=false;second=false;delay(650);first=true;delay(100);second=true}else{first=false;second=false}}
    val firstMotion=animateFloatAsState(if(first)1f else 0f,tween(380),label="profileFirst")
    val secondMotion=animateFloatAsState(if(second)1f else 0f,tween(380),label="profileSecond")
    val avatarList=listOf(R.drawable.visitor_avatar,R.drawable.visitor_avatar_1,R.drawable.visitor_avatar_2,R.drawable.visitor_avatar_3,R.drawable.visitor_avatar_4,R.drawable.visitor_avatar_5,R.drawable.visitor_avatar_6,R.drawable.visitor_avatar_7,R.drawable.visitor_avatar_8)
    BackHandler(editing) { editing=false }
    LaunchedEffect(editing) { if(editing) editFocus.requestFocus() else runCatching { focus.requestFocus() } }
    Box(Modifier.fillMaxSize().background(Brush.linearGradient(if(BuildConfig.STATION_SLUG=="positivafm")
        listOf(Color(0xFFDF1B22),Color(0xFF8D1E23),Color(0xFF111114)) else
        listOf(accent,androidx.compose.ui.graphics.lerp(accent,Color.Black,.43f),Color(0xFF111114))))) {
        Artwork(logo?:if(BuildConfig.STATION_SLUG=="positivafm")R.drawable.splash_positiva else R.drawable.splash_interativa,u.at(100,64,100,90))
        if(!editing) {
            Copy(if(account==null)"Entre com sua conta Google para uma melhor experiência" else "Escolha seu perfil",u,30,300,u.at(245,94,1540,60))
            Row(u.at(180,280,1100,160).graphicsLayer{alpha=firstMotion.value;translationX=(1f-firstMotion.value)*-u.space(36).toPx()},verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(u.space(24))) {
                ProfileCircle(u,Modifier.focusRequester(focus),safeImage(account?.optJSONObject("user_metadata").str("avatar_url"))?:guestAvatar,"Continuar como $guestName",onContinue)
                Column(verticalArrangement=Arrangement.spacedBy(u.space(8))) {
                    Copy(guestName,u,29,600)
                    Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(u.space(15))) {
                        Box(Modifier.background(Color.White.copy(alpha=.15f),CircleShape).padding(horizontal=u.space(14),vertical=u.space(5))) { Copy(if(account==null)"Visitante" else "Conta Google",u,18,400) }
                        if(account==null)GlassButton(u,"Editar",Modifier.height(u.space(47))) {name=guestName;avatar=guestAvatar;editing=true}
                    }
                    if(entryPending&&account==null) Copy("Entrar como visitante",u,20,400)
                }
            }
            Row(u.at(180,465,1200,160).graphicsLayer{alpha=secondMotion.value;translationX=(1f-secondMotion.value)*-u.space(36).toPx()},verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(u.space(24))) {
                if(account==null){ProfileCircle(u,Modifier,null,"Conectar minha conta Google",onConnect);Copy("Conectar minha conta",u,25,500)} else GlassButton(u,"Sair da conta Google",Modifier.height(u.space(62)),onClick=onLogout)
            }
            if(!entryPending) GlassButton(u,"",u.at(1768,148,56,56),icon="left",onClick=onContinue)
        } else {
            Copy("Editar perfil",u,38,600,u.at(265,80,1100,64))
            Column(u.at(180,235,1000,700),verticalArrangement=Arrangement.spacedBy(u.space(24))) {
                Copy("Nome do perfil",u,25,500)
                BasicTextField(name,{name=it.take(60)},Modifier.focusRequester(editFocus).fillMaxWidth().background(Color.Black.copy(alpha=.55f),u.round(18)).padding(u.space(22)),
                    singleLine=true,textStyle=u.referenceText(28,400).copy(color=Color.White),cursorBrush=SolidColor(Color.White))
                Copy("Escolher avatar",u,25,500)
                LazyRow(horizontalArrangement=Arrangement.spacedBy(u.space(12)),contentPadding=PaddingValues(u.space(10))) {
                    items(avatarList) { item ->
                        ProfileCircle(u,Modifier,item,"Avatar "+(avatarList.indexOf(item)+1)){avatar=item}
                    }
                }
                Row(horizontalArrangement=Arrangement.spacedBy(u.space(18))) {
                    GlassButton(u,"Salvar",Modifier.height(u.space(64)),enabled=name.isNotBlank()){onSave(name.trim(),avatar);editing=false}
                    GlassButton(u,"Cancelar",Modifier.height(u.space(64))){editing=false}
                }
            }
            Artwork(avatar,u.at(1340,285,280,280).clip(CircleShape),scale=ContentScale.Crop)
        }
        Copy("Nexo TV v"+BuildConfig.VERSION_NAME,u,18,400,u.at(100,1030,800,30),color=Color.White.copy(alpha=.6f))
    }
}

@Composable private fun ProfileCircle(u:TvUnits,modifier:Modifier,avatar:Any?,label:String,onClick:()->Unit) {
    var focused by remember { mutableStateOf(false) }
    val active=LocalControlsEnabled.current
    Box(modifier.size(u.space(164)).clip(CircleShape).onFocusChanged { focused=it.isFocused }.focusProperties{canFocus=active}
        .border(u.space(3),if(focused)Color.White else Color.Transparent,CircleShape)
        .clickable(enabled=active,onClick=onClick).semantics { contentDescription=label }.padding(u.space(7)),
        contentAlignment=Alignment.Center) {
        Box(Modifier.fillMaxSize().clip(CircleShape).background(glass),contentAlignment=Alignment.Center) {
            if(avatar!=null) Artwork(avatar,Modifier.fillMaxSize(),scale=ContentScale.Crop)
            else Copy("G",u,78,700)
        }
    }
}

@Composable private fun AnimatedPresenter(u:TvUnits,url:String,modifier:Modifier,bottomAligned:Boolean=false){
    var visible by remember{mutableStateOf(false)}
    LaunchedEffect(Unit){visible=true}
    Box(modifier){
        AnimatedVisibility(visible,enter=fadeIn(tween(650))+slideInHorizontally(tween(650)){it/12},exit=fadeOut(tween(450))){
            Crossfade(url,animationSpec=tween(500),label="presenterRotation"){image->if(bottomAligned)AsyncImage(safeImage(image),null,Modifier.fillMaxSize(),contentScale=ContentScale.Fit,alignment=Alignment.BottomCenter)else Artwork(safeImage(image),Modifier.fillMaxSize(),scale=ContentScale.Fit)}
        }
    }
}
@Composable private fun ExpandableProgram(u:TvUnits,modifier:Modifier,loading:Boolean=false,onClick:()->Unit){
    var focused by remember{mutableStateOf(false)}
    val active=LocalControlsEnabled.current
    Row(modifier.onFocusChanged{focused=it.isFocused}.focusProperties{canFocus=active}.height(u.space(54)).clip(CircleShape).border(u.space(2),Color.White,CircleShape).clickable(enabled=active,onClick=onClick).semantics{contentDescription="Programação"}.padding(horizontal=u.space(13)),verticalAlignment=Alignment.CenterVertically){
        if(loading)NativeSpinner(u,Modifier.size(u.space(27)))else Symbol("plus",Modifier.size(u.space(27)))
        AnimatedVisibility(focused,enter=expandHorizontally(tween(260))+fadeIn(tween(220)),exit=shrinkHorizontally(tween(260))+fadeOut(tween(180))){Row{Spacer(Modifier.width(u.space(10)));Copy("programação",u,22,500)}}
    }
}
@Composable private fun ReminderButton(u:TvUnits,prefs:android.content.SharedPreferences,profile:String,p:JSONObject){
    val id=p.str("id")
    val key="reminders:"+profile
    var enabled by remember(key,id){mutableStateOf(prefs.getStringSet(key,emptySet()).orEmpty().contains(id))}
    GlassButton(u,if(enabled)"Lembrete ativado" else "Ativar lembrete · 5 min antes",Modifier.height(u.space(56))){
        val ids=prefs.getStringSet(key,emptySet()).orEmpty().toMutableSet()
        if(enabled)ids.remove(id)else ids.add(id)
        prefs.edit().putStringSet(key,ids).apply();enabled=!enabled
    }
}

@Composable internal fun NativeSpinner(u:TvUnits,modifier:Modifier){
    val transition=rememberInfiniteTransition(label="loading")
    val angle=transition.animateFloat(0f,360f,infiniteRepeatable(tween(850,easing=LinearEasing),repeatMode=RepeatMode.Restart),label="spin")
    Canvas(modifier){val sw=size.minDimension*.11f;drawArc(Color.White,angle.value,270f,false,topLeft=Offset(sw,sw),size=Size(size.width-2*sw,size.height-2*sw),style=Stroke(sw,cap=StrokeCap.Round))}
}
@Composable private fun VideoChannelCard(u:TvUnits,image:Any?,label:String,selected:Boolean,enabled:Boolean,modifier:Modifier=Modifier,onClick:()->Unit){
    var focused by remember{mutableStateOf(false)}
    val active=enabled&&LocalControlsEnabled.current
    val shape=u.round(18)
    val interactions=remember{MutableInteractionSource()};val hovered by interactions.collectIsHoveredAsState()
    Box(modifier.size(u.space(310),u.space(175)).onFocusChanged{focused=it.isFocused}.focusProperties{canFocus=active}.hoverable(interactions).border(u.space(if(focused||hovered)4 else 0),if(focused||hovered)Color.White else Color.Transparent,shape).clip(shape).background(glass).clickable(enabled=active,onClick=onClick).semantics{contentDescription=label},contentAlignment=Alignment.Center){
        if(image!=null)Artwork(image,Modifier.fillMaxSize(),scale=ContentScale.Fit)else if(label=="Mosaico") Row(Modifier.background(Color(0xFF26262A),u.round(18)).padding(u.space(18)),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(u.space(14))){Canvas(Modifier.size(u.space(48))){val gap=size.width*.12f;val side=(size.width-gap)/2;for(y in 0..1)for(x in 0..1)drawRoundRect(if(BuildConfig.STATION_SLUG=="positivafm")Color(0xFFF20D0F)else Color.White,Offset(x*(side+gap),y*(side+gap)),Size(side,side),CornerRadius(side*.18f))};Copy(label,u,26,700)}else Copy(label,u,24,600,align=TextAlign.Center)
        if(selected)Box(Modifier.align(Alignment.TopEnd).padding(u.space(9)).background(Color(0xFFF20D0F),u.round(9)).padding(horizontal=u.space(10),vertical=u.space(4))){Copy("no ar",u,18,700)}
    }
}

private data class HomeProgramSnapshot(val id:String,val name:String,val time:String,val presenter:String)
@Composable private fun HomeProgramInfo(u:TvUnits,program:JSONObject?,presenter:JSONObject?,stationName:String,accent:Color){
    val start=program.str("horario_inicio").take(5)
    val end=program.str("horario_fim").take(5)
    val snapshot=HomeProgramSnapshot(program.str("id"),program.str("nome").ifBlank{stationName},if(start.isNotBlank()&&end.isNotBlank())"$start – $end" else "",presenter.str("nome"))
    var entered by remember{mutableStateOf(false)}
    LaunchedEffect(Unit){entered=true}
    AnimatedVisibility(entered,enter=fadeIn(tween(550))+slideInVertically(tween(550)){it/10},exit=fadeOut(tween(300))){
        AnimatedContent(targetState=snapshot,transitionSpec={
            (fadeIn(tween(450,delayMillis=150))+slideInVertically(tween(450,delayMillis=150)){it/12}) togetherWith
            (fadeOut(tween(220))+slideOutVertically(tween(220)){-it/12})
        },label="homeProgramChange"){item->
            Column(verticalArrangement=Arrangement.spacedBy(u.space(9))){
                Badge(u,"NO AR",accent,compact=true)
                Copy(item.name,u,35,700,lines=2)
                if(item.time.isNotBlank())Copy(item.time,u,22,500)
                if(item.presenter.isNotBlank())Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(u.space(10))){Symbol("mic",Modifier.size(u.space(24)));Copy(item.presenter,u,24,400,lines=2)}
            }
        }
    }
}

@Composable private fun HomeBackgroundCountdown(u:TvUnits,endsAt:Long,modifier:Modifier){
    val fraction=remember(endsAt){Animatable(homeBackgroundAdProgress(endsAt,android.os.SystemClock.elapsedRealtime()))}
    LaunchedEffect(endsAt){val remaining=(endsAt-android.os.SystemClock.elapsedRealtime()).coerceAtLeast(0L);fraction.snapTo(homeBackgroundAdProgress(endsAt,android.os.SystemClock.elapsedRealtime()));fraction.animateTo(1f,tween(remaining.toInt(),easing=LinearEasing))}
    Box(modifier.clip(CircleShape).background(Color.Black.copy(alpha=.48f)).semantics{contentDescription="Tempo de exibição da publicidade"},contentAlignment=Alignment.Center){
        Canvas(Modifier.size(u.space(48))){val sw=u.space(4).toPx();val top=Offset(sw,sw);val arc=Size(size.width-2*sw,size.height-2*sw);drawArc(Color.White.copy(alpha=.28f),-90f,360f,false,top,arc,style=Stroke(sw));drawArc(Color.White,-90f,360f*fraction.value,false,top,arc,style=Stroke(sw,cap=StrokeCap.Round))}
    }
}
