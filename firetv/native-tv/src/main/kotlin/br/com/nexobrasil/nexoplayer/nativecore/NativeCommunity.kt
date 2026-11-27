package br.com.nexobrasil.nexoplayer.nativecore

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.layout.ContentScale
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.CancellationException
import org.json.JSONObject
import java.util.UUID
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter

@Composable internal fun NativeQr(value:String,modifier:Modifier){
    val matrix=remember(value){QRCodeWriter().encode(value,BarcodeFormat.QR_CODE,256,256)}
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
        }catch(e:CancellationException){throw e}catch(_:Exception){message="Não foi possível conectar. Gere outro código."}
    }
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha=.64f)),contentAlignment=Alignment.Center){
        Column(Modifier.width(u.space(760)).background(glass,u.round(28)).padding(u.space(28)),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(u.space(15))){
            Copy("Conectar minha conta Google",u,30,600)
            pair?.let{NativeQr("https://housemix.nexobrasil.net/"+BuildConfig.STATION_SLUG+"/pair?code="+it.code,Modifier.size(u.space(310)));Copy(it.code,u,48,700);Copy("Validade: "+remaining/60+":"+("%02d".format(remaining%60)),u,20)}
            Copy(message,u,22,400,lines=3)
            Row(horizontalArrangement=Arrangement.spacedBy(u.space(14))){GlassButton(u,"Voltar",Modifier.height(u.space(60)).focusRequester(focus),onClick=onClose);GlassButton(u,"Novo código",Modifier.height(u.space(60))){attempt++}}
        }
    }
    LaunchedEffect(Unit){focus.requestFocus()}
}
@Composable internal fun NativeLike(u:TvUnits,services:NativeServices,account:JSONObject?,owner:String,title:String,artist:String,cover:String,modifier:Modifier){
    val user=account.str("id")
    var liked by remember(user,title,artist){mutableStateOf(false)}
    var busy by remember(user,title,artist){mutableStateOf(false)}
    var msg by remember(user,title,artist){mutableStateOf("")}
    val scope=rememberCoroutineScope()
    LaunchedEffect(user,title,artist){if(user.isNotBlank())try{liked=services.liked(owner,user,title,artist)}catch(e:CancellationException){throw e}catch(_:Exception){}}
    Column(modifier,horizontalAlignment=Alignment.End){
        if(msg.isNotBlank())Copy(msg,u,15,400,lines=2)
        GlassButton(u,if(liked)"♥" else "♡",Modifier.size(u.space(58)),enabled=!busy){
            if(user.isBlank())msg="Conecte sua conta Google." else {busy=true;scope.launch{
                try{liked=services.toggleLike(owner,user,title,artist,cover);msg=""}catch(e:CancellationException){throw e}catch(_:Exception){msg="Não foi possível salvar."}finally{busy=false}
            }}
        }
    }
}
@Composable internal fun NativeCommunity(u:TvUnits,panel:String,owner:String,services:NativeServices,account:JSONObject?){
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
                        msg=if(p==null)"Nenhuma enquete disponível." else ""}
                    "battle"->{val b=services.rpc("nexo_tv_active_battle_v24",JSONObject().put("p_radio_id",owner)) as? JSONObject;row=b?.takeIf{it.str("id").isNotBlank()};if(!busy)voted=row?.optInt("my_vote",-1)?:-1;msg=if(row==null)"Nenhuma batalha disponível." else ""}
                    "chat"->{messages=services.chat(owner);msg=if(messages.isEmpty())"Aguardando mensagens dos ouvintes." else ""}
                }
            }catch(e:CancellationException){throw e}catch(_:Exception){msg="Não foi possível carregar. Tentando novamente."}
            delay(if(panel=="chat")5000 else 15000)
        }
    }
    if(panel=="chat"){
        Copy("Chat",u,28,600)
        GlassButton(u,if(qr)"Ver mensagens" else "entrar na conversa",Modifier.height(u.space(60)).focusRequester(focus)){qr=!qr}
        if(qr)NativeQr("https://housemix.nexobrasil.net/"+BuildConfig.STATION_SLUG+"/pair?mode=chat&radio="+owner+"&tv="+device,Modifier.size(u.space(310)))
        else LazyColumn(Modifier.fillMaxWidth().heightIn(max=u.space(480)),verticalArrangement=Arrangement.spacedBy(u.space(10))){items(messages){m->Column(Modifier.fillMaxWidth().background(Color.White.copy(alpha=.08f),u.round(12)).padding(u.space(8))){Copy(m.str("nome"),u,19,600);Copy(m.str("message"),u,19,400,lines=5)}}}
    }else{
        val poll=panel=="poll"
        Copy(if(poll)"Enquete" else "Batalha musical",u,28,600)
        val item=row
        if(item!=null){
            Copy(if(poll)item.str("pergunta") else "Quem merece ganhar essa batalha?",u,25,600,lines=3)
            val answers=if(poll)(1..4).map{item.str("resposta"+it)}.filter{it.isNotBlank()} else (1..2).map{item.str("artista"+it+"_musica")+" — "+item.str("artista"+it+"_nome")}
            Column(Modifier.fillMaxWidth(),verticalArrangement=Arrangement.spacedBy(u.space(12))){
                answers.forEachIndexed{i,answer->
                    val choice=if(poll)i else i+1
                    val result=if(poll)counts?.optInt(i)?.let{" · "+it+" votos"}.orEmpty() else " · "+item.optInt("artista"+choice+"_porcentagem")+"%"
                    GlassButton(u,(if(voted==choice)"✓ " else "")+answer+result,Modifier.fillMaxWidth().height(u.space(83)).then(if(i==0&&(voted<0||editing))Modifier.focusRequester(focus)else Modifier),enabled=!busy&&(voted<0||editing)){
                        if(account==null){msg="Conecte sua conta Google para votar."}
                        else{busy=true;scope.launch{
                            try{
                                val args=JSONObject().put(if(poll)"p_poll_id" else "p_battle_id",item.str("id")).put(if(poll)"p_answer_index" else "p_choice",choice)
                                val r=services.rpc(if(poll)"submit_player_poll_vote" else "nexo_tv_vote_battle_v24",args,true) as? JSONObject
                                check(r?.optBoolean("ok")==true);if(poll)check(r.optInt("answer_index",-1)==choice)
                                voted=choice;editing=false;msg="Voto registrado."
                                if(poll)counts=(services.rpc("get_player_poll_results",JSONObject().put("p_poll_id",item.str("id"))) as? JSONObject)?.optJSONArray("counts")
                            }catch(e:CancellationException){throw e}catch(_:Exception){msg="Não foi possível registrar o voto."}finally{busy=false}
                        }}
                    }
                }
                if(voted>=0&&!editing)GlassButton(u,"Mudar meu voto",Modifier.height(u.space(60)).focusRequester(focus)){editing=true}
            }
        }
    }
    if(msg.isNotBlank())Copy(msg,u,19,400,lines=3)
    LaunchedEffect(row!=null,editing,voted>=0,panel){runCatching{focus.requestFocus()}}
}
