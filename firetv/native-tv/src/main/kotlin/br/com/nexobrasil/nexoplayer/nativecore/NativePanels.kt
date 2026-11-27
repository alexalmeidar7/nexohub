package br.com.nexobrasil.nexoplayer.nativecore

import android.content.SharedPreferences
import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.tv.material3.Text
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import org.json.JSONArray
import java.net.URL
import java.net.URLEncoder
import java.net.HttpURLConnection
import java.text.Normalizer
import java.util.Locale

internal fun readWeatherLocation(prefs:SharedPreferences):JSONObject?=runCatching{JSONObject(prefs.getString("location",null)?:return null)}.getOrNull()
private fun norm(s:String)=Normalizer.normalize(s,Normalizer.Form.NFD).replace(Regex("\\p{M}+"),"").lowercase(Locale.ROOT)
private suspend fun getJson(url:String):JSONObject=withContext(Dispatchers.IO){
    val c=URL(url).openConnection() as HttpURLConnection
    try {c.connectTimeout=5000;c.readTimeout=7000;check(c.responseCode in 200..299);JSONObject(c.inputStream.bufferedReader().use{it.readText()})}finally{c.disconnect()}
}
private val states=mapOf("AC" to "Acre","AL" to "Alagoas","AP" to "Amapá","AM" to "Amazonas","BA" to "Bahia","CE" to "Ceará","DF" to "Distrito Federal","ES" to "Espírito Santo","GO" to "Goiás","MA" to "Maranhão","MT" to "Mato Grosso","MS" to "Mato Grosso do Sul","MG" to "Minas Gerais","PA" to "Pará","PB" to "Paraíba","PR" to "Paraná","PE" to "Pernambuco","PI" to "Piauí","RJ" to "Rio de Janeiro","RN" to "Rio Grande do Norte","RS" to "Rio Grande do Sul","RO" to "Rondônia","RR" to "Roraima","SC" to "Santa Catarina","SP" to "São Paulo","SE" to "Sergipe","TO" to "Tocantins")
private val coverCache=mutableMapOf<String,String>()
private suspend fun coverFor(title:String,artist:String):String {
    if(title.isBlank()||artist.isBlank())return ""
    val key=norm("$title|$artist")
    coverCache[key]?.let{return it}
    val result=getJson("https://itunes.apple.com/search?media=music&entity=song&limit=5&term="+URLEncoder.encode("$artist $title","UTF-8"))
    val found=result.rows("results").firstOrNull{norm(it.str("artistName")).contains(norm(artist)) && norm(it.str("trackName")).contains(norm(title))}
    val url=found.str("artworkUrl100").replace("100x100bb","600x600bb")
    if(url.isNotBlank()){if(coverCache.size>=250)coverCache.clear();coverCache[key]=url}
    return url
}
private data class SearchHit(val kind:String,val title:String,val sub:String,val image:String,val destination:Screen)
private fun searchHits(payload:JSONObject?,history:List<JSONObject>):List<SearchHit> = buildList {
    payload.rows("channels").forEach{add(SearchHit("Canal",it.str("name"),it.str("catalog_name"),it.str("cover_url"),when(it.str("type")){"audio_live"->Screen.AUDIO;"video_live"->Screen.VIDEO;else->Screen.CATALOG}))}
    payload.rows("apresentadores").forEach{add(SearchHit("Apresentador",it.str("nome"),"Apresentador da rádio",it.str("foto"),Screen.SCHEDULE))}
    payload.rows("programas").forEach{add(SearchHit("Programa",it.str("nome"),it.str("horario_inicio").take(5)+" – "+it.str("horario_fim").take(5),it.str("thumb").ifBlank{it.str("capa")},Screen.SCHEDULE))}
    history.forEach{add(SearchHit("Música tocada",it.str("musica"),it.str("artista"),it.str("capa_url"),Screen.HISTORY))}
}.filter{it.title.isNotBlank()}.distinctBy{it.kind+"|"+it.title+"|"+it.sub}

