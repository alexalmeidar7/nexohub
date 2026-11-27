package br.com.nexobrasil.nexoplayer.nativecore
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
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
@Composable internal fun NativeMosaic(channels:List<StationChannel>,payload:JSONObject?,foreground:Boolean,onExit:()->Unit,onSelect:(StationChannel)->Unit){
    val context=LocalContext.current
    val focus=remember{FocusRequester()}
    var index by remember(channels.map{it.id}){mutableIntStateOf(-1)}
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
    LaunchedEffect(index,players,foreground){players.forEachIndexed{i,p->p?.volume=if(i==index&&foreground)1f else 0f;p?.playWhenReady=foreground}}
    LaunchedEffect(Unit){withFrameNanos{};runCatching{focus.requestFocus()}}
    BackHandler{onExit()}
    TvViewport(Modifier.background(Color.Black)){u->
        Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(accent,androidx.compose.ui.graphics.lerp(accent,Color.Black,.55f),Color(0xFF111114)))).focusRequester(focus).onPreviewKeyEvent{e->
            if(e.type!=KeyEventType.KeyDown||channels.isEmpty())false else when(e.key){
                Key.DirectionRight,Key.DirectionDown->{index=if(index<0)0 else (index+1)%channels.size;true}
                Key.DirectionLeft,Key.DirectionUp->{index=if(index<0)channels.lastIndex else (index-1+channels.size)%channels.size;true}
                Key.DirectionCenter,Key.Enter->{channels.getOrNull(index)?.takeIf{mosaicDirectStream(it.url)}?.let(onSelect);true}
                else->false
            }
        }.focusable()){
            Copy("Mosaico",u,40,600,u.at(100,70,1720,60))
            val columns=if(channels.size<=2)channels.size.coerceAtLeast(1) else kotlin.math.ceil(kotlin.math.sqrt(channels.size.toDouble())).toInt()
            val rows=(channels.size+columns-1)/columns
            val width=minOf(820f,(1720f-(columns-1)*24f)/columns,(740f/rows-42f)*16f/9f).coerceAtLeast(110f)
            Column(Modifier.align(Alignment.Center),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(u.space(20))){
                channels.chunked(columns).forEachIndexed{r,group->Row(horizontalArrangement=Arrangement.spacedBy(u.space(24))){group.forEachIndexed{c,ch->
                    val i=r*columns+c;val p=players[i];val shape=u.round(18)
                    Column(Modifier.width(u.space(width)),horizontalAlignment=Alignment.CenterHorizontally){
                        Box(Modifier.fillMaxWidth().aspectRatio(16f/9f).border(u.space(3),if(index==i)Color.White else Color.Transparent,shape).padding(u.space(5)).clip(shape).background(Color.Black),contentAlignment=Alignment.Center){
                            if(p!=null)AndroidView(factory={ctx->PlayerView(ctx).apply{useController=false;player=p;isFocusable=false;isFocusableInTouchMode=false;descendantFocusability=android.view.ViewGroup.FOCUS_BLOCK_DESCENDANTS}},modifier=Modifier.fillMaxSize(),onRelease={it.player=null},update={it.player=p})
                            else if(mosaicDirectStream(ch.url)){Artwork(safeImage(ch.coverUrl),Modifier.fillMaxSize());Copy("Selecione para reproduzir",u,20,400,lines=2,align=TextAlign.Center)}else Copy("Stream direto indisponível",u,20,400,lines=2,align=TextAlign.Center)
                        }
                        Copy(ch.name+(if(index==i&&p!=null)"  •  Áudio ativo" else ""),u,20,500,Modifier.fillMaxWidth(),align=TextAlign.Center)
                    }
                }}}
            }
            Copy("Use as setas para ouvir um canal • OK para assistir • Voltar para sair",u,20,400,u.at(100,980,1720,42),align=TextAlign.Center)
        }
    }
}
