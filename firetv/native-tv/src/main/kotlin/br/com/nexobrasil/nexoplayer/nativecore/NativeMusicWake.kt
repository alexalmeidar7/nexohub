package br.com.nexobrasil.nexoplayer.nativecore

import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.*
import org.json.JSONObject
import java.util.concurrent.TimeUnit

internal data class MusicEvent(val title:String,val artist:String,val start:Long){
    fun matches(other:MusicEvent):Boolean=title.trim().equals(other.title.trim(),true)&&artist.trim().equals(other.artist.trim(),true)&&start>0L&&start==other.start
}
internal class MusicReadGuard{
    private var confirmations=0
    fun reset(){confirmations=0}
    fun observe(verified:Boolean){if(verified)confirmations=(confirmations+1).coerceAtMost(3)else reset()}
    fun interval(connected:Boolean,critical:Boolean):Long=if(connected&&!critical&&confirmations>=3)10000L else 2000L
}
internal data class MusicWake(val event:MusicEvent?=null,val reset:Boolean=false)

/** Broadcast is a hint only. HTTP is the sole authority for track and advertising state. */
internal class NativeMusicWake(private val api:HouseMixClient,owner:String){
    private val topic="realtime:music-live-sync:$owner"
    private val queue=Channel<MusicWake>(Channel.CONFLATED)
    private val client=OkHttpClient.Builder().pingInterval(10,TimeUnit.SECONDS).connectTimeout(8,TimeUnit.SECONDS).readTimeout(0,TimeUnit.SECONDS).build()
    @Volatile private var socket:WebSocket?=null
    @Volatile private var joined=false
    @Volatile private var closed=false
    @Volatile private var openedAt=0L
    @Volatile private var lastTry=0L
    @Volatile private var heartbeatSent=0L
    @Volatile private var heartbeatPending=""
    private var heartbeatSequence=1
    private fun now()=android.os.SystemClock.elapsedRealtime()
    init{reconnectIfNeeded()}
    @Synchronized fun healthy():Boolean{
        if(!joined||closed)return false
        val ws=socket?:return false
        val time=now()
        if(heartbeatPending.isNotBlank()&&time-heartbeatSent>=10000L){disconnected(ws);ws.cancel();return false}
        if(heartbeatPending.isBlank()&&(heartbeatSent==0L||time-heartbeatSent>=10000L)){
            val ref="hb-"+(++heartbeatSequence);heartbeatPending=ref;heartbeatSent=time
            if(!ws.send(JSONObject().put("topic","phoenix").put("event","heartbeat").put("payload",JSONObject()).put("ref",ref).toString())){disconnected(ws);ws.cancel();return false}
        }
        return true
    }
    suspend fun await(timeout:Long):MusicWake?=if(timeout<=0)queue.tryReceive().getOrNull()else withTimeoutOrNull(timeout){queue.receive()}
    @Synchronized fun reconnectIfNeeded(){
        if(closed||joined||socket!=null&&now()-openedAt<12000L||lastTry>0&&now()-lastTry<5000L)return
        socket?.cancel();lastTry=now();openedAt=lastTry
        val url=api.origin.buildUpon().scheme("wss").appendPath("realtime").appendPath("v1").appendPath("websocket").appendQueryParameter("apikey",api.publishableKey).appendQueryParameter("vsn","1.0.0").build().toString()
        socket=client.newWebSocket(Request.Builder().url(url).build(),object:WebSocketListener(){
            override fun onOpen(ws:WebSocket,response:Response){
                if(closed){ws.cancel();return}
                val config=JSONObject().put("broadcast",JSONObject().put("ack",false).put("self",false)).put("presence",JSONObject().put("enabled",false)).put("private",false)
                ws.send(JSONObject().put("topic",topic).put("event","phx_join").put("payload",JSONObject().put("config",config)).put("ref","1").put("join_ref","1").toString())
            }
            override fun onMessage(ws:WebSocket,text:String){
                if(closed||ws!==socket)return
                val message=runCatching{JSONObject(text)}.getOrNull()?:return
                val body=message.optJSONObject("payload")?:return
                if(message.optString("topic")=="phoenix"&&message.optString("event")=="phx_reply"&&message.optString("ref")==heartbeatPending&&body.optString("status")=="ok"){heartbeatPending="";return}
                if(message.optString("topic")!=topic)return
                when(message.optString("event")){
                    "phx_reply"->if(message.optString("ref")=="1"){joined=body.optString("status")=="ok";queue.trySend(MusicWake(reset=true));if(!joined)ws.cancel()}
                    "broadcast"->if(joined&&body.optString("event")=="track_change"){
                        val data=body.optJSONObject("payload")?:return
                        val title=data.optString("titulo");val artist=data.optString("artista");val start=nativeEpoch(data.opt("startTime"))
                        if(title.isNotBlank()&&start>0L)queue.trySend(MusicWake(MusicEvent(title,artist,start))) else queue.trySend(MusicWake(reset=true))
                    }
                    "phx_error","phx_close"->{disconnected(ws);ws.cancel()}
                }
            }
            override fun onFailure(ws:WebSocket,t:Throwable,response:Response?){disconnected(ws)}
            override fun onClosed(ws:WebSocket,code:Int,reason:String){disconnected(ws)}
            override fun onClosing(ws:WebSocket,code:Int,reason:String){disconnected(ws);ws.close(code,reason)}
        })
    }
    @Synchronized private fun disconnected(ws:WebSocket){if(socket===ws){socket=null;joined=false;heartbeatPending="";heartbeatSent=0L;queue.trySend(MusicWake(reset=true))}}
    @Synchronized fun close(){closed=true;joined=false;socket?.cancel();socket=null;queue.close();client.dispatcher.executorService.shutdown();client.connectionPool.evictAll()}
}
