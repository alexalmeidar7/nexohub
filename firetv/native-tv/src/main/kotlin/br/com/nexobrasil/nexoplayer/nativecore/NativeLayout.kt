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

private fun TvUnits.at(x:Number,y:Number,w:Number,h:Number) = Modifier.offset(space(x),space(y)).size(space(w),space(h))
private val glass = Brush.linearGradient(listOf(Color(0x665F5F63),Color(0x5518181B),Color(0x88202023)))
private fun accentGlass(c:Color)=Brush.linearGradient(listOf(Color.White.copy(alpha=.27f),c,Color(0xFF292124)))
private fun TvUnits.round(radius:Number)=RoundedCornerShape(space(radius))

@Composable private fun Copy(text:String,u:TvUnits,size:Int,weight:Int=400,modifier:Modifier=Modifier,lines:Int=1,color:Color=Color.White,align:TextAlign=TextAlign.Start) {
    Text(text,modifier=modifier,color=color,style=u.referenceText(size,weight).copy(lineHeight=u.text(size*1.16f)),maxLines=lines,overflow=TextOverflow.Ellipsis,textAlign=align)
}
@Composable private fun Artwork(model:Any?,modifier:Modifier,desc:String?=null,scale:ContentScale=ContentScale.Fit) {
    if(model!=null && model!="") AsyncImage(model,desc,modifier,contentScale=scale)
}
@Composable private fun GlassButton(u:TvUnits,label:String,modifier:Modifier=Modifier,icon:String?=null,accent:Color?=null,enabled:Boolean=true,onClick:()->Unit) {
    var focused by remember { mutableStateOf(false) }
    val shape=u.round(40)
    Row(modifier.onFocusChanged { focused=it.isFocused }.focusProperties { canFocus=enabled }
        .background(if(accent!=null) accentGlass(accent) else glass,shape)
        .border(u.space(if(focused) 3 else 1),if(focused) Color.White else Color.White.copy(alpha=.16f),shape)
        .clickable(enabled=enabled,onClick=onClick).semantics { contentDescription=label }
        .padding(horizontal=u.space(if(icon!=null && label.isEmpty()) 0 else 20)),
        verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.Center) {
        if(icon!=null) Symbol(icon,Modifier.size(u.space(29)))
        if(label.isNotEmpty()) {
            if(icon!=null) Spacer(Modifier.width(u.space(10)))
            Copy(label,u,22,500)
        }
    }
}

@Composable private fun Symbol(kind:String,modifier:Modifier) {
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
            "music" -> { line(p(.53f,.12f),p(.53f,.70f));line(p(.53f,.12f),p(.82f,.28f));drawOval(Color.White,p(.20f,.65f),Size(w*.33f,h*.22f),style=Stroke(sw)) }
            "user" -> { drawCircle(Color.White,w*.18f,p(.50f,.30f),style=Stroke(sw));drawArc(Color.White,180f,180f,false,p(.15f,.54f),Size(w*.70f,h*.60f),style=Stroke(sw)) }
        }
    }
}

@Composable private fun RailItem(u:TvUnits,icon:String,label:String,accent:Color,modifier:Modifier=Modifier,onClick:()->Unit) {
    var focused by remember { mutableStateOf(false) }
    val shape=CircleShape
    Row(modifier.onFocusChanged { focused=it.isFocused }
        .animateContentSize(tween(260)).height(u.space(76))
        .background(if(focused) accentGlass(accent) else Brush.linearGradient(listOf(Color.Transparent,Color.Transparent)),shape)
        .border(u.space(if(focused) 3 else 0),if(focused) Color.White else Color.Transparent,shape)
        .clickable(onClick=onClick).semantics { contentDescription=label }
        .padding(u.space(7)),verticalAlignment=Alignment.CenterVertically) {
        Box(Modifier.size(u.space(62)).background(accentGlass(accent),shape).clip(shape),contentAlignment=Alignment.Center) {
            if(icon=="user") Artwork(R.drawable.visitor_avatar,Modifier.fillMaxSize(),scale=ContentScale.Crop)
            else Symbol(icon,Modifier.size(u.space(30)))
        }
        if(focused) { Spacer(Modifier.width(u.space(12)));Copy(label,u,24,500);Spacer(Modifier.width(u.space(22))) }
    }
}

