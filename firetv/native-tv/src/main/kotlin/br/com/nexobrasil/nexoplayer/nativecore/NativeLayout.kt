package br.com.nexobrasil.nexoplayer.nativecore

import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
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
internal val glass = Brush.linearGradient(listOf(Color(0x705C5C60),Color(0x80232327),Color(0xA018181B)))
private fun accentGlass(c:Color)=Brush.linearGradient(listOf(androidx.compose.ui.graphics.lerp(c,Color.White,.24f),c,Color(0xFF292124)))
internal fun TvUnits.round(radius:Number)=RoundedCornerShape(space(radius))

@Composable internal fun Copy(text:String,u:TvUnits,size:Int,weight:Int=400,modifier:Modifier=Modifier,lines:Int=1,color:Color=Color.White,align:TextAlign=TextAlign.Start) {
    Text(text,modifier=modifier,color=color,style=u.referenceText(size,weight).copy(lineHeight=u.text(size*1.16f)),maxLines=lines,overflow=TextOverflow.Ellipsis,textAlign=align)
}
@Composable internal fun Artwork(model:Any?,modifier:Modifier,desc:String?=null,scale:ContentScale=ContentScale.Fit,filter:ColorFilter?=null) {
    if(model!=null && model!="") AsyncImage(model,desc,modifier,contentScale=scale,colorFilter=filter)
}
@Composable internal fun GlassButton(u:TvUnits,label:String,modifier:Modifier=Modifier,icon:String?=null,accent:Color?=null,enabled:Boolean=true,outline:Boolean=false,accentRing:Boolean=false,onClick:()->Unit) {
    var focused by remember { mutableStateOf(false) }
    val shape=CircleShape
    Row(modifier.clip(shape).onFocusChanged { focused=it.isFocused }.focusProperties { canFocus=enabled }
        .background(if(outline) Brush.linearGradient(listOf(Color.Transparent,Color.Transparent)) else if(accent!=null && !accentRing) accentGlass(accent) else glass,shape)
        .border(u.space(if(focused || accentRing) 3 else if(outline) 2 else 1),if(focused || outline) Color.White else if(accentRing) accent ?: Color.White else Color.White.copy(alpha=.16f),shape)
        .clickable(enabled=enabled,onClick=onClick).semantics { contentDescription=label.ifEmpty{when(icon){"play"->"Reproduzir";"pause"->"Pausar";"left"->"Voltar";"up"->"Canal anterior";"down"->"Próximo canal";"search"->"Buscar";"spark"->"Interatividade";else->"Controle"}} }
        .padding(horizontal=u.space(if(icon!=null && label.isEmpty()) 0 else 20)),
        verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.Center) {
        if(icon!=null) Symbol(icon,Modifier.size(u.space(29)))
        if(label.isNotEmpty()) {
            if(icon!=null) Spacer(Modifier.width(u.space(10)))
            Copy(label,u,22,500)
        }
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

@Composable private fun RailItem(u:TvUnits,icon:String,label:String,accent:Color,modifier:Modifier=Modifier,avatar:Int=R.drawable.visitor_avatar,onClick:()->Unit) {
    var focused by remember { mutableStateOf(false) }
    val shape=CircleShape
    Row(modifier.onFocusChanged { focused=it.isFocused }
        .animateContentSize(tween(260)).height(u.space(76)).clip(shape)
        .background(if(focused) accentGlass(accent) else Brush.linearGradient(listOf(Color.Transparent,Color.Transparent)),shape)
        .border(u.space(if(focused) 3 else 0),if(focused) Color.White else Color.Transparent,shape)
        .clickable(onClick=onClick).semantics { contentDescription=label }
        .padding(u.space(7)),verticalAlignment=Alignment.CenterVertically) {
        Box(Modifier.size(u.space(62)).background(accentGlass(accent),shape).clip(shape),contentAlignment=Alignment.Center) {
            if(icon=="user") Artwork(avatar,Modifier.fillMaxSize(),scale=ContentScale.Crop)
            else Symbol(icon,Modifier.size(u.space(30)))
        }
        if(focused) { Spacer(Modifier.width(u.space(12)));Copy(label,u,24,500);Spacer(Modifier.width(u.space(22))) }
    }
}

@Composable internal fun NativeLayout(
    screen:Screen,station:StationBootstrap?,stationName:String,payload:JSONObject?,track:JSONObject?,program:JSONObject?,presenter:JSONObject?,
    player:ExoPlayer,playing:Boolean,buffering:Boolean,failure:String?,playerError:String?,controls:Boolean,chrome:Float,interaction:Boolean,
    banner:String,sponsor:String?,weather:JSONObject?,history:List<JSONObject>,historyLoading:Boolean,historyError:Boolean,notice:String?,video:List<StationChannel>,selected:StationChannel?,
    onRetry:()->Unit,onToggle:()->Unit,onBack:()->Unit,onOpen:(Screen)->Unit,onChannel:(Int)->Unit,onVideo:(StationChannel)->Unit,
    onInteraction:()->Unit,onNotice:(String?)->Unit,
    entryPending:Boolean,guestName:String,guestAvatar:Int,onGuestSave:(String,Int)->Unit,onProfileContinue:()->Unit,
    spectrum:PcmSpectrum,panel:String?,forecast:JSONObject?,lyrics:String?,cep:String,api:HouseMixClient,services:NativeServices,account:JSONObject?,onAccount:(JSONObject)->Unit,onLogout:()->Unit,onPanel:(String?)->Unit,onCepSaved:(String,JSONObject)->Unit
) {
    val accent = remember(payload) {
        val colors=payload?.optJSONObject("playerColors")
        val raw=colors.str("dominantColor").ifBlank{colors.str("homeAccent")}.ifBlank{colors.str("primary")}.ifBlank{colors.str("accent")}
        runCatching{Color(android.graphics.Color.parseColor(raw))}.getOrElse{
            if(BuildConfig.STATION_SLUG=="positivafm") Color(0xFFF20D0F) else Color(0xFF343434)
        }
    }
    val focus=remember(screen,station!=null,failure,controls){FocusRequester()}
    val ready=station!=null||failure!=null
    LaunchedEffect(focus,ready) { if(ready && (screen!=Screen.AUDIO && screen!=Screen.VIDEO || controls)) runCatching{focus.requestFocus()} }
    val cover=track.str("capa")
    val title=track.str("titulo").ifBlank{"Ao vivo"}
    val artist=track.str("artista")
    val artistPhoto=payload.str("musicDeezerArtistImg")
    val presenterPhoto=presenter.str("foto")
    val logo=station?.logoUrl
    TvViewport(Modifier.background(Color.Black)) { u ->
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            val watch=screen==Screen.VIDEO||screen==Screen.AUDIO
            if(screen!=Screen.VIDEO) {
                Box(Modifier.fillMaxSize().background(Brush.linearGradient(if(BuildConfig.STATION_SLUG=="positivafm") listOf(Color(0xFFDF1B22),Color(0xFF8D1E23),Color(0xFF111114)) else listOf(accent,Color(red=accent.red*.56f,green=accent.green*.56f,blue=accent.blue*.56f),Color(0xFF111114)))))
                if(screen==Screen.HOME||screen==Screen.AUDIO||screen==Screen.SCHEDULE) {
                    var showArtist by remember(artistPhoto){mutableStateOf(true)}
                    LaunchedEffect(artistPhoto){while(artistPhoto.isNotBlank()){delay(if(showArtist) 20000 else 10000);showArtist=!showArtist}}
                    val fade by androidx.compose.animation.core.animateFloatAsState(if(showArtist && artistPhoto.isNotBlank()) 1f else 0f,tween(1500),label="artist")
                    Artwork(safeImage(artistPhoto),Modifier.fillMaxSize().alpha(fade),scale=ContentScale.Crop)
                    Box(Modifier.fillMaxSize().alpha(fade).background(Brush.horizontalGradient(listOf(Color.Black.copy(alpha=.74f),Color.Black.copy(alpha=.45f)))))
                    Artwork(safeImage(presenterPhoto),u.at(1152,108,768,972),scale=ContentScale.Fit)
                    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent,Color.Transparent,Color.Black.copy(alpha=.78f)))))
                }
            }
            if(screen==Screen.VIDEO) {
                AndroidView(factory={ctx->PlayerView(ctx).apply{useController=false;this.player=player;isFocusable=false}},modifier=Modifier.fillMaxSize(),onReset={it.player=null},onRelease={it.player=null},update={it.player=player})
                Box(Modifier.fillMaxSize().alpha(chrome).background(Brush.verticalGradient(listOf(Color.Black.copy(alpha=.7f),Color.Transparent,Color.Transparent,Color.Black.copy(alpha=.85f)))))
            }
            if(!ready) {
                Artwork(logo,u.at(830,340,260,190))
                Copy("Carregando…",u,32,500,u.at(710,570,500,60),align=TextAlign.Center)
            } else if(failure!=null) {
                Copy(failure,u,35,500,u.at(100,300,1500,70))
                GlassButton(u,"Tentar novamente",u.at(100,400,330,64).focusRequester(focus),onClick=onRetry)
            } else {
                if(!watch && screen!=Screen.PROFILE) Header(u,logo,title,artist,cover,playing,accent,screen,weather,if(screen==Screen.HOME) Modifier.focusRequester(focus) else Modifier,spectrum,onToggle,{onOpen(Screen.SEARCH)},{onPanel("cep")})
                if(screen==Screen.HOME) {
                    val programLeft = 265f
                    Box(u.at(96,254,102,432).background(glass,CircleShape).border(u.space(1),Color.White.copy(alpha=.16f),CircleShape))
                    Column(Modifier.offset(u.space(108),u.space(272)).zIndex(2f),verticalArrangement=Arrangement.spacedBy(u.space(4))) {
                        RailItem(u,"audio","Ouvir",accent){onOpen(Screen.AUDIO)}
                        RailItem(u,"video","Assistir",accent){onOpen(Screen.VIDEO)}
                        RailItem(u,"catalog","On Demand",accent){onOpen(Screen.CATALOG)}
                        RailItem(u,"calendar","Grade de programação",accent){onOpen(Screen.SCHEDULE)}
                        RailItem(u,"user","Olá, $guestName",accent,avatar=guestAvatar){onOpen(Screen.PROFILE)}
                    }
                    Column(u.at(programLeft,272,505,310),verticalArrangement=Arrangement.spacedBy(u.space(12))) {
                        Badge(u,"NO AR",accent,compact=true)
                        Copy(program.str("nome").ifBlank{stationName},u,35,700,lines=3)
                        Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(u.space(10))) { Symbol("mic",Modifier.size(u.space(24)));Copy(presenter.str("nome"),u,24,400) }
                        Spacer(Modifier.height(u.space(6)))
                        GlassButton(u,"programação",Modifier.height(u.space(54)),icon="plus",outline=true){onOpen(Screen.SCHEDULE)}
                    }
                    if(sponsor!=null && !interaction && panel==null) Artwork(sponsor,u.at(1641,746,202,202))
                    if(banner.isNotBlank() && !interaction && panel==null) {
                        val model:Any?=if(banner.substringBefore("?")=="https://qazvgmgdidjhbvcuinpy.supabase.co/storage/v1/object/public/comercial/452ebd1e-61a0-42dd-bf80-231a3f426c83/player-ads/00198081-b99d-4548-8561-ff953209d17a.png") R.drawable.home_hotpark else safeImage(banner)
                        Artwork(model,u.at(265,886,1320,140).clip(u.round(12)),scale=ContentScale.Fit)
                    }
                    GlassButton(u,"",u.at(1744,950,76,76),icon="spark",accent=accent,accentRing=true){onInteraction()}
                    Copy("Nexo TV v"+BuildConfig.VERSION_NAME,u,15,400,u.at(100,1030,800,25),color=Color.White.copy(alpha=.55f))
                }
                if(watch) {
                    if(screen==Screen.AUDIO) {
                        Box(u.at(100,296,440,440).clip(u.round(36)).background(glass).border(u.space(3),Color.White.copy(alpha=.27f),u.round(36)),contentAlignment=Alignment.Center) {
                            if(cover.isNotBlank()) Artwork(safeImage(cover),Modifier.fillMaxSize(),scale=ContentScale.Crop)
                            else Symbol("music",Modifier.size(u.space(100)))
                        }
                        Column(u.at(582,376,625,330),verticalArrangement=Arrangement.spacedBy(u.space(18))) {
                            Copy("tocando",u,20,700)
                            Copy(title.uppercase(),u,50,700,lines=2)
                            Copy(artist.uppercase(),u,27,400,lines=2)
                            SpectrumBars(spectrum,playing,accent,Modifier.size(u.space(415),u.space(76)),42)
                            if(buffering) Copy("Carregando…",u,22,500)
                        }
                    }
                    if(screen==Screen.AUDIO||controls||chrome>.01f) {
                        WatchHeader(u,logo,stationName,screen,accent,weather,if(screen==Screen.VIDEO) chrome else 1f,controls||screen==Screen.AUDIO,guestAvatar,{onOpen(Screen.PROFILE)},{onPanel("cep")})
                    }
                    if(screen==Screen.VIDEO && chrome>.01f && title!="Ao vivo") {
                        Row(u.at(134,455,850,165).alpha(chrome).background(glass,u.round(20)).padding(u.space(12)),verticalAlignment=Alignment.CenterVertically) {
                            Artwork(safeImage(cover),Modifier.size(u.space(144)).clip(u.round(22)),scale=ContentScale.Crop)
                            Spacer(Modifier.width(u.space(18)))
                            Column { Copy("tocando",u,18,700);Copy(title,u,40,700);Copy(artist,u,29) }
                        }
                    }
                    if(sponsor!=null && !interaction && (screen==Screen.AUDIO || chrome>.01f)) Artwork(sponsor,u.at(1630,730,190,130).alpha(if(screen==Screen.VIDEO)chrome else 1f))
                    val programX by animateDpAsState(u.space(if(screen==Screen.AUDIO&&!controls)100 else 280),tween(350),label="programX")
                    if(!interaction && panel==null && (screen==Screen.AUDIO || chrome>.01f)) Row(Modifier.offset(programX,u.space(928)).width(u.space(900)).height(u.space(85)).alpha(if(screen==Screen.VIDEO)chrome else 1f),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(u.space(15))) {
                        Badge(u,"Agora",accent)
                        Column { Copy(program.str("nome"),u,26,700);Copy(program.str("horario_inicio").take(5)+" – "+program.str("horario_fim").take(5)+"   "+presenter.str("nome"),u,18) }
                    }
                    if(chrome>.01f && panel==null) {
                        GlassButton(u,"",u.at(100,936,40,40).alpha(chrome),icon="left",enabled=controls){onBack()}
                        GlassButton(u,"",u.at(160,912,88,88).alpha(chrome).focusRequester(focus),icon=if(playing)"pause" else "play",enabled=controls){onToggle()}
                        GlassButton(u,"",u.at(184,854,40,40).alpha(chrome),icon="up",enabled=controls){onChannel(-1)}
                        GlassButton(u,"",u.at(184,1018,40,40).alpha(chrome),icon="down",enabled=controls){onChannel(1)}
                        GlassButton(u,"programação",u.at(1490,922,225,64).alpha(chrome),icon="calendar",enabled=controls){onOpen(Screen.SCHEDULE)}
                        if(screen==Screen.VIDEO && video.size>1) LazyRow(u.at(1000,720,820,160).alpha(chrome),horizontalArrangement=Arrangement.spacedBy(u.space(16))) {
                            items(video){ ch -> GlassButton(u,ch.name,Modifier.width(u.space(350)).height(u.space(72)),enabled=controls,accent=if(ch.id==selected?.id)accent else null){onVideo(ch)} }
                        }
                    }
                    if(panel==null && (screen==Screen.AUDIO || chrome>.01f)) GlassButton(u,"",u.at(1744,922,64,64).alpha(if(screen==Screen.VIDEO)chrome else 1f),icon="spark",enabled=screen==Screen.AUDIO||controls){onInteraction()}
                    playerError?.let { Copy(it,u,25,500,u.at(100,800,900,50)) }
                }
                if(screen==Screen.SCHEDULE) Schedule(u,payload,program,accent,focus,onBack)
                if(screen==Screen.CATALOG) {
                    Copy("On Demand",u,38,600,u.at(115,248,1200,70))
                    val entries=payload.rows("channels").filter{it.str("type")!="audio_live"&&it.str("type")!="video_live"}
                    if(entries.isEmpty()) Box(u.at(115,320,560,110).background(glass,u.round(22)).padding(u.space(25))) { Copy("Ainda não há conteúdos On Demand disponíveis nesta rádio.",u,23,400,lines=3) }
                    else Column(u.at(115,320,1600,550).verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(u.space(20))) {
                        entries.forEach{ch-> GlassButton(u,ch.str("catalog_name").ifBlank{ch.str("name")},Modifier.height(u.space(70))){onNotice("A reprodução do catálogo ainda está em migração.")} }
                    }
                    GlassButton(u,"Voltar",u.at(100,950,150,56).focusRequester(focus),icon="left",onClick=onBack)
                }
                if(screen==Screen.PROFILE) {
                    NativeProfiles(u,logo,accent,focus,entryPending,guestName,guestAvatar,onProfileContinue,onGuestSave,
                        onConnect={onPanel("pair")},account=account,onLogout=onLogout)
                }
                if(interaction && panel==null) InteractionCards(u, {onPanel(it)}, onInteraction)
                if(panel!=null) NativePanel(u,panel,payload,track,history,historyLoading,historyError,forecast,lyrics,cep,api,station?.ownerId,accent,{onPanel(null)},onCepSaved,onOpen,services,account,onAccount)

            }
            if(notice!=null) Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha=.60f)),contentAlignment=Alignment.Center) {
                val close=remember{FocusRequester()};LaunchedEffect(notice){close.requestFocus()}
                Column(Modifier.width(u.space(620)).background(glass,u.round(28)).padding(u.space(38)),verticalArrangement=Arrangement.spacedBy(u.space(28))) {
                    Copy(notice,u,28,500,lines=4)
                    GlassButton(u,"Voltar",Modifier.height(u.space(60)).focusRequester(close),icon="left"){onNotice(null)}
                }
            }
        }
    }
}

