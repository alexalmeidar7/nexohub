package br.com.nexobrasil.nexoplayer.nativecore

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.graphics.Brush
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.focusable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.draw.clip
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.CancellationException
import org.json.JSONObject
import java.util.UUID
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter

@Composable internal fun NativeQr(value:String,modifier:Modifier,compact:Boolean=false){
    val matrix=remember(value,compact){if(compact)QRCodeWriter().encode(value,BarcodeFormat.QR_CODE,1,1,mapOf(com.google.zxing.EncodeHintType.MARGIN to 4,com.google.zxing.EncodeHintType.ERROR_CORRECTION to com.google.zxing.qrcode.decoder.ErrorCorrectionLevel.M))else QRCodeWriter().encode(value,BarcodeFormat.QR_CODE,256,256)}
    Canvas(modifier.background(Color.White)){
        val cell=minOf(size.width,size.height)/matrix.width
        for(y in 0 until matrix.height)for(x in 0 until matrix.width)if(matrix[x,y])drawRect(Color.Black,Offset(x*cell,y*cell),Size(cell,cell))
    }
}
@Composable internal fun NativePairPanel(u:TvUnits,services:NativeServices,onClose:()->Unit,onAccount:(JSONObject)->Unit){
    var attempt by remember{mutableIntStateOf(0)}
    var pair by remember{mutableStateOf<NativeServices.Pair?>(null)}
    var message by remember{mutableStateOf("Gerando código seguro...")}
    var remaining by remember{mutableIntStateOf(0)}
    val focus=remember{FocusRequester()}
    LaunchedEffect(attempt){
        pair=null;message="Gerando código seguro..."
        try{
            val p=services.newPair();pair=p;message="Escaneie o QR Code e entre com sua conta Google."
            val deadline=java.time.Instant.parse(p.expires).toEpochMilli()
            while(System.currentTimeMillis()<deadline){
                remaining=((deadline-System.currentTimeMillis())/1000).toInt().coerceAtLeast(0)
                val account=services.pollPair(p)
                if(account!=null){onAccount(account);return@LaunchedEffect}
                delay(2000)
            }
            message="Código expirado. Gere outro."
        }catch(e:CancellationException){throw e}catch(e:Exception){android.util.Log.w("NexoPair",e.javaClass.simpleName);message="Não foi possível conectar. "+(e.message?.takeIf{it.startsWith("Pareamento: ")||it.startsWith("House Mix request failed")}?: "Gere outro código.")}
    }
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha=.64f)),contentAlignment=Alignment.Center){
        Column(Modifier.width(u.space(540)).background(glass,u.round(28)).padding(u.space(24)),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(u.space(15))){
            Box(Modifier.fillMaxWidth().height(u.space(70)),contentAlignment=Alignment.Center){Copy("Conectar minha conta Google",u,27,600,Modifier.fillMaxWidth().padding(horizontal=u.space(52)),lines=2,align=TextAlign.Center);GlassButton(u,"",Modifier.align(Alignment.CenterEnd).size(u.space(44)).focusRequester(focus),icon="left",onClick=onClose)}
            pair?.let{NativeQr("https://housemix.nexobrasil.net/"+BuildConfig.STATION_SLUG+"/pair?code="+it.code,Modifier.size(u.space(310)));Copy(it.displayCode,u,48,700);Copy("Validade: "+remaining/60+":"+("%02d".format(remaining%60)),u,20)}
            Copy(message,u,22,400,lines=3,align=TextAlign.Center)
            GlassButton(u,"Novo código",Modifier.height(u.space(60))){attempt++}
        }
    }
    LaunchedEffect(Unit){focus.requestFocus()}
}
@Composable internal fun NativeLike(u:TvUnits,services:NativeServices,account:JSONObject?,owner:String,title:String,artist:String,cover:String,modifier:Modifier,buttonModifier:Modifier=Modifier,videoStyle:Boolean=false,enabled:Boolean=true){
    val user=account.str("id")
    var liked by remember(user,title,artist){mutableStateOf(false)}
    var busy by remember(user,title,artist){mutableStateOf(false)}
    var msg by remember(user,title,artist){mutableStateOf("")}
    val scope=rememberCoroutineScope()
    LaunchedEffect(user,title,artist){if(user.isNotBlank())try{liked=services.liked(owner,user,title,artist)}catch(e:CancellationException){throw e}catch(_:Exception){}}
    var focused by remember{mutableStateOf(false)}
    val controlsEnabled=LocalControlsEnabled.current
    val active=controlsEnabled&&enabled&&!busy&&owner.isNotBlank()&&title!="Ao vivo"&&title.isNotBlank()
    if(videoStyle){
        Row(modifier.then(buttonModifier).onFocusChanged{focused=it.isFocused}.focusProperties{canFocus=controlsEnabled&&enabled}.clip(u.round(20)).background(glass).border(u.space(if(focused)3 else 0),if(focused)Color.White else Color.Transparent,u.round(20)).clickable(enabled=active){if(user.isBlank())msg="Conecte sua conta Google." else{busy=true;scope.launch{try{liked=services.toggleLike(owner,user,title,artist,cover);msg=""}catch(e:CancellationException){throw e}catch(_:Exception){msg="Não foi possível salvar."}finally{busy=false}}}}.padding(u.space(12)),verticalAlignment=Alignment.CenterVertically){
            Artwork(safeImage(cover),Modifier.size(u.space(144)).clip(u.round(22)),scale=ContentScale.Crop)
            Spacer(Modifier.width(u.space(18)));Column(Modifier.weight(1f)){Copy("tocando",u,18,700);Copy(title,u,40,700);Copy(artist,u,29);if(msg.isNotBlank())Copy(msg,u,17)};Spacer(Modifier.width(u.space(14)));FlatHeart(liked,Modifier.size(u.space(38)));Spacer(Modifier.width(u.space(14)))
        };return
    }
    Box(modifier.then(buttonModifier).onFocusChanged{focused=it.isFocused}.focusProperties{canFocus=controlsEnabled&&enabled}
        .clip(u.round(36)).background(glass).border(u.space(if(focused)4 else 3),Color.White.copy(alpha=if(focused)1f else .27f),u.round(36))
        .clickable(enabled=active){
            if(user.isBlank())msg="Conecte sua conta Google." else {busy=true;scope.launch{
                try{liked=services.toggleLike(owner,user,title,artist,cover);msg=""}catch(e:CancellationException){throw e}catch(_:Exception){msg="Não foi possível salvar."}finally{busy=false}
            }}
        }.semantics{contentDescription=if(liked)"Remover curtida" else "Curtir música"},contentAlignment=Alignment.Center){
        Crossfade(cover,modifier=Modifier.fillMaxSize(),animationSpec=tween(350),label="audioCover"){url->
            Box(Modifier.fillMaxSize(),contentAlignment=Alignment.Center){if(url.isNotBlank())Artwork(safeImage(url),Modifier.fillMaxSize(),scale=ContentScale.Crop)else Symbol("music",Modifier.size(u.space(100)))}
        }
        Box(Modifier.size(u.space(70)).background(Color.Black.copy(alpha=.48f),CircleShape),contentAlignment=Alignment.Center){FlatHeart(liked,Modifier.size(u.space(40)))}
        if(msg.isNotBlank())Copy(msg,u,18,500,Modifier.align(Alignment.BottomCenter).background(Color.Black.copy(alpha=.7f),u.round(10)).padding(u.space(10)),lines=2)
    }
}
@Composable internal fun NativeCommunity(u:TvUnits,panel:String,owner:String,services:NativeServices,account:JSONObject?,chatAds:List<JSONObject> = emptyList(),accent:Color=Color.White,emptyFocus:FocusRequester=remember{FocusRequester()}){
    val scope=rememberCoroutineScope()
    val focus=remember{FocusRequester()}
    var msg by remember(panel){mutableStateOf("Carregando...")}
    var row by remember(panel){mutableStateOf<JSONObject?>(null)}
    var voted by remember(panel){mutableIntStateOf(-1)}
    var editing by remember(panel){mutableStateOf(false)}
    var busy by remember(panel){mutableStateOf(false)}
    var counts by remember(panel){mutableStateOf<org.json.JSONArray?>(null)}
    var messages by remember(panel){mutableStateOf<List<JSONObject>>(emptyList())}
    var qr by remember(panel){mutableStateOf(false)}
    val context=LocalContext.current
    val device=remember{val prefs=context.getSharedPreferences("native_tv_settings",0);prefs.getString("chat_device",null)?:UUID.randomUUID().toString().also{prefs.edit().putString("chat_device",it).apply()}}
    LaunchedEffect(panel,owner,account.str("id")){
        while(true){
            try{
                when(panel){
                    "poll"->{val p=services.polls(owner).firstOrNull();row=p
                        if(p!=null){if(account!=null&&!busy)voted=(services.rpc("get_player_poll_vote",JSONObject().put("p_poll_id",p.str("id")),true) as? Number)?.toInt()?:-1
                            counts=(services.rpc("get_player_poll_results",JSONObject().put("p_poll_id",p.str("id"))) as? JSONObject)?.optJSONArray("counts")}
                        msg=if(p==null)"Opa, a gente não tem nenhuma enquete agora, volte depois." else ""}
                    "battle"->{val b=services.rpc("nexo_tv_active_battle_v24",JSONObject().put("p_radio_id",owner)) as? JSONObject;row=b?.takeIf{it.str("id").isNotBlank()};if(!busy)voted=row?.optInt("my_vote",-1)?:-1;msg=if(row==null)"Opa, a gente não tem nenhuma batalha musical agora, volte depois." else ""}
                    "chat"->{messages=services.chat(owner);msg=if(messages.isEmpty())"Aguardando mensagens dos ouvintes." else ""}
                }
            }catch(e:CancellationException){throw e}catch(_:Exception){msg="Não foi possível carregar. Tentando novamente."}
            delay(if(panel=="chat")5000 else 15000)
        }
    }
    Column(Modifier.fillMaxSize(),horizontalAlignment=Alignment.CenterHorizontally){
    if(panel=="chat"){
        val listState=rememberLazyListState();val qrBack=remember{FocusRequester()}
        val chatRows=remember(messages,chatAds){nativeChatRows(messages,chatAds)}
        var chatHint by remember{mutableStateOf(false)}
        LaunchedEffect(messages.lastOrNull()?.str("id"),chatRows.size){if(chatRows.isNotEmpty())listState.animateScrollToItem(chatRows.lastIndex)}
        LaunchedEffect(qr){withFrameNanos{};runCatching{(if(qr)qrBack else focus).requestFocus()}}
        BackHandler(qr){qr=false}
        Copy("Chat",u,28,600)
        Box(Modifier.fillMaxWidth().weight(1f).background(Color.Black.copy(alpha=.20f),u.round(16))){
            LazyColumn(Modifier.fillMaxSize().padding(u.space(10)),state=listState,verticalArrangement=Arrangement.spacedBy(u.space(10))){
                itemsIndexed(chatRows,key={index,row->row.key}){_,entry->val m=entry.media;if(entry.ad)NativeInteractionBanner(u,m,interactive=false)else Column(Modifier.fillMaxWidth().background(Color.White.copy(alpha=.08f),u.round(12)).padding(u.space(8))){Copy(m.str("nome"),u,19,600);Copy(m.str("message"),u,19,400,lines=5)}}
            }
            if(qr)Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha=.58f),u.round(16)),contentAlignment=Alignment.Center){
                Column(horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(u.space(24))){
                    NativeQr("https://housemix.nexobrasil.net/"+BuildConfig.STATION_SLUG+"/pair?mode=chat&radio="+owner,Modifier.size(u.space(225)).clip(u.round(14)),compact=true)
                    GlassButton(u,"",Modifier.size(u.space(54)).focusRequester(qrBack),icon="left"){qr=false}
                }
            }
        }
        Spacer(Modifier.height(u.space(12)))
        if(!qr){if(chatHint&&account!=null)Copy("Digite sua mensagem no chat da sua área no celular.",u,20,400,lines=3,align=TextAlign.Center);GlassButton(u,"entrar na conversa",Modifier.height(u.space(60)).focusRequester(focus)){if(account!=null)chatHint=!chatHint else qr=true}}
    }else{
        val poll=panel=="poll"
        Copy(if(poll)"Enquete" else "Batalha musical",u,28,600)
        Spacer(Modifier.height(u.space(12)))
        val item=row
        if(item!=null){
            Column(Modifier.weight(1f,fill=false).fillMaxWidth().verticalScroll(rememberScrollState()),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(u.space(10))){
            if(poll)Copy(item.str("pergunta"),u,24,600,lines=3) else Copy("Quem merece ganhar essa batalha?",u,20,500,lines=2,align=TextAlign.Center)
            val answers=if(poll)(1..4).map{item.str("resposta"+it)}.filter{it.isNotBlank()} else (1..2).map{item.str("artista"+it+"_musica")+" — "+item.str("artista"+it+"_nome")}
            fun submit(choice:Int){
                        if(account==null){msg="Conecte sua conta Google para votar."}
                        else{busy=true;scope.launch{
                            try{
                                val args=JSONObject().put(if(poll)"p_poll_id" else "p_battle_id",item.str("id")).put(if(poll)"p_answer_index" else "p_choice",choice)
                                val r=services.rpc(if(poll)"submit_player_poll_vote" else "nexo_tv_vote_battle_v24",args,true) as? JSONObject
                                check(r?.optBoolean("ok")==true);if(poll)check(r.optInt("answer_index",-1)==choice)
                                voted=choice;editing=false;msg="Voto registrado."
                                if(poll)counts=(services.rpc("get_player_poll_results",JSONObject().put("p_poll_id",item.str("id"))) as? JSONObject)?.optJSONArray("counts") else if(r.has("p1")&&r.has("p2"))row=JSONObject(item.toString()).put("artista1_porcentagem",r.optDouble("p1")).put("artista2_porcentagem",r.optDouble("p2"))
                            }catch(e:CancellationException){throw e}catch(_:Exception){msg="Não foi possível registrar o voto."}finally{busy=false}
                        }}
            }
            Column(Modifier.fillMaxWidth(),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(u.space(10))){
                if(poll)answers.forEachIndexed{i,answer->
                    val result=counts?.optInt(i)?.let{" · "+it+" votos"}.orEmpty()
                    GlassButton(u,(if(voted==i)"✓ " else "")+answer+result,Modifier.fillMaxWidth().height(u.space(66)).then(if(i==0&&(voted<0||editing))Modifier.focusRequester(focus)else Modifier),enabled=!busy&&(voted<0||editing)){submit(i)}
                }else Column(Modifier.fillMaxWidth(),verticalArrangement=Arrangement.spacedBy(u.space(12))){
                    (1..2).forEach{choice->
                        var focused by remember{mutableStateOf(false)}
                        val enabled=!busy&&(voted<0||editing);val shape=u.round(24)
                        Box(Modifier.fillMaxWidth().height(u.space(155)).then(if(choice==1&&enabled)Modifier.focusRequester(focus)else Modifier).onFocusChanged{focused=it.isFocused}.focusProperties{canFocus=enabled}.border(u.space(if(focused)4 else if(voted==choice)2 else 0),if(focused||voted==choice)Color.White else Color.Transparent,shape).clip(shape).background(Color(0xFF242529)).clickable(enabled=enabled){submit(choice)}){
                            Row(Modifier.fillMaxSize().padding(u.space(10)),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(u.space(14))){
                                Artwork(safeImage(item.str("artista"+choice+"_imagem")),Modifier.size(u.space(132)).clip(u.round(15)),scale=ContentScale.Crop)
                                Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(u.space(6))){
                                    Copy(item.str("artista"+choice+"_musica"),u,22,700,lines=2)
                                    Copy(item.str("artista"+choice+"_nome"),u,19,500,lines=2)
                                    val percent=item.optDouble("artista"+choice+"_porcentagem",Double.NaN)
                                    if(percent.isFinite()){val pct=percent.coerceIn(0.0,100.0);Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(u.space(8))){Box(Modifier.weight(1f).height(u.space(6)).clip(CircleShape).background(Color.White.copy(alpha=.16f))){Box(Modifier.fillMaxWidth((pct/100).toFloat()).fillMaxHeight().background(accent))};Copy(pct.toInt().toString()+"%",u,18,600)}}
                                    if(voted==choice)Copy("Seu voto",u,15,500)
                                }
                            }
                        }
                    }
                }
                if(voted>=0&&!editing)GlassButton(u,"Mudar meu voto",Modifier.height(u.space(60)).focusRequester(focus)){editing=true}
            }
            }
        }else if(msg.startsWith("Opa,")){
            Box(Modifier.weight(1f).fillMaxWidth(),contentAlignment=Alignment.Center){Column(Modifier.padding(horizontal=u.space(25)),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(u.space(22))){Box(Modifier.size(u.space(104)).clip(CircleShape).background(Color.White.copy(alpha=.10f)),contentAlignment=Alignment.Center){Symbol(if(poll)"poll" else "battle",Modifier.size(u.space(64)))};Copy(msg,u,24,400,lines=4,align=TextAlign.Center)}}
        }else if(msg.startsWith("Carregando")){Box(Modifier.weight(1f).fillMaxWidth(),contentAlignment=Alignment.Center){NativeSpinner(u,Modifier.size(u.space(48)))}}
    }
    if(msg.isNotBlank()&&!msg.startsWith("Opa,")&&!(panel!="chat"&&msg.startsWith("Carregando")))Copy(msg,u,19,400,lines=3)
    }
    LaunchedEffect(row!=null,editing,voted>=0,panel){if(panel!="chat"){withFrameNanos{};runCatching{(if(row==null)emptyFocus else focus).requestFocus()}}}
}

