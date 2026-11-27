package br.com.nexobrasil.nexoplayer.nativecore

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject
import org.json.JSONArray
import java.net.URL
import java.net.HttpURLConnection
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

internal class NativeServices(private val api:HouseMixClient,context:Context) {
    private val prefs=context.getSharedPreferences("tv_secure_session",0)
    private val mutex=Mutex()
    private var session:JSONObject?=null
    private val alias="nexo.tv.session.v1"
    private fun key():SecretKey {
        val ks=KeyStore.getInstance("AndroidKeyStore").apply{load(null)}
        return (ks.getKey(alias,null) as? SecretKey) ?: KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").run {
            init(KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());generateKey()
        }
    }
    private fun save(s:JSONObject) {
        val c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,key())
        check(prefs.edit().putString("session",Base64.encodeToString(c.iv+c.doFinal(s.toString().toByteArray()),Base64.NO_WRAP)).commit())
        session=s
    }
    private fun stored():JSONObject?=runCatching{
        val bytes=Base64.decode(prefs.getString("session",null)?:return null,Base64.NO_WRAP)
        val c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,bytes.copyOfRange(0,12)))
        JSONObject(String(c.doFinal(bytes.copyOfRange(12,bytes.size))))
    }.getOrNull()
    private suspend fun request(path:List<String>,query:Map<String,String> = emptyMap(),body:JSONObject?=null,method:String=if(body==null)"GET" else "POST",token:String?=null):Any?=withContext(Dispatchers.IO){
        val b=api.origin.buildUpon();path.forEach{b.appendPath(it)};query.forEach{(k,v)->b.appendQueryParameter(k,v)}
        val c=URL(b.build().toString()).openConnection() as HttpURLConnection
        try{
            c.requestMethod=method;c.connectTimeout=8000;c.readTimeout=12000;c.instanceFollowRedirects=false
            c.setRequestProperty("apikey",api.publishableKey);c.setRequestProperty("Authorization","Bearer "+(token?:api.publishableKey));c.setRequestProperty("Accept","application/json")
            if(body!=null){c.doOutput=true;c.setRequestProperty("Content-Type","application/json");c.outputStream.use{it.write(body.toString().toByteArray())}}
            check(c.responseCode in 200..299){"Servidor indisponível (HTTP "+c.responseCode+")."}
            val s=c.inputStream.bufferedReader().use{it.readText()};if(s.isBlank())null else org.json.JSONTokener(s).nextValue()
        }finally{c.disconnect()}
    }
    private suspend fun access():String?=mutex.withLock{
        val s=session?:return@withLock null;val token=s.str("access_token")
        val exp=runCatching{JSONObject(String(Base64.decode(token.split(".")[1],Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING))).optLong("exp")}.getOrDefault(0)
        if(exp>System.currentTimeMillis()/1000+90)return@withLock token
        val next=request(listOf("auth","v1","token"),mapOf("grant_type" to "refresh_token"),JSONObject().put("refresh_token",s.str("refresh_token"))) as JSONObject
        next.put("deviceId",s.str("deviceId"));withContext(Dispatchers.IO){save(next)};next.str("access_token")
    }
    suspend fun restore():JSONObject?{session=withContext(Dispatchers.IO){stored()};return if(session==null)null else account()}
    private suspend fun account():JSONObject{
        val token=access()?:error("Conecte sua conta Google.")
        val user=request(listOf("auth","v1","user"),token=token) as JSONObject
        check(user.str("id").isNotBlank()){"Sessão encerrada."}
        return user
    }
    fun clear(){session=null;prefs.edit().remove("session").apply()}
    suspend fun logout(){
        val token=access()
        if(token!=null)request(listOf("auth","v1","logout"),query=mapOf("scope" to "local"),body=JSONObject(),token=token)
        clear()
    }
    data class Pair(val code:String,val displayCode:String,val id:String,val secret:String,val expires:String)
    suspend fun newPair():Pair{
        val secret=ByteArray(32).also{SecureRandom().nextBytes(it)}.joinToString(""){"%02x".format(it.toInt() and 255)}
        val hash=MessageDigest.getInstance("SHA-256").digest(secret.toByteArray()).joinToString(""){"%02x".format(it.toInt() and 255)}
        val id=UUID.randomUUID().toString()
        val r=api.function("tv-pair-create",body=JSONObject().put("userSlug",BuildConfig.STATION_SLUG).put("tvSessionId",id).put("proofHash",hash))
        check(r.optBoolean("ok")){"Pareamento: "+r.str("reason").ifBlank{"create_failed"}}
        val code=r.str("code");val display=r.str("displayCode").ifBlank{code}
        check(display.matches(Regex("[0-9]{4}"))&&code.isNotBlank()&&r.optBoolean("devicePairing")){"Resposta de pareamento incompatível."}
        return Pair(code,display,id,secret,r.str("expiresAt"))
    }
    suspend fun pollPair(p:Pair):JSONObject?{
        val r=api.function("tv-pair-status",body=JSONObject().put("code",p.code).put("tvSessionId",p.id))
        check(r.optBoolean("ok")){"Código indisponível."};val row=r.optJSONObject("row")
        if(row.str("status")=="expired")error("Código expirado.")
        if(row.str("status")!="claimed")return null
        check(row.str("paired_user_id").isNotBlank()){"Entre com Google no celular."}
        val redeemed=api.function("tv-pair-redeem",body=JSONObject().put("code",p.code).put("tvSessionId",p.id).put("proof",p.secret))
        check(redeemed.optBoolean("ok")&&redeemed.str("token_hash").isNotBlank()){"Resgate não autorizado."}
        val s=request(listOf("auth","v1","verify"),body=JSONObject().put("token_hash",redeemed.str("token_hash")).put("type","magiclink")) as JSONObject
        check(s.str("access_token").isNotBlank()&&s.str("refresh_token").isNotBlank()){"Sessão não autorizada."}
        check(s.optJSONObject("user").str("id")==row.str("paired_user_id")){"Conta diferente da autorizada."}
        withContext(Dispatchers.IO){save(s)}
        return try{account().also{check(it.str("id")==row.str("paired_user_id"))}}catch(e:Exception){clear();throw e}
    }
    suspend fun rpc(name:String,body:JSONObject,auth:Boolean=false):Any?{
        val token=access();if(auth&&token==null)error("Conecte sua conta Google para participar.")
        return request(listOf("rest","v1","rpc",name),body=body,token=token)
    }
    suspend fun polls(owner:String):List<JSONObject>{
        val now=java.time.ZonedDateTime.now(brasilia)
        val day=now.toLocalDate().toString();val time=now.format(java.time.format.DateTimeFormatter.ofPattern("HH:mm"))
        return api.function("public-cenario-data",query=mapOf("uid" to owner,"date" to day,"time" to time)).rows("enquetes").filter{it.str("data_enquete").take(10)==day&&it.str("horario_inicio").take(5)<=time&&it.str("horario_fim").take(5)>=time}
    }
    suspend fun chat(owner:String):List<JSONObject>{
        val a=request(listOf("rest","v1","player_chat_messages"),mapOf("select" to "id,nome,message,avatar_url,created_at","channel_id" to "eq.radio-"+owner.lowercase(),"order" to "created_at.desc","limit" to "40"),token=access()) as? JSONArray
        return (0 until (a?.length()?:0)).mapNotNull{a?.optJSONObject(it)}.reversed()
    }
    private fun likeQuery(owner:String,user:String,title:String,artist:String)=mapOf("radio_user_id" to "eq."+owner,"user_id" to "eq."+user,"titulo" to "eq."+title,"artista" to "eq."+artist)
    suspend fun liked(owner:String,user:String,title:String,artist:String):Boolean{
        val token=access()?:return false
        val a=request(listOf("rest","v1","music_likes"),likeQuery(owner,user,title,artist)+mapOf("select" to "id","limit" to "1"),token=token) as? JSONArray
        return (a?.length()?:0)>0
    }
    suspend fun toggleLike(owner:String,user:String,title:String,artist:String,cover:String):Boolean{
        val token=access()?:error("Conecte sua conta Google para curtir.")
        if(liked(owner,user,title,artist))request(listOf("rest","v1","music_likes"),likeQuery(owner,user,title,artist),method="DELETE",token=token)
        else request(listOf("rest","v1","music_likes"),body=JSONObject().put("radio_user_id",owner).put("user_id",user).put("titulo",title).put("musica",title).put("artista",artist).put("capa",cover.takeIf{it.isNotBlank()}?:JSONObject.NULL),token=token)
        return liked(owner,user,title,artist)
    }
}
