package br.com.nexobrasil.nexoplayer.nativecore
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
class NativeInteractionPolishTest{
 @Test fun chatAdsBetweenEachEightMessagesRotate(){
  val messages=(1..26).map{JSONObject().put("id",it.toString())}
  val ads=(1..2).map{JSONObject().put("url","https://example.com/$it")}
  val rows=nativeChatRows(messages,ads)
  assertEquals(listOf(8,17,26),rows.mapIndexedNotNull{i,r->i.takeIf{r.ad}})
  assertEquals(listOf(ads[0],ads[1],ads[0]),rows.filter{it.ad}.map{it.media})
  assertEquals(26,nativeChatRows(messages,emptyList()).size)
  assertEquals(8,nativeChatRows(messages.take(8),ads).size)
 }
 @Test fun forecastLabelsInPortuguese(){
  assertEquals("27/11" to "sexta-feira",forecastDayLabel("2026-11-27"))
  assertEquals("28/11" to "sábado",forecastDayLabel("2026-11-28"))
 }
}
