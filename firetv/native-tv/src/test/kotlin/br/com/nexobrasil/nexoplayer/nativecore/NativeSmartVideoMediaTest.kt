package br.com.nexobrasil.nexoplayer.nativecore
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
class NativeSmartVideoMediaTest {
 @Test fun selectsVideoOnlyAndPreservesOrder(){
  fun media(placement:String,url:String,order:Int)=JSONObject().put("placement",placement).put("url",url).put("order",order)
  val audio=media("smart_break_audio","https://example.com/audio.mp3",0)
  val first=media("smart_break_video","https://example.com/a.mp4",1)
  val second=media("smart_break_video","https://example.com/b.mp4",2)
  val invalid=media("smart_break_video","",0)
  assertEquals(listOf(first,second),smartBreakVideoMedia(listOf(audio,second,invalid,first)))
  assertTrue(smartBreakVideoMedia(listOf(audio)).isEmpty())
 }
}