@Composable internal fun NativeLayout(
    screen:Screen,station:StationBootstrap?,stationName:String,payload:JSONObject?,track:JSONObject?,program:JSONObject?,presenter:JSONObject?,
    player:ExoPlayer,playing:Boolean,buffering:Boolean,failure:String?,playerError:String?,controls:Boolean,chrome:Float,interaction:Boolean,
    banner:String,history:List<JSONObject>,historyLoading:Boolean,historyError:Boolean,notice:String?,video:List<StationChannel>,selected:StationChannel?,
    onRetry:()->Unit,onToggle:()->Unit,onBack:()->Unit,onOpen:(Screen)->Unit,onChannel:(Int)->Unit,onVideo:(StationChannel)->Unit,
    onInteraction:()->Unit,onNotice:(String?)->Unit
) {
    val accent = remember(payload) {
        val colors=payload?.optJSONObject("playerColors")
        val raw=colors.str("primary").ifBlank{colors.str("accent")}
        runCatching{Color(android.graphics.Color.parseColor(raw))}.getOrElse{
            if(BuildConfig.STATION_SLUG=="positivafm") Color(0xFFF20D0F) else Color(0xFF304D70)
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
                Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(accent.copy(alpha=.93f),Color(0xFF802027),Color(0xFF111114)))))
                if(screen==Screen.HOME||screen==Screen.AUDIO) {
                    var showArtist by remember(artistPhoto){mutableStateOf(true)}
                    LaunchedEffect(artistPhoto){while(artistPhoto.isNotBlank()){delay(if(showArtist) 20000 else 10000);showArtist=!showArtist}}
                    val fade by androidx.compose.animation.core.animateFloatAsState(if(showArtist) 1f else 0f,tween(1500),label="artist")
                    Artwork(safeImage(artistPhoto),Modifier.fillMaxSize().alpha(fade),scale=ContentScale.Crop)
                    Box(Modifier.fillMaxSize().background(Brush.horizontalGradient(listOf(Color.Black.copy(alpha=.70f),Color.Black.copy(alpha=.22f)))))
                    Artwork(safeImage(presenterPhoto),u.at(1135,102,785,978),scale=ContentScale.Fit)
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
                if(!watch) Header(u,logo,title,artist,cover,playing,accent,screen,onToggle,{onOpen(Screen.SEARCH)})
                if(screen==Screen.HOME) {
                    Box(u.at(96,254,102,420).background(glass,CircleShape).border(u.space(1),Color.White.copy(alpha=.16f),CircleShape))
                    Column(Modifier.offset(u.space(108),u.space(272)),verticalArrangement=Arrangement.spacedBy(u.space(4))) {
                        RailItem(u,"audio","Ouvir",accent,Modifier.focusRequester(focus)){onOpen(Screen.AUDIO)}
                        RailItem(u,"video","Assistir",accent){onOpen(Screen.VIDEO)}
                        RailItem(u,"catalog","On Demand",accent){onOpen(Screen.CATALOG)}
                        RailItem(u,"calendar","Grade de programação",accent){onOpen(Screen.SCHEDULE)}
                        RailItem(u,"user","Olá, visitante",accent){onOpen(Screen.PROFILE)}
                    }
                    Column(u.at(265,272,680,300),verticalArrangement=Arrangement.spacedBy(u.space(14))) {
                        Badge(u,"NO AR",accent)
                        Copy(program.str("nome").ifBlank{stationName},u,40,700,lines=2)
                        Copy(presenter.str("nome"),u,25,400)
                        GlassButton(u,"programação",Modifier.height(u.space(54)),icon="plus"){onOpen(Screen.SCHEDULE)}
                    }
                    if(banner.isNotBlank()) Artwork(safeImage(banner),u.at(265,886,1320,140).clip(u.round(12)),scale=ContentScale.Fit)
                    GlassButton(u,"",u.at(1744,950,76,76),icon="spark"){onInteraction()}
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
                            // A real amplitude-driven spectrum still requires native audio analysis.
                            if(buffering) Copy("Carregando…",u,22,500)
                        }
                    }
                    if(screen==Screen.AUDIO||controls||chrome>.01f) {
                        WatchHeader(u,logo,stationName,screen,accent,if(screen==Screen.VIDEO) chrome else 1f,controls||screen==Screen.AUDIO,{onOpen(Screen.PROFILE)})
                    }
                    if(screen==Screen.VIDEO && chrome>.01f && title!="Ao vivo") {
                        Row(u.at(100,175,630,125).alpha(chrome).background(glass,u.round(20)).padding(u.space(12)),verticalAlignment=Alignment.CenterVertically) {
                            Artwork(safeImage(cover),Modifier.size(u.space(100)).clip(u.round(14)),scale=ContentScale.Crop)
                            Spacer(Modifier.width(u.space(18)))
                            Column { Copy("tocando",u,18,700);Copy(title,u,27,700);Copy(artist,u,22) }
                        }
                    }
                    val programX by animateDpAsState(u.space(if(screen==Screen.AUDIO&&!controls)100 else 280),tween(350),label="programX")
                    if(!interaction && (screen==Screen.AUDIO || chrome>.01f)) Row(Modifier.offset(programX,u.space(928)).width(u.space(900)).height(u.space(85)).alpha(if(screen==Screen.VIDEO)chrome else 1f),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(u.space(15))) {
                        Badge(u,"Agora",accent)
                        Column { Copy(program.str("nome"),u,26,700);Copy(program.str("horario_inicio").take(5)+" – "+program.str("horario_fim").take(5)+"   "+presenter.str("nome"),u,18) }
                    }
                    if(chrome>.01f) {
                        GlassButton(u,"",u.at(100,936,40,40).alpha(chrome),icon="left",enabled=controls){onBack()}
                        GlassButton(u,"",u.at(160,912,88,88).alpha(chrome).focusRequester(focus),icon=if(playing)"pause" else "play",enabled=controls){onToggle()}
                        GlassButton(u,"",u.at(184,854,40,40).alpha(chrome),icon="up",enabled=controls){onChannel(-1)}
                        GlassButton(u,"",u.at(184,1018,40,40).alpha(chrome),icon="down",enabled=controls){onChannel(1)}
                        GlassButton(u,"programação",u.at(1490,922,225,64).alpha(chrome),icon="calendar",enabled=controls){onOpen(Screen.SCHEDULE)}
                        if(screen==Screen.VIDEO && video.size>1) LazyRow(u.at(1000,720,820,160).alpha(chrome),horizontalArrangement=Arrangement.spacedBy(u.space(16))) {
                            items(video){ ch -> GlassButton(u,ch.name,Modifier.width(u.space(350)).height(u.space(72)),enabled=controls,accent=if(ch.id==selected?.id)accent else null){onVideo(ch)} }
                        }
                    }
                    if(screen==Screen.AUDIO || chrome>.01f) GlassButton(u,"",u.at(1744,922,64,64).alpha(if(screen==Screen.VIDEO)chrome else 1f),icon="spark",enabled=screen==Screen.AUDIO||controls){onInteraction()}
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
                    Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(accent,Color(0xFF161619)))))
                    Artwork(logo,u.at(100,80,95,70))
                    Copy("Entre com sua conta Google para uma melhor experiência",u,30,500,u.at(265,80,1540,60))
                    Row(u.at(180,280,1000,150),verticalAlignment=Alignment.CenterVertically) {
                        Artwork(R.drawable.visitor_avatar,Modifier.size(u.space(150)).clip(CircleShape),scale=ContentScale.Crop)
                        Spacer(Modifier.width(u.space(25)));Column{Copy("Visitante",u,30,700);Copy("Visitante",u,20)}
                    }
                    Row(u.at(180,465,1000,150),verticalAlignment=Alignment.CenterVertically) {
                        GlassButton(u,"G",Modifier.size(u.space(150)).focusRequester(focus)){onNotice("Pareamento Google ainda em migração. Continue como visitante.")}
                        Spacer(Modifier.width(u.space(25)));Copy("Conectar minha conta",u,25)
                    }
                    GlassButton(u,"Voltar",u.at(100,950,150,56),icon="left",onClick=onBack)
                }
                if(screen==Screen.HISTORY) {
                    Copy("Últimas tocadas",u,38,600,u.at(115,245,1200,65))
                    if(historyLoading||historyError||history.isEmpty()) Copy(if(historyLoading)"Carregando…" else if(historyError)"Histórico indisponível" else "Nenhuma música registrada.",u,25,400,u.at(115,330,1300,55))
                    else LazyRow(u.at(115,345,1690,510),horizontalArrangement=Arrangement.spacedBy(u.space(25))) {
                        items(history) { song ->
                            Column(Modifier.width(u.space(270)).background(glass,u.round(24)).padding(u.space(14))) {
                                Box(Modifier.size(u.space(242)).clip(u.round(15)).background(Color.White.copy(alpha=.06f)),contentAlignment=Alignment.Center) {
                                    val url=song.str("capa_url").ifBlank{if(song.str("musica")==track.str("titulo")&&song.str("artista")==artist)cover else ""}
                                    if(url.isNotBlank())Artwork(safeImage(url),Modifier.fillMaxSize(),scale=ContentScale.Crop) else Symbol("music",Modifier.size(u.space(80)))
                                }
                                Copy(song.str("musica"),u,23,700,lines=2);Copy(song.str("artista"),u,19);Copy(song.str("horario"),u,17)
                            }
                        }
                    }
                    GlassButton(u,"Voltar",u.at(100,950,150,56).focusRequester(focus),icon="left",onClick=onBack)
                }
                if(screen==Screen.SEARCH) {
                    Copy("Busca",u,38,600,u.at(115,240,1200,60))
                    Copy("A pesquisa de conteúdos ainda está em migração.",u,25,400,u.at(115,335,1400,60))
                    GlassButton(u,"Voltar",u.at(100,950,150,56).focusRequester(focus),icon="left",onClick=onBack)
                }
                if(interaction) Row(u.at(625,790,1180,105).background(glass,u.round(28)).padding(u.space(12)),horizontalArrangement=Arrangement.spacedBy(u.space(10)),verticalAlignment=Alignment.CenterVertically) {
                    listOf("Letra","Enquete","Chat","Tempo","Últimas tocadas").forEach{ label->
                        GlassButton(u,label,Modifier.weight(1f).height(u.space(65))){ if(label=="Últimas tocadas") onOpen(Screen.HISTORY) else onNotice("$label ainda em migração.") }
                    }
                }
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