@Composable private fun Badge(u:TvUnits,label:String,accent:Color,compact:Boolean=false) {
    Box(Modifier.background(accentGlass(accent),u.round(if(compact)10 else 13)).border(u.space(1),Color.White.copy(alpha=.25f),u.round(if(compact)10 else 13)).padding(horizontal=u.space(if(compact)13 else 15),vertical=u.space(if(compact)5 else 6))) { Copy(label,u,if(compact)15 else 21,650) }
}
@Composable private fun Clock(u:TvUnits,modifier:Modifier,weather:JSONObject?,onClick:()->Unit) {
    var clock by remember { mutableStateOf(LocalTime.now(brasilia)) }
    LaunchedEffect(Unit){while(true){clock=LocalTime.now(brasilia);delay(15000)}}
    val temp=weather?.opt("temperature_2m") as? Number
    val weatherCode=(weather?.opt("weather_code") as? Number)?.toInt()
    var focused by remember { mutableStateOf(false) }
    Row(modifier.clip(CircleShape).onFocusChanged{focused=it.isFocused}.background(glass,CircleShape).border(u.space(if(focused)3 else 1),Color.White.copy(alpha=if(focused)1f else .17f),CircleShape).clickable(onClick=onClick).semantics{contentDescription="Configurar previsão do tempo pelo CEP"},horizontalArrangement=Arrangement.Center,verticalAlignment=Alignment.CenterVertically){
        Copy(clock.format(DateTimeFormatter.ofPattern("HH:mm")),u,29,400)
        run {Spacer(Modifier.width(u.space(12)));Copy("|",u,22,400,color=Color.White.copy(alpha=.55f));Spacer(Modifier.width(u.space(12)));Symbol(when(weatherCode ?: -1){0,1->"sun";in 51..99->"rain";else->"cloud"},Modifier.size(u.space(30)));Spacer(Modifier.width(u.space(8)));Copy(temp?.let{kotlin.math.round(it.toDouble()).toInt().toString()+"°"}?:"--°",u,28,400)}
    }
}
@OptIn(ExperimentalFoundationApi::class)
@Composable private fun Header(u:TvUnits,logo:String?,title:String,artist:String,cover:String,playing:Boolean,accent:Color,screen:Screen,weather:JSONObject?,trackFocus:Modifier,spectrum:PcmSpectrum,onToggle:()->Unit,onSearch:()->Unit,onCep:()->Unit) {
    Artwork(logo,u.at(100,63,90,90))
    var focused by remember { mutableStateOf(false) }
    val shape=u.round(16)
    Row(u.at(214,70,400,76).then(trackFocus).onFocusChanged{focused=it.isFocused}.background(glass,shape).border(u.space(if(focused)3 else 1),Color.White.copy(alpha=if(focused)1f else .15f),shape).clickable(onClick=onToggle).padding(u.space(8)),verticalAlignment=Alignment.CenterVertically) {
        Artwork(safeImage(cover)?:logo,Modifier.size(u.space(60)).clip(u.round(8)),scale=ContentScale.Crop)
        Spacer(Modifier.width(u.space(15)))
        Column(Modifier.weight(1f)){Copy(title.uppercase(),u,22,700,Modifier.basicMarquee(iterations=Int.MAX_VALUE,initialDelayMillis=2000,repeatDelayMillis=3000));Copy(artist,u,18,400,Modifier.basicMarquee(iterations=Int.MAX_VALUE,initialDelayMillis=2000,repeatDelayMillis=3000))}
        SpectrumBars(spectrum,playing,Color.White,Modifier.size(u.space(62),u.space(52)),9)
    }
    GlassButton(u,"",u.at(1512,76,56,56),icon="search",onClick=onSearch)
    Clock(u,u.at(1592,76,230,56),weather,onCep)
}
@Composable private fun WatchHeader(u:TvUnits,logo:String?,name:String,screen:Screen,accent:Color,weather:JSONObject?,alpha:Float,enabled:Boolean,guestAvatar:Int,onProfile:()->Unit,onCep:()->Unit) {
    Row(u.at(100,76,1000,64).alpha(alpha),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(u.space(25))) {
        Artwork(logo,Modifier.size(u.space(70),u.space(60)));Copy(name,u,22,500);Badge(u,if(screen==Screen.VIDEO)"Vídeo" else "Áudio",accent)
    }
    Copy("• AO VIVO",u,20,600,u.at(1350,91,135,44).alpha(alpha))
    Clock(u,u.at(1485,76,240,62).alpha(alpha),weather,onCep)
    Box(u.at(1760,76,62,62).alpha(alpha).clip(CircleShape).background(accentGlass(accent)).clickable(enabled=enabled,onClick=onProfile)) { Artwork(guestAvatar,Modifier.fillMaxSize(),scale=ContentScale.Crop) }
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
@Composable private fun Schedule(u:TvUnits,payload:JSONObject?,current:JSONObject?,accent:Color,focus:FocusRequester,onBack:()->Unit) {
    val today=LocalDate.now(brasilia)
    val now=LocalTime.now(brasilia).let{it.hour*60+it.minute}
    val programs=payload.rows("programas")
    val people=payload.rows("apresentadores").associateBy{it.str("id")}
    var details by remember{mutableStateOf<JSONObject?>(null)}
    val scroll=rememberScrollState()
    val initial=u.space(((now/30)*56-230).coerceAtLeast(0))
    val density=androidx.compose.ui.platform.LocalDensity.current
    LaunchedEffect(Unit){scroll.scrollTo(with(density){initial.roundToPx()})}
    GlassButton(u,"",u.at(1768,148,52,52).focusRequester(focus),icon="left",onClick=onBack)
    Column(u.at(100,216,1720,654).background(Color(0xF5101113),u.round(30)).padding(u.space(14))) {
        Row(horizontalArrangement=Arrangement.spacedBy(u.space(12))) {
            Box(Modifier.width(u.space(120)).height(u.space(74)).background(Color(0xFF303136),u.round(23)),contentAlignment=Alignment.Center){Copy("Horário",u,20,600)}
            repeat(7){d-> val date=today.plusDays(d.toLong())
                Box(Modifier.weight(1f).height(u.space(74)).background(Color(0xFF303136),u.round(23)),contentAlignment=Alignment.Center){Copy((if(d==0)"hoje" else days[date.dayOfWeek.value-1].take(3).lowercase())+" "+date.format(DateTimeFormatter.ofPattern("dd/MM")),u,20,700)}
            }
        }
        Spacer(Modifier.height(u.space(8)))
        Row(Modifier.weight(1f).verticalScroll(scroll),horizontalArrangement=Arrangement.spacedBy(u.space(12))) {
            Column(Modifier.width(u.space(120)).background(Color(0xFF212224),u.round(18))) {
                repeat(48){n-> Box(Modifier.height(u.space(56)).fillMaxWidth(),contentAlignment=Alignment.Center){Copy(labelMinute(n*30),u,18,700,color=if(n==now/30)Color.White else Color(0xFF8B8D94))} }
            }
            repeat(7){d->
                val date=today.plusDays(d.toLong())
                Box(Modifier.weight(1f).height(u.space(2688)).background(Color(0xFF171819),u.round(18))) {
                    programs.flatMap{segments(it,date)}.forEach{seg->
                        val p=seg.p;val live=d==0&&p.str("id")==current.str("id")&&now in seg.start until seg.end
                        var focused by remember(p.str("id"),seg.start){mutableStateOf(false)}
                        val shape=u.round(20)
                        val height=((seg.end-seg.start)*56f/30-8).coerceAtLeast(35f)
                        Column(Modifier.offset(y=u.space(seg.start*56f/30)).height(u.space(height)).fillMaxWidth()
                            .onFocusChanged{focused=it.isFocused}
                            .background(if(live||focused)accentGlass(accent) else Brush.linearGradient(listOf(Color(0xFF303136),Color(0xFF202123))),shape)
                            .border(u.space(if(focused)3 else 0),if(focused)Color.White else Color.Transparent,shape)
                            .clip(shape).clickable{details=p}.padding(u.space(9)),verticalArrangement=Arrangement.spacedBy(u.space(5))) {
                            Copy(p.str("nome"),u,19,700,lines=if(height>100)3 else 1)
                            if(seg.end-seg.start>90) {
                                val ids=p.strings("apresentadores_ids").ifEmpty{listOf(p.str("apresentador_id"))}
                                Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(u.space(5))) {
                                    ids.take(2).forEach{id-> Artwork(safeImage(people[id].str("foto")),Modifier.size(u.space(56)).clip(CircleShape).background(accentGlass(accent)).alpha(if(live||focused)1f else .4f),scale=ContentScale.Crop,filter=if(live||focused)null else ColorFilter.colorMatrix(ColorMatrix().apply{setToSaturation(0f)}))}
                                }
                            }
                            Spacer(Modifier.weight(1f))
                            if(height>64)Copy((if(live)"no ar • " else "")+labelMinute(seg.start)+"–"+labelMinute(seg.end),u,16,500)
                        }
                    }
                }
            }
        }
    }
    details?.let{p->
        Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha=.55f)),contentAlignment=Alignment.Center) {
            val back=remember{FocusRequester()};LaunchedEffect(p){back.requestFocus()}
            Row(Modifier.size(u.space(1200),u.space(560)).background(glass,u.round(32)).padding(u.space(40)),horizontalArrangement=Arrangement.spacedBy(u.space(35))) {
                val ids=p.strings("apresentadores_ids").ifEmpty{listOf(p.str("apresentador_id"))}
                Artwork(safeImage(people[ids.firstOrNull()].str("foto")),Modifier.width(u.space(400)).fillMaxHeight())
                Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(u.space(18))) {
                    Copy(p.str("nome"),u,40,700,lines=2)
                    Copy(p.str("horario_inicio").take(5)+" – "+p.str("horario_fim").take(5),u,25)
                    Copy(p.str("descricao").ifBlank{"Descrição não cadastrada."},u,23,400,lines=6)
                    GlassButton(u,"Voltar",Modifier.height(u.space(62)).focusRequester(back),icon="left"){details=null}
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
    val avatarList=listOf(R.drawable.visitor_avatar,R.drawable.visitor_avatar_1,R.drawable.visitor_avatar_2,R.drawable.visitor_avatar_3,R.drawable.visitor_avatar_4,R.drawable.visitor_avatar_5,R.drawable.visitor_avatar_6,R.drawable.visitor_avatar_7,R.drawable.visitor_avatar_8)
    BackHandler(editing) { editing=false }
    LaunchedEffect(editing) { if(editing) editFocus.requestFocus() else runCatching { focus.requestFocus() } }
    Box(Modifier.fillMaxSize().background(Brush.linearGradient(if(BuildConfig.STATION_SLUG=="positivafm")
        listOf(Color(0xFFDF1B22),Color(0xFF8D1E23),Color(0xFF111114)) else
        listOf(accent,androidx.compose.ui.graphics.lerp(accent,Color.Black,.43f),Color(0xFF111114))))) {
        Artwork(logo?:if(BuildConfig.STATION_SLUG=="positivafm")R.drawable.splash_positiva else R.drawable.splash_interativa,u.at(100,64,100,90))
        if(!editing) {
            Copy(if(account==null)"Entre com sua conta Google para uma melhor experiência" else "Escolha seu perfil",u,30,500,u.at(265,80,1540,60))
            Row(u.at(180,280,1100,160),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(u.space(24))) {
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
            Row(u.at(180,465,1200,160),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(u.space(24))) {
                if(account==null){ProfileCircle(u,Modifier,null,"Conectar minha conta Google",onConnect);Copy("Conectar minha conta",u,25,500)} else GlassButton(u,"Sair da conta Google",Modifier.height(u.space(62)),onClick=onLogout)
            }
            if(!entryPending) GlassButton(u,"Voltar",u.at(100,950,150,56),icon="left",onClick=onContinue)
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
    Box(modifier.size(u.space(164)).clip(CircleShape).onFocusChanged { focused=it.isFocused }
        .border(u.space(3),if(focused)Color.White else Color.Transparent,CircleShape)
        .clickable(onClick=onClick).semantics { contentDescription=label }.padding(u.space(7)),
        contentAlignment=Alignment.Center) {
        Box(Modifier.fillMaxSize().clip(CircleShape).background(glass),contentAlignment=Alignment.Center) {
            if(avatar!=null) Artwork(avatar,Modifier.fillMaxSize(),scale=ContentScale.Crop)
            else Copy("G",u,78,700)
        }
    }
}