@Composable internal fun InteractionCards(u:TvUnits,onPanel:(String)->Unit,onClose:()->Unit) {
    val focus=remember{FocusRequester()}
    val labels=listOf(Triple("lyrics","letra da música","mic"),Triple("chat","chat","chat"),Triple("poll","enquete","poll"),Triple("weather","previsão do tempo","sun"),Triple("history","músicas tocadas","history"),Triple("battle","batalha musical","battle"))
    Row(u.at(285,862,1535,152),horizontalArrangement=Arrangement.spacedBy(u.space(23)),verticalAlignment=Alignment.Bottom){
        labels.forEachIndexed{i,item->
            var focused by remember{mutableStateOf(false)}
            val shape=u.round(28)
            Column((if(i==0)Modifier.focusRequester(focus) else Modifier).size(u.space(188),u.space(152)).clip(shape).onFocusChanged{focused=it.isFocused}.background(glass,shape).border(u.space(if(focused)3 else 1),Color.White.copy(alpha=if(focused)1f else .16f),shape).clickable{onPanel(item.first)}.padding(u.space(20)),verticalArrangement=Arrangement.SpaceBetween){
                Copy(item.second,u,18,400,lines=2)
                Symbol(item.third,Modifier.size(u.space(46)).align(Alignment.End))
            }
        }
        GlassButton(u,"",Modifier.size(u.space(56)),icon="left",onClick=onClose)
    }
    LaunchedEffect(Unit){focus.requestFocus()}
}
@Composable private fun InputBox(u:TvUnits,value:String,onChange:(String)->Unit,placeholder:String,modifier:Modifier=Modifier,numeric:Boolean=false) {
    BasicTextField(value,onChange,modifier.clip(u.round(18)).background(Color(0xFF303030)).padding(u.space(16)),singleLine=true,textStyle=u.referenceText(23).copy(color=Color.White),cursorBrush=SolidColor(Color.White),keyboardOptions=KeyboardOptions(keyboardType=if(numeric)KeyboardType.Number else KeyboardType.Text),decorationBox={inner->Box{if(value.isEmpty())Copy(placeholder,u,23,400,color=Color.White.copy(alpha=.55f));inner()}})
}
@Composable internal fun NativePanel(u:TvUnits,panel:String,payload:JSONObject?,track:JSONObject?,history:List<JSONObject>,loading:Boolean,error:Boolean,forecast:JSONObject?,lyrics:String?,cep:String,api:HouseMixClient,owner:String?,accent:Color,onClose:()->Unit,onCepSaved:(String,JSONObject)->Unit,onOpen:(Screen)->Unit) {
    val focus=remember(panel){FocusRequester()}
    val scope=rememberCoroutineScope()
    if(panel=="search"||panel=="cep") {
        Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha=.58f)),contentAlignment=Alignment.Center){
            Column(Modifier.width(u.space(760)).clip(u.round(26)).background(glass).padding(u.space(20)),verticalArrangement=Arrangement.spacedBy(u.space(12))){
                if(panel=="search"){
                    val context=LocalContext.current
                    val prefs=remember{context.getSharedPreferences("native_tv_settings",0)}
                    var query by remember{mutableStateOf("")}
                    var recent by remember{mutableStateOf(runCatching{JSONArray(prefs.getString("recent_searches","[]")).let{a->(0 until a.length()).map{a.getString(it)}}}.getOrDefault(emptyList()))}
                    val hits=remember(query,payload,history){if(query.isBlank())emptyList() else searchHits(payload,history).filter{norm(it.title+" "+it.sub).contains(norm(query.trim()))}.take(24)}
                    Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(u.space(12))){
                        InputBox(u,query,{query=it.take(120)},"Buscar em tudo...",Modifier.weight(1f).focusRequester(focus))
                        GlassButton(u,"",Modifier.size(u.space(50)),icon="left",onClick=onClose)
                    }
                    LazyColumn(Modifier.heightIn(max=u.space(420)).clip(u.round(18)).background(Color(0xFF303030)).padding(u.space(16)),verticalArrangement=Arrangement.spacedBy(u.space(8))){
                        if(query.isBlank()){
                            item{Copy("Últimas pesquisas",u,18)}
                            items(recent){term->GlassButton(u,term,Modifier.fillMaxWidth().height(u.space(60))){query=term}}
                            if(recent.isEmpty())item{Copy("Suas últimas pesquisas aparecem aqui.",u,19)}
                        }else{
                            items(hits){hit->
                                Row(Modifier.fillMaxWidth().height(u.space(76)).clip(u.round(16)).background(Color(0xFF404040)).clickable{
                                    val term=query.trim();recent=(listOf(term)+recent.filter{it!=term}).take(3);prefs.edit().putString("recent_searches",JSONArray(recent).toString()).apply()
                                    onClose();onOpen(hit.destination)
                                }.padding(u.space(10)),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(u.space(16))){
                                    Artwork(safeImage(hit.image),Modifier.size(u.space(56)).clip(u.round(8)),scale=ContentScale.Crop)
                                    Column{Copy(hit.title,u,21,500);Copy(hit.kind+" · "+hit.sub,u,17)}
                                }
                            }
                            if(hits.isEmpty())item{Copy(if(loading)"Carregando…" else "Nenhum conteúdo encontrado.",u,19)}
                        }
                    }
                }else{
                    var digits by remember{mutableStateOf(cep)}
                    var msg by remember{mutableStateOf("")}
                    var busy by remember{mutableStateOf(false)}
                    var city by remember{mutableStateOf("")}
                    LaunchedEffect(digits){city="";if(digits.length==8){delay(300);try{val a=getJson("https://viacep.com.br/ws/$digits/json/");if(!a.optBoolean("erro"))city=a.str("localidade")+" / "+a.str("uf")}catch(e:CancellationException){throw e}catch(_:Exception){}}}
                    Row(verticalAlignment=Alignment.CenterVertically){Copy("Configurar tempo pelo CEP",u,30,600,Modifier.weight(1f));GlassButton(u,"",Modifier.size(u.space(56)),icon="left",onClick=onClose)}
                    Copy("Informe seu CEP para buscar o tempo da sua região.",u,22,400,lines=2)
                    InputBox(u,digits,{digits=it.filter(Char::isDigit).take(8)},"00000-000",Modifier.fillMaxWidth().then(if(cep.length!=8)Modifier.focusRequester(focus)else Modifier),true)
                    Copy(if(city.isNotBlank())"Tempo para: $city" else msg,u,20,400,lines=3)
                    GlassButton(u,if(busy)"localizando..." else "salvar CEP",Modifier.height(u.space(62)).then(if(cep.length==8)Modifier.focusRequester(focus)else Modifier),enabled=!busy){
                        if(digits.length!=8)msg="Digite um CEP válido com 8 números." else {busy=true;msg="";scope.launch{
                            try{
                                val a=getJson("https://viacep.com.br/ws/$digits/json/")
                                check(!a.optBoolean("erro")&&a.str("localidade").isNotBlank()){"CEP não encontrado."}
                                val state=a.str("estado").ifBlank{states[a.str("uf")].orEmpty()}
                                val match=api.geocode(a.str("localidade")).rows("results").firstOrNull{it.str("country_code")=="BR"&&norm(it.str("admin1"))==norm(state)&&it.optDouble("latitude").isFinite()&&it.optDouble("longitude").isFinite()}
                                check(match!=null){"Não foi possível confirmar a cidade e o estado."}
                                onCepSaved(digits,JSONObject().put("lat",match.optDouble("latitude")).put("lon",match.optDouble("longitude")))
                            }catch(e:CancellationException){throw e}catch(e:Exception){msg=e.message?:"Não foi possível salvar o CEP."}finally{busy=false}
                        }}
                    }
                    if(msg.isNotBlank())Copy(msg,u,19,400,lines=3)
                }
            }
        }
    }else{
        Box(u.at(1350,165,470,735)){
            GlassButton(u,"",Modifier.align(Alignment.TopEnd).size(u.space(56)),icon="left",onClick=onClose)
            Column(Modifier.offset(y=u.space(75)).fillMaxWidth().height(u.space(650)).clip(u.round(28)).background(glass).padding(u.space(20)),horizontalAlignment=Alignment.CenterHorizontally){
                when(panel){
                    "history" -> {
                        var index by remember{mutableIntStateOf(0)}
                        val song=history.getOrNull(index)
                        var image by remember(song){mutableStateOf(song.str("capa_url"))}
                        LaunchedEffect(song){if(image.isBlank()&&song!=null){image=if(song.str("musica")==track.str("titulo")&&song.str("artista")==track.str("artista"))track.str("capa") else "";if(image.isBlank())try{image=coverFor(song.str("musica"),song.str("artista"))}catch(e:CancellationException){throw e}catch(_:Exception){}}}
                        if(song==null){Copy(if(loading)"Carregando músicas tocadas..." else if(error)"Histórico indisponível" else "Nenhuma música registrada.",u,23,400,lines=3);GlassButton(u,"Voltar",Modifier.focusRequester(focus).height(u.space(52)),onClick=onClose)}
                        else{
                            AnimatedContent(index,label="historyInfo"){i->val item=history.getOrNull(i);Column(horizontalAlignment=Alignment.CenterHorizontally){Copy(item.str("horario").take(5),u,20,400);Copy(item.str("musica").uppercase(),u,25,700,lines=2,align=TextAlign.Center);Copy(item.str("artista").uppercase(),u,20,400,lines=2)}}
                            GlassButton(u,"",Modifier.size(u.space(46)),icon="up"){index=(index-1).coerceAtLeast(0)}
                            Box(Modifier.weight(1f).fillMaxWidth().padding(vertical=u.space(7)).clip(u.round(18)).background(Color.White.copy(alpha=.06f)),contentAlignment=Alignment.Center){
                                Symbol("music",Modifier.size(u.space(100)))
                                Artwork(safeImage(image),Modifier.fillMaxSize(),scale=ContentScale.Fit)
                            }
                            Box(Modifier.fillMaxWidth(),contentAlignment=Alignment.Center){
                                GlassButton(u,"",Modifier.size(u.space(46)).focusRequester(focus),icon="down"){index=(index+1).coerceAtMost(history.lastIndex)}
                                Copy((index+1).toString()+"/"+history.size,u,19,500,Modifier.align(Alignment.CenterEnd))
                            }
                        }
                    }
                    "weather" -> {
                        val d=forecast?.optJSONObject("daily");val dates=d?.optJSONArray("time")
                        Copy("tempo agora",u,22,500)
                        val temp=forecast?.optJSONObject("current")?.optDouble("temperature_2m")
                        Copy(temp?.takeIf{it.isFinite()}?.let{it.toInt().toString()+"°"}?:"--°",u,56,600)
                        if(dates==null){Copy("Previsão indisponível.",u,22);GlassButton(u,"Voltar",Modifier.focusRequester(focus).height(u.space(52)),onClick=onClose)}
                        else LazyColumn(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(u.space(8))){
                            items(minOf(7,dates.length())){i->
                                val code=d?.optJSONArray("weather_code")?.optInt(i)?:0
                                val min=d?.optJSONArray("temperature_2m_min")?.optDouble(i);val max=d?.optJSONArray("temperature_2m_max")?.optDouble(i)
                                Row((if(i==0)Modifier.focusRequester(focus)else Modifier).fillMaxWidth().height(u.space(67)).clip(u.round(16)).background(Color.White.copy(alpha=.08f)).clickable{}.padding(u.space(8)),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(u.space(10))){
                                    Symbol(if(code<=1)"sun" else if(code>=51)"rain" else "cloud",Modifier.size(u.space(34)))
                                    Copy(dates.optString(i).takeLast(5),u,20,500,Modifier.weight(1f));Copy((min?.toInt()?.toString()?:"--")+"° / "+(max?.toInt()?.toString()?:"--")+"°",u,20)
                                }
                            }
                        }
                    }
                    "lyrics" -> {
                        Copy(track.str("titulo"),u,25,600,lines=2);Copy(track.str("artista"),u,20)
                        Column(Modifier.weight(1f).verticalScroll(rememberScrollState())){Text(lyrics?:"Carregando letra...",style=u.referenceText(22),color=Color.White)}
                        GlassButton(u,"Voltar",Modifier.focusRequester(focus).height(u.space(50)),onClick=onClose)
                    }
                    else -> {
                        Copy(when(panel){"chat"->"Chat";"poll"->"Enquete";else->"Batalha musical"},u,28,600)
                        Copy("Conexão com o serviço ainda não disponível neste APK de teste.",u,23,400,lines=4)
                        GlassButton(u,"Voltar",Modifier.focusRequester(focus).height(u.space(52)),onClick=onClose)
                    }
                }
            }
        }
    }
    LaunchedEffect(panel,loading,history.isNotEmpty(),forecast!=null){runCatching{focus.requestFocus()}}
}