@Composable private fun Badge(u:TvUnits,label:String,accent:Color) {
    Box(Modifier.background(accentGlass(accent),u.round(13)).border(u.space(1),Color.White.copy(alpha=.25f),u.round(13)).padding(horizontal=u.space(15),vertical=u.space(6))) { Copy(label,u,21,600) }
}
@Composable private fun Clock(u:TvUnits,modifier:Modifier) {
    var clock by remember { mutableStateOf(LocalTime.now(brasilia)) }
    LaunchedEffect(Unit){while(true){clock=LocalTime.now(brasilia);delay(15000)}}
    Box(modifier.background(glass,CircleShape).border(u.space(1),Color.White.copy(alpha=.17f),CircleShape),contentAlignment=Alignment.Center){Copy(clock.format(DateTimeFormatter.ofPattern("HH:mm")),u,29,400)}
}
@Composable private fun Header(u:TvUnits,logo:String?,title:String,artist:String,cover:String,playing:Boolean,accent:Color,screen:Screen,onToggle:()->Unit,onSearch:()->Unit) {
    Artwork(logo,u.at(100,76,100,64))
    Row(u.at(210,70,400,76).clip(u.round(16)).background(glass).clickable(onClick=onToggle).padding(u.space(8)),verticalAlignment=Alignment.CenterVertically) {
        Artwork(safeImage(cover)?:logo,Modifier.size(u.space(60)).clip(u.round(8)),scale=ContentScale.Crop)
        Spacer(Modifier.width(u.space(15)))
        Column(Modifier.weight(1f)){Copy(title.uppercase(),u,22,700);Copy(artist,u,18)}
        Symbol(if(playing)"pause" else "play",Modifier.size(u.space(30)))
    }
    GlassButton(u,"",u.at(1512,76,56,56),icon="search",onClick=onSearch)
    Clock(u,u.at(1592,76,230,56))
}
@Composable private fun WatchHeader(u:TvUnits,logo:String?,name:String,screen:Screen,accent:Color,alpha:Float,enabled:Boolean,onProfile:()->Unit) {
    Row(u.at(100,76,1000,64).alpha(alpha),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(u.space(25))) {
        Artwork(logo,Modifier.size(u.space(70),u.space(60)));Copy(name,u,22,500);Badge(u,if(screen==Screen.VIDEO)"Vídeo" else "Áudio",accent)
    }
    Copy("• AO VIVO",u,20,600,u.at(1350,91,135,44).alpha(alpha))
    Clock(u,u.at(1485,76,240,62).alpha(alpha))
    Box(u.at(1760,76,62,62).alpha(alpha).clip(CircleShape).background(accentGlass(accent)).clickable(enabled=enabled,onClick=onProfile)) { Artwork(R.drawable.visitor_avatar,Modifier.fillMaxSize(),scale=ContentScale.Crop) }
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
                            .clip(shape).clickable{details=p}.padding(u.space(9)),verticalArrangement=Arrangement.SpaceBetween) {
                            Copy(p.str("nome"),u,19,700,lines=if(height>100)3 else 1)
                            if(height>125) {
                                val ids=p.strings("apresentadores_ids").ifEmpty{listOf(p.str("apresentador_id"))}
                                Row(Modifier.fillMaxWidth().weight(1f),horizontalArrangement=Arrangement.Center) {
                                    ids.take(2).forEach{id-> Artwork(safeImage(people[id].str("foto")),Modifier.weight(1f).fillMaxHeight(),scale=ContentScale.Fit)}
                                }
                            }
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
