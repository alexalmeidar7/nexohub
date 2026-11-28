package br.com.nexobrasil.nexoplayer.nativecore

import androidx.compose.runtime.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.background
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONObject

@Composable internal fun NativeFriends(u:TvUnits,services:NativeServices,owner:String?,profile:String){
    if(owner.isNullOrBlank()||profile.isBlank()){Copy("Complete seu cadastro no celular para adicionar amigos.",u,24);return}
    var rows by remember(owner,profile){mutableStateOf<List<JSONObject>>(emptyList())}
    var nudges by remember(owner,profile){mutableStateOf<List<JSONObject>>(emptyList())}
    var loading by remember{mutableStateOf(true)}
    var message by remember{mutableStateOf("")}
    var busy by remember{mutableStateOf(false)}
    val scope=rememberCoroutineScope()
    suspend fun refresh(){rows=services.friends(owner,profile);nudges=services.receivedNudges(owner,profile)}
    LaunchedEffect(owner,profile){try{refresh()}catch(e:CancellationException){throw e}catch(_:Exception){message="Não foi possível carregar os amigos."}finally{loading=false}}
    fun act(action:suspend ()->Unit,success:String){if(busy)return;busy=true;scope.launch{try{action();refresh();message=success}catch(e:CancellationException){throw e}catch(_:Exception){message="Não foi possível concluir. Tente novamente."}finally{busy=false}}}
    if(loading)Copy("Carregando amigos…",u,24)else if(rows.isEmpty())Copy("Nenhum amigo ainda. Adicione ouvintes pelo chat no celular.",u,24)
    rows.forEach{row->
        val incoming=row.str("recipient_id")==profile
        val other=if(incoming)row.str("requester_id")else row.str("recipient_id")
        val name=if(incoming)row.str("requester_name")else row.str("recipient_name")
        val accepted=row.str("status")=="accepted"
        Row(Modifier.fillMaxWidth().background(glass,u.round(12)).padding(u.space(14)),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(u.space(12))){
            Column(Modifier.weight(1f)){Copy(name.ifBlank{"Ouvinte"},u,24,600);Copy(if(accepted)"Amigo" else if(incoming)"Solicitação recebida" else "Aguardando aceitação",u,18)}
            if(accepted)GlassButton(u,"Chamar atenção",Modifier.height(u.space(46)),enabled=!busy){act({services.nudge(owner,profile,other)},"Atenção enviada!")}
            if(!accepted&&incoming)GlassButton(u,"Aceitar",Modifier.height(u.space(46)),enabled=!busy){act({services.changeFriend(owner,row.str("id"),true)},"Amizade aceita.")}
            GlassButton(u,if(accepted)"Desfazer" else "Remover",Modifier.height(u.space(46)),enabled=!busy){act({services.changeFriend(owner,row.str("id"),false)},"Amizade ou solicitação removida.")}
        }
    }
    nudges.forEach{event->val friend=rows.firstOrNull{it.str("requester_id")==event.str("sender_id")||it.str("recipient_id")==event.str("sender_id")};val name=if(friend?.str("requester_id")==event.str("sender_id"))friend.str("requester_name")else friend.str("recipient_name")
        Row(Modifier.fillMaxWidth().background(glass,u.round(12)).padding(u.space(12)),verticalAlignment=Alignment.CenterVertically){Copy((name.ifBlank{"Um amigo"})+" chamou sua atenção!",u,23,500,Modifier.weight(1f));GlassButton(u,"Visto",Modifier.height(u.space(46)),enabled=!busy){act({services.markNudge(owner,event.str("id"))},"Interação lida.")}}
    }
    if(message.isNotBlank())Copy(message,u,20)
}
