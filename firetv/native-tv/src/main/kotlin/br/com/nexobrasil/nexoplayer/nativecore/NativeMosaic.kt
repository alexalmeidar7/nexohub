package br.com.nexobrasil.nexoplayer.nativecore
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.ui.graphics.graphicsLayer
import kotlinx.coroutines.delay
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.clickable
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.*
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.AudioAttributes
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import org.json.JSONObject
internal fun mosaicDirectStream(url:String):Boolean = url.startsWith("https://",true)&&!url.contains("youtu",true)
@Composable internal fun NativeMosaic(channels:List<StationChannel>,payload:JSONObject?,foreground:Boolean,onExit:()->Unit,onSelect:(StationChannel)->Unit,weather:JSONObject?=null,avatar:Any=R.drawable.visitor_avatar,onProfile:()->Unit=onExit,onHome:()->Unit=onExit,onAudio:()->Unit=onExit){
    val context=LocalContext.current
    val focus=remember{FocusRequester()}
    var index by remember(channels.map{it.id}){mutableIntStateOf(0)}
    var paused by remember{mutableStateOf(false)}
    var footerFocus by remember{mutableIntStateOf(-1)}
    var expanding by remember{mutableStateOf(false)}
    val zoom by animateFloatAsState(if(expanding)1.65f else 1f,tween(300),label="mosaicExpand")
    LaunchedEffect(expanding){if(expanding){delay(300);channels.getOrNull(index)?.let(onSelect)}}
    val colors=payload?.optJSONObject("playerColors")
    val accent=runCatching{Color(android.graphics.Color.parseColor(colors.str("dominantColor").ifBlank{colors.str("homeAccent")}))}.getOrElse{if(BuildConfig.STATION_SLUG=="positivafm")Color(0xFFF20D0F)else Color(0xFF343434)}
    val memory=remember{context.getSystemService(android.content.Context.ACTIVITY_SERVICE) as android.app.ActivityManager}
    val limit=if(memory.isLowRamDevice||memory.memoryClass<192)2 else 4
    val activeIndices=(listOf(index).filter{it in channels.indices} + channels.indices).distinct().filter{mosaicDirectStream(channels[it].url)}.take(limit).toSet()
    val players=remember(channels.map{it.id+"|"+it.url},activeIndices){
        channels.mapIndexed{i,ch->if(i !in activeIndices)null else ExoPlayer.Builder(context).setLoadControl(nativeLoadControl(context,true)).build().apply{
            setAudioAttributes(AudioAttributes.DEFAULT,false)
            volume=0f
            trackSelectionParameters=trackSelectionParameters.buildUpon().setMaxVideoSize(640,360).setMaxVideoBitrate(900000).build()
            val item=MediaItem.Builder().setUri(ch.url);if(ch.url.contains(".m3u8",true))item.setMimeType(MimeTypes.APPLICATION_M3U8)
            setMediaItem(item.build());prepare();playWhenReady=foreground
        }}
    }
    DisposableEffect(players){onDispose{players.filterNotNull().forEach{it.release()}}}
    LaunchedEffect(index,players,foreground,paused){players.forEachIndexed{i,p->p?.volume=if(i==index&&foreground)1f else 0f;p?.playWhenReady=foreground&&!paused}}
    LaunchedEffect(Unit){withFrameNanos{};runCatching{focus.requestFocus()}}
    BackHandler{onExit()}
    TvViewport(Modifier.background(Color.Black)){u->
        Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(accent,androidx.compose.ui.graphics.lerp(accent,Color.Black,.55f),Color(0xFF111114)))).focusRequester(focus).onPreviewKeyEvent{e->
            if(e.type!=KeyEventType.KeyDown||channels.isEmpty())false else if(expanding)true else when(e.key){
                Key.DirectionDown->{footerFocus=0;true}
                Key.DirectionRight->{if(footerFocus>=0)footerFocus=(footerFocus+1)%4 else index=(index+1)%channels.size;true}
                Key.DirectionUp->{footerFocus=-1;true}
                Key.DirectionLeft->{if(footerFocus>=0)footerFocus=(footerFocus+3)%4 else index=(index-1+channels.size)%channels.size;true}
                Key.DirectionCenter,Key.Enter->{if(footerFocus>=0){when(footerFocus){0->onHome();1->onAudio();2->paused=!paused;3->onExit()}}else channels.getOrNull(index)?.takeIf{mosaicDirectStream(it.url)||youtubeVideoId(it.url)!=null}?.let{expanding=true};true}
                else->false
            }
        }.focusable()){
            WatchHeader(u,payload?.optJSONObject("empresa").str("logo").ifBlank{payload?.optJSONObject("empresa").str("logo_url")},BuildConfig.STATION_NAME,Screen.VIDEO,accent,weather,1f,false,avatar,onProfile,{})
            val columns=if(channels.size<=2)channels.size.coerceAtLeast(1) else kotlin.math.ceil(kotlin.math.sqrt(channels.size.toDouble())).toInt()
            val rows=(channels.size+columns-1)/columns
            val width=minOf(820f,(1720f-(columns-1)*24f)/columns,(740f/rows-42f)*16f/9f).coerceAtLeast(110f)
            Column(Modifier.align(Alignment.Center),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(u.space(20))){
                channels.chunked(columns).forEachIndexed{r,group->Row(horizontalArrangement=Arrangement.spacedBy(u.space(24))){group.forEachIndexed{c,ch->
                    val i=r*columns+c;val p=players[i];val shape=u.round(18)
                    Column(Modifier.width(u.space(width)).graphicsLayer{if(index==i&&expanding){scaleX=zoom;scaleY=zoom}else if(expanding){alpha=0f}},horizontalAlignment=Alignment.CenterHorizontally){
                        Box(Modifier.fillMaxWidth().aspectRatio(16f/9f).border(u.space(3),if(index==i)Color.White else Color.Transparent,shape).padding(u.space(5)).clip(shape).background(Color.Black),contentAlignment=Alignment.Center){
                            if(p!=null)AndroidView(factory={ctx->PlayerView(ctx).apply{useController=false;player=p;isFocusable=false;isFocusableInTouchMode=false;descendantFocusability=android.view.ViewGroup.FOCUS_BLOCK_DESCENDANTS}},modifier=Modifier.fillMaxSize(),onRelease={it.player=null},update={it.player=p})
                            else if(youtubeVideoId(ch.url)!=null)NativeYoutubeEmbed(requireNotNull(youtubeVideoId(ch.url)),Modifier.fillMaxSize(),foreground&&!paused&&(i==index||channels.indexOfFirst{youtubeVideoId(it.url)!=null}==i),i!=index,{}, {})
                            else if(mosaicDirectStream(ch.url)){Artwork(safeImage(ch.coverUrl),Modifier.fillMaxSize());Copy("Selecione para reproduzir",u,20,400,lines=2,align=TextAlign.Center)}else Copy("Stream direto indisponível",u,20,400,lines=2,align=TextAlign.Center)
                        }
                        Spacer(Modifier.height(u.space(14)))
                        Box(Modifier.background(glass,u.round(12)).padding(horizontal=u.space(20),vertical=u.space(10))){Copy(ch.name+(if(index==i&&(p!=null||youtubeVideoId(ch.url)!=null))"  •  Áudio ativo" else ""),u,20,500,align=TextAlign.Center)}
                    }
                }}}
            }
            Row(u.at(100,930,1720,80),horizontalArrangement=Arrangement.Center,verticalAlignment=Alignment.CenterVertically){listOf("Home","Ouvir",if(paused)"Reproduzir" else "Pausar","Voltar").forEachIndexed{j,label->Box(Modifier.padding(horizontal=u.space(12)).border(u.space(2),if(footerFocus==j)Color.White else Color.Transparent,u.round(24)).background(glass,u.round(24)).padding(horizontal=u.space(25),vertical=u.space(15))){Copy(label,u,23,600)}}}
        }
    }
}
