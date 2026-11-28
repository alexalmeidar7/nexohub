package br.com.nexobrasil.nexoplayer.nativecore
import org.json.JSONObject
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test
class NativeAccountCreativeTest{
 @Test fun usesGoogleIdentityPhotoAndMetadataFallback(){
  val a=JSONObject().put("user_metadata",JSONObject().put("picture","https://example.com/meta.jpg")).put("identities",JSONArray().put(JSONObject().put("provider","google").put("identity_data",JSONObject().put("picture","https://example.com/google.jpg"))))
  assertEquals("https://example.com/google.jpg",nativeGooglePhoto(a));assertEquals("",nativeGooglePhoto(null))
 }
 @Test fun musicCardUsesCampaignFieldsAndOptionalQr(){
  val d=smartCreativeDetails(JSONObject().put("categoryKind","music").put("song","Faixa").put("artist","Artista").put("artistImage","https://example.com/photo.jpg"))
  assertTrue(d.music);assertTrue(d.hasMusic);assertEquals("Faixa",d.song);assertEquals("",d.link)
  assertFalse(smartCreativeDetails(JSONObject()).hasMusic)
 }
}
