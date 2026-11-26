package br.com.nexobrasil.nexoplayer.nativecore

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class HouseMixContractsTest {
    @Test
    fun bootstrapKeepsOnlyUsableChannelsFromTheStation() {
        val result = StationBootstrap.fromJson(JSONObject("""
            {"userId":"station","empresa":{"nome":"Positiva FM","logo":null},"channels":[
              {"id":"first","user_id":"station","name":"Áudio","type":"audio_live","url":"https://radio.example/live"},
              {"id":"foreign","user_id":"other","name":"Outra rádio","type":"audio_live","url":"https://radio.example/listen"},
              {"id":"inactive","active":false,"name":"Inativo","type":"audio_live","url":"https://radio.example/old"},
              {"id":"invalid","name":"Sem sinal","type":"audio_live","url":null}
            ]}
        """.trimIndent()))
        assertEquals("station", result.ownerId)
        assertEquals("Positiva FM", result.name)
        assertNull(result.logoUrl)
        assertEquals(listOf("first"), result.channels.map { it.id })
    }

    @Test
    fun claimedProfileIsOnlyDisplayDataEvenWhenAccountWasLinked() {
        val result = PairingStatus.fromJson(JSONObject("""
            {"ok":true,"row":{"status":"claimed","paired_user_id":"listener","paired_email":"listener@example.org",
              "paired_name":"Ouvinte","paired_avatar":null}}
        """.trimIndent()))
        assertEquals(PairingStatus.ClaimedProfile("Ouvinte", null, guest = false), result)
    }

    @Test
    fun statusSeparatesGuestExpiryAndFailures() {
        fun parse(json: String) = PairingStatus.fromJson(JSONObject(json))
        assertEquals(PairingStatus.ClaimedProfile(null, null, guest = true),
            parse("""{"ok":true,"row":{"status":"claimed","paired_user_id":null,"paired_email":null}}"""))
        assertEquals(PairingStatus.Pending("2026-11-18T17:00:00Z"),
            parse("""{"ok":true,"row":{"status":"pending","expires_at":"2026-11-18T17:00:00Z"}}"""))
        assertEquals(PairingStatus.Expired, parse("""{"ok":true,"row":{"status":"expired"}}"""))
        assertEquals(PairingStatus.Unavailable("not_found"), parse("""{"ok":false,"reason":"not_found"}"""))
    }
}
