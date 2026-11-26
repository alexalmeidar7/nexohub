package br.com.nexobrasil.nexoplayer.nativecore

import org.json.JSONObject

data class StationChannel(val id: String, val name: String, val type: String, val url: String)

data class StationBootstrap(
    val ownerId: String,
    val name: String?,
    val logoUrl: String?,
    val channels: List<StationChannel>,
) {
    companion object {
        internal fun fromJson(payload: JSONObject): StationBootstrap {
            val ownerId = requireNotNull(payload.nonBlankText("userId")) { "Missing station owner" }
            val station = payload.optJSONObject("empresa")
            val channels = payload.optJSONArray("channels")
            return StationBootstrap(
                ownerId,
                station?.nonBlankText("nome"),
                station?.nonBlankText("logo"),
                buildList {
                    if (channels == null) return@buildList
                    for (index in 0 until channels.length()) {
                        val channel = channels.optJSONObject(index) ?: continue
                        if (channel.nonBlankText("user_id")?.let { it != ownerId } == true) continue
                        if (!channel.optBoolean("active", true)) continue
                        val id = channel.nonBlankText("id") ?: continue
                        val name = channel.nonBlankText("name") ?: continue
                        val type = channel.nonBlankText("type") ?: continue
                        val url = channel.nonBlankText("url") ?: continue
                        add(StationChannel(id, name, type, url))
                    }
                },
            )
        }
    }
}

sealed interface PairingStatus {
    data class Pending(val expiresAt: String?) : PairingStatus
    data object Expired : PairingStatus
    /** Profile display data from the claim. This response contains no Supabase session. */
    data class ClaimedProfile(val name: String?, val avatarUrl: String?, val guest: Boolean) : PairingStatus
    data class Unavailable(val reason: String?) : PairingStatus

    companion object {
        internal fun fromJson(payload: JSONObject): PairingStatus {
            if (!payload.optBoolean("ok")) return Unavailable(payload.nonBlankText("reason"))
            val row = payload.optJSONObject("row") ?: return Unavailable("missing_status")
            return when (row.nonBlankText("status")) {
                "pending" -> Pending(row.nonBlankText("expires_at"))
                "expired" -> Expired
                "claimed" -> ClaimedProfile(
                    row.nonBlankText("paired_name"),
                    row.nonBlankText("paired_avatar"),
                    guest = row.nonBlankText("paired_user_id") == null && row.nonBlankText("paired_email") == null,
                )
                else -> Unavailable("unknown_status")
            }
        }
    }
}

private fun JSONObject.nonBlankText(key: String): String? =
    (opt(key) as? String)?.takeIf { it.isNotBlank() }
