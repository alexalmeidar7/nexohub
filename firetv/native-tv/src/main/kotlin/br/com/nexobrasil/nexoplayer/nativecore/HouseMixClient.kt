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

    suspend fun sponsors(ownerId: String, day: String, time: String): JSONObject =
        function("public-cenario-data", query = mapOf("uid" to ownerId, "dia" to day, "hora" to time))

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
