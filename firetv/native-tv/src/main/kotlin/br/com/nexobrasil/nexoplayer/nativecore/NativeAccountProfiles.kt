package br.com.nexobrasil.nexoplayer.nativecore

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import coil.compose.AsyncImage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONObject
import org.json.JSONArray
import java.util.UUID

private fun googleIdentity(account:JSONObject?)=account.rows("identities").firstOrNull{it.str("provider")=="google"}?.optJSONObject("identity_data")
internal fun nativeGooglePhoto(account:JSONObject?):String{
    val identity=googleIdentity(account);val meta=account?.optJSONObject("user_metadata")
    return listOf(identity.str("avatar_url"),identity.str("picture"),meta.str("avatar_url"),meta.str("picture")).firstOrNull{safeImage(it)!=null}.orEmpty()
}
internal fun nativeGoogleName(account:JSONObject?):String{
    val identity=googleIdentity(account);val meta=account?.optJSONObject("user_metadata")
    return listOf(identity.str("full_name"),identity.str("name"),meta.str("full_name"),meta.str("name"),account.str("email").substringBefore("@")).firstOrNull{it.isNotBlank()}.orEmpty()
}
private val profileAvatars=listOf(R.drawable.visitor_avatar,R.drawable.visitor_avatar_1,R.drawable.visitor_avatar_2,R.drawable.visitor_avatar_3,R.drawable.visitor_avatar_4,R.drawable.visitor_avatar_5,R.drawable.visitor_avatar_6,R.drawable.visitor_avatar_7,R.drawable.visitor_avatar_8)
private val profileAvatarPaths=listOf("/avatars/usr-default.png")+(1..8).map{"/avatars/usr-$it.png"}
internal fun nativeProfileAvatar(url:String):Any{
    val i=profileAvatarPaths.indexOf(url);return if(i>=0)profileAvatars[i] else safeImage(url)?:R.drawable.visitor_avatar
}
@Composable internal fun NativeAvatarImage(model:Any,modifier:Modifier){
    var failed by remember(model){mutableStateOf(false)}
    AsyncImage(if(failed)R.drawable.visitor_avatar else model,null,modifier,contentScale=ContentScale.Crop,onError={failed=true})
}
@Composable private fun AccountCircle(u:TvUnits,model:Any?,label:String,modifier:Modifier=Modifier,onClick:()->Unit){
    var focused by remember{mutableStateOf(false)}
    val active=LocalControlsEnabled.current
    val interaction=remember{MutableInteractionSource()};val hovered by interaction.collectIsHoveredAsState()
    val ring by animateFloatAsState(if(active&&(focused||hovered))1f else 0f,tween(180),label="profileRing")
    Box(modifier.size(u.space(164)).onFocusChanged{focused=it.isFocused}.hoverable(interaction,enabled=active).border(u.space(3),Color.White.copy(alpha=ring),CircleShape).clip(CircleShape).clickable(enabled=active,onClick=onClick).semantics{contentDescription=label}.padding(u.space(7)),contentAlignment=Alignment.Center){
        Box(Modifier.fillMaxSize().clip(CircleShape).background(glass),contentAlignment=Alignment.Center){
            if(model==null)Symbol("plus",Modifier.size(u.space(64)))else NativeAvatarImage(model,Modifier.fillMaxSize())
        }
    }
}
@Composable internal fun NativeAuthenticatedProfiles(u:TvUnits,logo:String?,accent:Color,focus:FocusRequester,mainName:String,mainAvatar:Any,profile:JSONObject?,owner:String?,account:JSONObject,services:NativeServices,onProfile:(JSONObject)->Unit,onSelect:(String)->Unit,onContinue:()->Unit,onLogout:()->Unit,leaving:Boolean=false){
    var mode by remember{mutableStateOf("select")}
    var editId by remember{mutableStateOf("")}
    var name by remember{mutableStateOf("")}
    var avatar by remember{mutableStateOf("/avatars/usr-default.png")}
    var busy by remember{mutableStateOf(false)}
    var message by remember{mutableStateOf("")}
    var mobileQr by remember{mutableStateOf(false)}
    val mobileFocus=remember{FocusRequester()}
    var confirmLogout by remember{mutableStateOf(false)}
    var confirmDelete by remember{mutableStateOf(false)}
    var showLikes by remember{mutableStateOf(false)}
    var accountTab by remember{mutableStateOf("Início")}
    var avatarPicker by remember{mutableStateOf(false)}
    var accountLikes by remember{mutableStateOf<List<JSONObject>>(emptyList())}
    var likesStatus by remember{mutableStateOf("")}
    LaunchedEffect(showLikes,mode,owner,account.str("id")){if(showLikes&&mode=="main"&&owner!=null){likesStatus="Carregando…";try{accountLikes=services.listAccountLikes(owner,account.str("id"));likesStatus=if(accountLikes.isEmpty())"Nenhuma música curtida." else ""}catch(e:CancellationException){throw e}catch(_:Exception){likesStatus="Não foi possível consultar as curtidas."}}}
    val scope=rememberCoroutineScope();val editFocus=remember{FocusRequester()};val cancelFocus=remember{FocusRequester()}
    val user=account.str("id");val subs=profile.rows("sub_profiles")
    val myStation=when(BuildConfig.STATION_SLUG){"positivafm"->"Minha Positiva";"interativafm"->"Minha Interativa";else->"Minha "+BuildConfig.STATION_NAME}
    val enabled=owner!=null&&user.isNotBlank()
    fun openEditor(target:JSONObject?=null,add:Boolean=false){showLikes=false;accountTab="Início";avatarPicker=false;accountLikes=emptyList();editId=target.str("id");name=if(add)"" else target.str("name").ifBlank{mainName};avatar=(if(target==null&&!add)profile.str("avatar_url").ifBlank{nativeGooglePhoto(account)}else target.str("avatar_url")).ifBlank{"/avatars/usr-default.png"};mode=if(add)"add" else if(target==null)"main" else "sub";message=""}
    fun mutate(remove:Boolean=false){
        if(!enabled||busy||(!remove&&name.isBlank()))return
        val radio=owner?:return;val clean=name.trim();val currentMode=mode;val id=editId;val chosen=avatar
        busy=true;message="";scope.launch{
            try{
                val updated=services.updateListenerProfile(radio,user){before->
                    if(currentMode=="main")JSONObject().put("avatar_url",chosen)
                    else{
                        val list=before.rows("sub_profiles")
                        val next=when{
                            currentMode=="add"->list+JSONObject().put("id",UUID.randomUUID().toString()).put("name",clean).put("avatar_url",chosen)
                            remove->list.filterNot{it.str("id")==id}
                            else->{check(list.any{it.str("id")==id}){"Perfil não encontrado."};list.map{if(it.str("id")==id)JSONObject(it.toString()).put("name",clean).put("avatar_url",chosen)else it}}
                        }
                        JSONObject().put("sub_profiles",JSONArray(next))
                    }
                }
                onProfile(updated);if(remove)onSelect("");if(currentMode=="add"||remove)mode="select";avatarPicker=false;confirmDelete=false
            }catch(e:CancellationException){throw e}catch(e:Exception){message=e.message?:"Não foi possível salvar o perfil.";confirmDelete=false}finally{busy=false}
        }
    }
    BackHandler(mode!="select"||confirmLogout||confirmDelete||mobileQr){if(!busy){when{mobileQr->mobileQr=false;avatarPicker->avatarPicker=false;confirmLogout->confirmLogout=false;confirmDelete->confirmDelete=false;else->mode="select"}}}
    LaunchedEffect(mode,confirmLogout,confirmDelete){withFrameNanos{};runCatching{(if(confirmLogout||confirmDelete)cancelFocus else if(mode=="select")focus else editFocus).requestFocus()}}
    val enter=remember{Animatable(0f)};LaunchedEffect(mode){enter.snapTo(0f);enter.animateTo(1f,tween(420))}
    Box(Modifier.fillMaxSize().background(Brush.linearGradient(if(BuildConfig.STATION_SLUG=="positivafm")listOf(Color(0xFFDF1B22),Color(0xFF8D1E23),Color(0xFF111114))else listOf(accent,androidx.compose.ui.graphics.lerp(accent,Color.Black,.43f),Color(0xFF111114))))){
        Artwork(logo?:if(BuildConfig.STATION_SLUG=="positivafm")R.drawable.splash_positiva else R.drawable.splash_interativa,u.at(100,64,100,90))
        Copy(if(mode=="select")"Escolha seu perfil ou crie um novo" else if(mode=="add")"Criar novo perfil" else myStation,u,30,300,u.at(245,94,1450,60))
        if(mode=="select"){
            CompositionLocalProvider(LocalControlsEnabled provides (!confirmLogout&&!confirmDelete&&!mobileQr)){
                Column(u.at(180,275,1100,705).verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(u.space(20))){
                    Row(profileEntrance(u,0,leaving),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(u.space(24))){
                        AccountCircle(u,mainAvatar,"Entrar no perfil $mainName",Modifier.focusRequester(focus)){onSelect("");onContinue()}
                        Column(verticalArrangement=Arrangement.spacedBy(u.space(8))){
                            Copy(mainName,u,29,600,lines=2)
                            Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(u.space(12))){
                                Box(Modifier.background(Color.White.copy(alpha=.15f),CircleShape).padding(horizontal=u.space(14),vertical=u.space(5))){Copy("Conta Google",u,18)}
                                GlassButton(u,"★  "+myStation,Modifier.height(u.space(44)),enabled=enabled){openEditor()}
                                GlassButton(u,"Acessar no celular",Modifier.height(u.space(44)),enabled=enabled){mobileQr=true}
                                // Logout is inside Minha Rádio.
                            }
                        }
                    }
                    subs.forEachIndexed{index,sub->key(sub.str("id")){
                        Row(profileEntrance(u,index+1,leaving),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(u.space(24))){
                            AccountCircle(u,nativeProfileAvatar(sub.str("avatar_url")),"Entrar no perfil "+sub.str("name")){onSelect(sub.str("id"));onContinue()}
                            Column(verticalArrangement=Arrangement.spacedBy(u.space(8))){Copy(sub.str("name"),u,29,600);GlassButton(u,"★  "+myStation,Modifier.height(u.space(44)),enabled=enabled){openEditor(sub)}}
                        }
                    }}
                    Row(profileEntrance(u,subs.size+1,leaving),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(u.space(24))){
                        AccountCircle(u,null,"Criar novo perfil"){if(enabled)openEditor(add=true)}
                        Copy("Novo perfil",u,29,500)
                    }
                }
            }
        }else if(mode=="add"){
            Column(u.at(180,235,1000,680).graphicsLayer{alpha=enter.value},verticalArrangement=Arrangement.spacedBy(u.space(24))){
                if(mode=="add"){
                    Copy("Nome do perfil",u,25,500)
                    BasicTextField(name,{name=it.take(60)},Modifier.focusRequester(editFocus).fillMaxWidth().background(Color.Black.copy(alpha=.55f),u.round(18)).padding(u.space(22)),singleLine=true,enabled=!busy,textStyle=u.referenceText(28,400).copy(color=Color.White),cursorBrush=SolidColor(Color.White))
                }else{Copy(name,u,32,500);Copy("Dados cadastrais: edição pelo celular.",u,20,300);if(mode=="main"){val city=listOf(profile.str("cidade"),profile.str("estado")).filter{it.isNotBlank()}.joinToString(" / ");if(city.isNotBlank())Copy(city,u,20,300)}}
                run{
                    Copy("Escolher avatar",u,25,500)
                    LazyRow(horizontalArrangement=Arrangement.spacedBy(u.space(12)),contentPadding=PaddingValues(u.space(10))){items(if(mode=="main")listOfNotNull(nativeGooglePhoto(account).takeIf{it.isNotBlank()})+profileAvatarPaths else profileAvatarPaths){path->AccountCircle(u,nativeProfileAvatar(path),"Selecionar avatar",if(path==(if(mode=="main")listOfNotNull(nativeGooglePhoto(account).takeIf{it.isNotBlank()})+profileAvatarPaths else profileAvatarPaths).firstOrNull()&&mode!="add")Modifier.focusRequester(editFocus)else Modifier){avatar=path}}}
                }
                Row(horizontalArrangement=Arrangement.spacedBy(u.space(18))){
                    GlassButton(u,if(busy)"Salvando…" else if(mode=="add")"Criar perfil" else "Salvar",Modifier.height(u.space(64)),enabled=!busy&&name.isNotBlank()&&enabled){mutate()}
                    GlassButton(u,"Cancelar",Modifier.height(u.space(64)),enabled=!busy){mode="select"}
                    if(mode=="sub")GlassButton(u,"Excluir perfil",Modifier.height(u.space(64)),enabled=!busy){confirmDelete=true}
                    if(mode=="main")GlassButton(u,"Sair da conta Google",Modifier.height(u.space(64)),enabled=!busy){confirmLogout=true}
                }
                if(message.isNotBlank())Copy(message,u,21,500,lines=3)
            }
            NativeAvatarImage(nativeProfileAvatar(avatar),u.at(1340,285,280,280).clip(CircleShape))
        }else{
            NativeMyStation(u,mode=="main",name,avatar,profile,account,accountTab,{accountTab=it;showLikes=it=="Músicas curtidas"&&mode=="main"},avatarPicker,{avatarPicker=it},busy,message,editFocus,{chosen->avatar=chosen;scope.launch{try{val radio=owner?:return@launch;busy=true;val updated=services.updateListenerProfile(radio,user){before->if(mode=="main")JSONObject().put("avatar_url",chosen)else JSONObject().put("sub_profiles",JSONArray(before.rows("sub_profiles").map{if(it.str("id")==editId)JSONObject(it.toString()).put("avatar_url",chosen)else it}))};onProfile(updated);avatarPicker=false;message=""}catch(e:CancellationException){throw e}catch(_:Exception){message="Não foi possível salvar o avatar."}finally{busy=false}}},{confirmLogout=true},{confirmDelete=true},{mode="select"},accountLikes,likesStatus,NativeAccountActions(services,owner,user),{song->scope.launch{try{val radio=owner?:return@launch;services.removeAccountLike(radio,user,song.str("id"));accountLikes=accountLikes.filterNot{it.str("id")==song.str("id")};likesStatus=if(accountLikes.isEmpty())"Nenhuma música curtida." else ""}catch(e:CancellationException){throw e}catch(_:Exception){likesStatus="Não foi possível remover a curtida."}}})
        }
        if(mobileQr)Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha=.64f)),contentAlignment=Alignment.Center){
            LaunchedEffect(Unit){withFrameNanos{};runCatching{mobileFocus.requestFocus()}}
            Column(Modifier.width(u.space(510)).background(interactionGlass,u.round(28)).padding(u.space(24)),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(u.space(20))){
                Copy("Acessar no celular",u,30,600)
                NativeQr("https://housemix.nexobrasil.net/"+(if(BuildConfig.STATION_SLUG=="positivafm")"positiva" else if(BuildConfig.STATION_SLUG=="interativafm")"interativa" else BuildConfig.STATION_SLUG)+"/pair?resume=1",Modifier.size(u.space(300)))
                Copy("Escaneie e entre com sua conta Google se necessário.",u,22,400,lines=3,align=androidx.compose.ui.text.style.TextAlign.Center)
                GlassButton(u,"Fechar",Modifier.height(u.space(52)).focusRequester(mobileFocus)){mobileQr=false;runCatching{focus.requestFocus()}}
            }
        }
        if(confirmLogout||confirmDelete)Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha=.64f)),contentAlignment=Alignment.Center){
            Column(Modifier.width(u.space(580)).background(interactionGlass,u.round(28)).padding(u.space(35)),verticalArrangement=Arrangement.spacedBy(u.space(20))){
                Copy(if(confirmLogout)"Sair da conta Google?" else "Excluir este perfil?",u,30,600)
                Copy(if(confirmLogout)"Você poderá conectar novamente pelo QR Code." else "A conta Google e os demais perfis serão preservados.",u,21,400,lines=3)
                Row(horizontalArrangement=Arrangement.spacedBy(u.space(18))){GlassButton(u,"Cancelar",Modifier.height(u.space(54)).focusRequester(cancelFocus),enabled=!busy){confirmLogout=false;confirmDelete=false};GlassButton(u,if(confirmLogout)"Sair" else "Excluir",Modifier.height(u.space(54)),enabled=!busy){if(confirmLogout){confirmLogout=false;onLogout()}else mutate(true)}}
            }
        }
        Copy("Nexo TV v"+BuildConfig.VERSION_NAME,u,18,400,u.at(100,1030,800,30),color=Color.White.copy(alpha=.6f))
    }
}

