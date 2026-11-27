package br.com.nexobrasil.nexoplayer.nativecore

import android.net.Uri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class HouseMixClient(supabaseOrigin: String, private val publishableKey: String) {
    private val origin = Uri.parse(supabaseOrigin).also {
        require(it.scheme == "https" && it.host != null && it.encodedUserInfo == null)
    }

    suspend fun stationPayload(slug: String): JSONObject =
        function("public-player-data", body = JSONObject().put("slug", slug))

    suspend fun station(slug: String): StationBootstrap = StationBootstrap.fromJson(stationPayload(slug))

    suspend fun nowPlaying(slug: String): JSONObject =
        function("public-player-data", body = JSONObject().put("slug", slug).put("section", "now_playing"))

    suspend fun recentMusic(stationId: String): JSONObject =
        function("public-music-history", query = mapOf("user_id" to stationId, "limit" to "50"))

    suspend fun pairingStatus(code: String, deviceSessionId: String): PairingStatus =
        PairingStatus.fromJson(
            function("tv-pair-status", body = JSONObject().put("code", code).put("tvSessionId", deviceSessionId))
        )

    suspend fun campaigns(ownerId: String): JSONObject =
        function("public-player-ads", query = mapOf("radio_id" to ownerId))

    suspend fun sponsors(ownerId: String, date: String, day: String, time: String): JSONObject =
        function("public-cenario-data", query = mapOf("uid" to ownerId, "date" to date, "day" to day, "time" to time))

    suspend fun weather(ownerId: String,location:JSONObject?=null): JSONObject {
        val body=JSONObject().put("action","forecast").put("forecast_days",8)
        if(location!=null) body.put("lat",location.optDouble("lat")).put("lon",location.optDouble("lon")) else body.put("user_id",ownerId)
        return function("fetch-weather",body=body)
    }
    suspend fun lyrics(title:String,artist:String):String {
        val r=function("fetch-lyrics",body=JSONObject().put("title",title).put("artist",artist))
        return r.str("plainLyrics").ifBlank{r.str("syncedLyrics").replace(Regex("\\[\\d{2}:\\d{2}[.:]\\d{2,3}\\]"),"")}.ifBlank{"Letra indisponível para esta música."}
    }
    suspend fun geocode(city:String):JSONObject=function("fetch-weather",body=JSONObject().put("action","geocode").put("query",city).put("count",20))


    private suspend fun function(
        name: String,
        query: Map<String, String> = emptyMap(),
        body: JSONObject? = null,
    ): JSONObject = withContext(Dispatchers.IO) {
        val builder = origin.buildUpon().appendPath("functions").appendPath("v1").appendPath(name)
        query.forEach { (key, value) -> builder.appendQueryParameter(key, value) }
        val connection = URL(builder.build().toString()).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = if (body == null) "GET" else "POST"
            connection.connectTimeout = 8_000
            connection.readTimeout = 10_000
            connection.instanceFollowRedirects = false
            connection.setRequestProperty("apikey", publishableKey)
            connection.setRequestProperty("Authorization", "Bearer $publishableKey")
            connection.setRequestProperty("Accept", "application/json")
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val status = connection.responseCode
            check(status in 200..299) { "House Mix request failed ($name, HTTP $status)" }
            JSONObject(connection.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() })
        } finally {
            connection.disconnect()
        }
    }
}
