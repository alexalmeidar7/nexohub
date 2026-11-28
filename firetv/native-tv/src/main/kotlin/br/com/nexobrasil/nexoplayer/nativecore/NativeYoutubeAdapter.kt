package br.com.nexobrasil.nexoplayer.nativecore

import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebResourceRequest
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.delay
import java.net.URI

// Official YouTube IFrame player only. No Nexo screens or navigation use this adapter.
internal fun youtubeVideoId(raw:String):String? = runCatching {
    val uri=URI(raw.trim())
    if(uri.scheme !in listOf("http","https"))return null
    val host=uri.host?.lowercase()?.removePrefix("www.")?:return null
    val segments=uri.path.orEmpty().split('/').filter{it.isNotBlank()}
    val candidate=when(host){
        "youtu.be"->segments.firstOrNull()
        "youtube.com","m.youtube.com","youtube-nocookie.com"->if(segments.firstOrNull() in listOf("embed","live","shorts"))segments.getOrNull(1) else if(uri.path=="/watch")uri.rawQuery.orEmpty().split('&').firstOrNull{it.startsWith("v=")}?.substringAfter("v=")else null
        else->null
    }
    candidate?.takeIf{it.matches(Regex("[A-Za-z0-9_-]{11}"))}
}.getOrNull()

internal fun nativeVideoChannels(channels:List<StationChannel>,slug:String):List<StationChannel>{
    val videos=channels.filter{it.type=="video_live"}
    if(slug !in listOf("positiva","positivafm")||videos.isEmpty()||videos.any{it.name.contains("cast",true)||it.name.contains("podcast",true)})return videos
    // Same source already approved and used by src/pages/Player.tsx for this station.
    return videos+StationChannel("nexo-positiva-twitch","Positiva Cast","video_live","https://youtu.be/uPeZ68nIPUY")
}

@Composable internal fun NativeYoutubeEmbed(videoId:String,modifier:Modifier,requested:Boolean,muted:Boolean,onPlaying:(Boolean)->Unit,onError:(String?)->Unit){
    var web by remember(videoId){mutableStateOf<WebView?>(null)}
    val latestPlaying by rememberUpdatedState(onPlaying)
    val latestError by rememberUpdatedState(onError)
    val play by rememberUpdatedState(requested)
    val mute by rememberUpdatedState(muted)
    key(videoId){
        AndroidView(factory={context->
            val origin="https://"+context.packageName
            WebView(context).apply{
                setBackgroundColor(android.graphics.Color.BLACK)
                settings.javaScriptEnabled=true
                settings.domStorageEnabled=true
                settings.allowFileAccess=false
                settings.allowContentAccess=false
                settings.mixedContentMode=WebSettings.MIXED_CONTENT_NEVER_ALLOW
                settings.mediaPlaybackRequiresUserGesture=false
                webChromeClient=WebChromeClient()
                webViewClient=object:WebViewClient(){
                    override fun shouldOverrideUrlLoading(view:WebView,request:WebResourceRequest):Boolean = request.isForMainFrame && request.url.host!=context.packageName
                }
                isFocusable=false;isFocusableInTouchMode=false
                val html="""
                  <!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#player{margin:0;width:100%;height:100%;background:#000;overflow:hidden}</style></head>
                  <body><div id="player"></div><script>
                  var player=null, ready=false, status=-1, fault=0, wants=false, silent=false;
                  function applyIntent(){if(!ready)return;if(silent)player.mute();else player.unMute();if(wants&&(status!==1&&status!==3))player.playVideo();else if(!wants&&(status===1||status===3))player.pauseVideo();}
                  function setIntent(p,m){var changed=wants!==p||silent!==m;wants=p;silent=m;if(changed)applyIntent();}
                  function onYouTubeIframeAPIReady(){player=new YT.Player('player',{videoId:'$videoId',width:'100%',height:'100%',playerVars:{autoplay:0,controls:1,playsinline:1,origin:'$origin',rel:0},events:{onReady:function(){ready=true;applyIntent();},onStateChange:function(e){status=e.data;},onError:function(e){fault=e.data;},onAutoplayBlocked:function(){fault=1000;}}});}
                  function snapshot(){return JSON.stringify({status:status,fault:fault,ready:ready});}
                  </script><script src="https://www.youtube.com/iframe_api"></script></body></html>
                """.trimIndent()
                loadDataWithBaseURL(origin+"/",html,"text/html","UTF-8",null)
                web=this
            }
        },modifier=modifier,onRelease={v->v.stopLoading();v.destroy();if(web===v)web=null})
    }
    LaunchedEffect(web,requested,muted){
        web?.evaluateJavascript("if(typeof setIntent==='function')setIntent("+requested+","+muted+");",null)
    }
    LaunchedEffect(web){
        val v=web?:return@LaunchedEffect
        var last:Boolean?=null;var lastFault=0;var ticks=0
        while(true){
            v.evaluateJavascript("if(typeof setIntent==='function'){setIntent("+play+","+mute+");snapshot()}else null"){raw->
                val obj=runCatching{org.json.JSONObject(org.json.JSONTokener(raw).nextValue() as String)}.getOrNull()
                if(obj!=null){
                    val isPlaying=obj.optInt("status")==1
                    if(last!=isPlaying){last=isPlaying;latestPlaying(isPlaying)}
                    val fault=obj.optInt("fault")
                    if(fault!=lastFault){lastFault=fault;latestError(if(fault==0)null else "YouTube: reprodução indisponível ("+fault+").")}
                    if(++ticks==20&&!obj.optBoolean("ready"))latestError("YouTube: aguardando conexão com o player.")
                }
            }
            delay(1000)
        }
    }
}