@Composable private fun NativeMyStation(u:TvUnits,main:Boolean,name:String,avatar:String,profile:JSONObject?,account:JSONObject,tab:String,onTab:(String)->Unit,picker:Boolean,onPicker:(Boolean)->Unit,busy:Boolean,message:String,focus:FocusRequester,onAvatar:(String)->Unit,onLogout:()->Unit,onDelete:()->Unit,onBack:()->Unit,likes:List<JSONObject>,likesStatus:String,actions:NativeAccountActions,onUnlike:(JSONObject)->Unit){
    Box(u.at(180,195,1560,800)){
        Column(Modifier.fillMaxSize().padding(u.space(10)),verticalArrangement=Arrangement.spacedBy(u.space(24))){
            Row(Modifier.padding(u.space(8)),horizontalArrangement=Arrangement.spacedBy(u.space(18)),verticalAlignment=Alignment.CenterVertically){
                GlassButton(u,"Voltar",Modifier.height(u.space(58)),icon="left",onClick=onBack)
                listOf("Início","Amigos","Músicas curtidas").forEachIndexed{i,t->GlassButton(u,t,Modifier.height(u.space(58)).then(if(i==0)Modifier.focusRequester(focus)else Modifier),outline=tab==t){onTab(t)}}
            }
            Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(u.space(24))){
            when(tab){
                "Início"->{
                    Row(horizontalArrangement=Arrangement.spacedBy(u.space(36)),verticalAlignment=Alignment.CenterVertically){
                        var focused by remember{mutableStateOf(false)}
                        val source=remember{MutableInteractionSource()};val hovered by source.collectIsHoveredAsState()
                        Box(Modifier.size(u.space(185)).onFocusChanged{focused=it.isFocused}.hoverable(source).clip(CircleShape).clickable(enabled=!busy){onPicker(true)},contentAlignment=Alignment.Center){
                            NativeAvatarImage(nativeProfileAvatar(avatar),Modifier.fillMaxSize())
                            if(focused||hovered)Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent,Color.Black.copy(alpha=.80f)))),contentAlignment=Alignment.BottomCenter){Copy("▣  Alterar",u,19,400,Modifier.padding(bottom=u.space(25)))}
                        }
                        Column(verticalArrangement=Arrangement.spacedBy(u.space(12))){
                            Copy(name,u,36,600)
                            Copy(LocalNexoRewards.current?.total?.let{nativePointsLabel(it)+" pontos"}?:"Pontuação indisponível",u,23,400)
                            if(main)GlassButton(u,"Sair da conta Google",Modifier.height(u.space(44)),enabled=!busy,onClick=onLogout)
                            else GlassButton(u,"Excluir perfil",Modifier.height(u.space(44)),enabled=!busy,onClick=onDelete)
                        }
                    }
                    Copy("Dados cadastrais",u,29,600)
                    val fields=if(main)listOf("Nome completo" to name,"E-mail" to profile.str("email").ifBlank{account.str("email")},"CPF" to profile.str("cpf"),"Data de nascimento" to profile.str("data_nascimento"),"WhatsApp" to profile.str("whatsapp"),"Sexo" to profile.str("sexo"),"Cidade" to profile.str("cidade"),"Estado" to profile.str("estado"),"Setor / Bairro" to profile.str("setor"),"CEP" to profile.str("cep"))else listOf("Nome" to name)
                    fields.chunked(3).forEach{group->Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(u.space(24))){group.forEach{(label,value)->Column(Modifier.weight(1f).border(u.space(1),Color.White.copy(alpha=.65f),u.round(14)).padding(u.space(15)),verticalArrangement=Arrangement.spacedBy(u.space(5))){Copy(label,u,18,400);Copy(value.ifBlank{"Não informado"},u,23,500,lines=2)}}}}
                    Copy("Para editar os dados cadastrais, acesse Minha Rádio pelo celular.",u,22,400)
                }
                "Amigos"->NativeFriends(u,actions.services,actions.owner,profile.str("id"))
                else->{
                    if(!main)Copy("Curtidas individuais deste perfil ainda não estão disponíveis.",u,23,400)
                    else{if(likesStatus.isNotBlank())Copy(likesStatus,u,23,400);likes.chunked(5).forEach{songs->Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(u.space(20))){songs.forEach{song->Column(Modifier.weight(1f)){NativeLikedSongRow(u,song){onUnlike(song)}}};repeat(5-songs.size){Spacer(Modifier.weight(1f))}}}}
                }
            }
            if(message.isNotBlank())Copy(message,u,22,400)
            }
        }
        if(picker){
            Box(Modifier.align(Alignment.Center).width(u.space(1320)).background(interactionGlass,u.round(32)).padding(u.space(22))){
                val first=remember{FocusRequester()}
                LaunchedEffect(Unit){withFrameNanos{};runCatching{first.requestFocus()}}
                Column(verticalArrangement=Arrangement.spacedBy(u.space(16))){
                    val choices=(if(main)listOfNotNull(nativeGooglePhoto(account).takeIf{it.isNotBlank()})else emptyList())+profileAvatarPaths
                    Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(u.space(12))){LazyRow(Modifier.weight(1f),horizontalArrangement=Arrangement.spacedBy(u.space(12)),contentPadding=PaddingValues(u.space(8))){items(choices){path->AccountCircle(u,nativeProfileAvatar(path),"Selecionar avatar",if(path==choices.first())Modifier.focusRequester(first)else Modifier){if(!busy)onAvatar(path)}}};GlassButton(u,"",Modifier.size(u.space(60)),icon="left"){onPicker(false)}}
                }
            }
        }
    }
}

