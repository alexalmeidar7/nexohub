package br.com.nexobrasil.nexoplayer.nativecore
import org.json.JSONObject
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test
class NativeInteractionAdsTest {
 @Test fun placementsMatchExistingCampaignFormats(){
  assertEquals("lyrics_ads",nativeInteractionPlacement("lyrics"));assertEquals("chat_ads",nativeInteractionPlacement("chat"));assertEquals("poll_ads",nativeInteractionPlacement("poll"));assertEquals("poll_ads",nativeInteractionPlacement("battle"));assertEquals("weather_ads",nativeInteractionPlacement("weather"));assertEquals("",nativeInteractionPlacement("cep"))
 }
 @Test fun filtersCampaignDateProgramAndMedia(){
  fun campaign(id:String,program:String,date:String,url:String)=JSONObject().put("id",id).put("start_date",date).put("end_date","2026-12-31").put("program_ids",JSONArray().put(program)).put("media",JSONArray().put(JSONObject().put("placement","chat_ads").put("url",url)))
  val rows=listOf(campaign("a","p","2026-11-01","https://example.com/ok.png"),campaign("b","other","2026-11-01","https://example.com/other.png"),campaign("c","p","2026-12-01","https://example.com/future.png"),campaign("d","p","2026-11-01",""))
  assertEquals(listOf("https://example.com/ok.png"),nativeInteractionAds(rows,"2026-11-27","p")["chat_ads"]?.map{it.str("url")})
 }
 @Test fun countdownMatchesTenSecondDisplay(){
  assertEquals(0f,homeBackgroundAdProgress(11000L,1000L),0.001f);assertEquals(.5f,homeBackgroundAdProgress(11000L,6000L),0.001f);assertEquals(1f,homeBackgroundAdProgress(11000L,12000L),0.001f)
 }
}
