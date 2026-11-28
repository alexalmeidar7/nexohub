package br.com.nexobrasil.nexoplayer.nativecore
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
class NativeBreakEntryTest{
 @Test fun detectsOnlyExactBreakMetadata(){assertTrue(isNativeBreak(JSONObject().put("titulo"," break ")));assertTrue(isNativeBreak(JSONObject().put("artista","BREAK")));assertFalse(isNativeBreak(JSONObject().put("titulo","Break My Heart")));assertFalse(isNativeBreak(null))}
}