private data class NativeAccountActions(val services:NativeServices,val owner:String?,val user:String)
@Composable private fun NativeLikedSongRow(u:TvUnits,song:JSONObject,onUnlike:()->Unit){
    var focused by remember{mutableStateOf(false)}
    Column(Modifier.fillMaxWidth().onFocusChanged{focused=it.isFocused}.border(u.space(if(focused)3 else 0),Color.White,u.round(20)).padding(u.space(6)).clickable(onClick=onUnlike),verticalArrangement=Arrangement.spacedBy(u.space(10))){
        Box(Modifier.fillMaxWidth().aspectRatio(1f).clip(u.round(16)),contentAlignment=Alignment.Center){Artwork(safeImage(song.str("capa")),Modifier.fillMaxSize(),scale=ContentScale.Crop);Box(Modifier.size(u.space(54)).background(Color.Black.copy(alpha=.48f),CircleShape),contentAlignment=Alignment.Center){Copy("♥",u,32,700,color=Color(0xFFF20D0F))}}
        Column(Modifier.fillMaxWidth().background(glass,u.round(14)).padding(u.space(10))){Copy(song.str("titulo").ifBlank{song.str("musica")},u,20,600,lines=2);Copy(song.str("artista"),u,17,400,lines=2)}
    }
}

@Composable private fun profileEntrance(u:TvUnits,index:Int,leaving:Boolean):Modifier {
    val motion=remember{Animatable(0f)}
    LaunchedEffect(index,leaving){kotlinx.coroutines.delay(index.coerceAtMost(5)*120L);motion.animateTo(if(leaving)0f else 1f,tween(240))}
    return Modifier.graphicsLayer{alpha=motion.value;translationX=(1f-motion.value)*-u.space(30).toPx()}
}