@Composable private fun FlatHeart(liked:Boolean,modifier:Modifier){Canvas(modifier){val w=size.width;val h=size.height;val heart=Path().apply{moveTo(w*.50f,h*.86f);cubicTo(w*.41f,h*.79f,w*.10f,h*.57f,w*.10f,h*.34f);cubicTo(w*.10f,h*.10f,w*.36f,h*.06f,w*.50f,h*.27f);cubicTo(w*.64f,h*.06f,w*.90f,h*.10f,w*.90f,h*.34f);cubicTo(w*.90f,h*.57f,w*.59f,h*.79f,w*.50f,h*.86f);close()};if(liked)drawPath(heart,Color(0xFFF20D0F))else drawPath(heart,Color.White,style=Stroke(w*.065f,join=StrokeJoin.Round))}}

internal data class NativeChatRow(val key:String,val media:JSONObject,val ad:Boolean)
internal fun nativeChatRows(messages:List<JSONObject>,ads:List<JSONObject>):List<NativeChatRow> = buildList{
    messages.forEachIndexed{index,m->val key=m.str("id").ifBlank{"message-$index"};add(NativeChatRow("message:$key",m,false));if((index+1)%8==0&&ads.isNotEmpty()&&index<messages.lastIndex){val a=ads[((index+1)/8-1)%ads.size];add(NativeChatRow("ad:$key",a,true))}}
}
