package br.com.nexobrasil.nexoplayer.nativecore
import org.junit.Assert.*
import org.junit.Test
class NativeSmartBreakTimingTest {
 @Test fun matchesSourceBreakClock(){val start=1700000000000L;val result=smartBreakTiming(start,430.0,start+182000L)!!;assertEquals(248L,result.second);assertEquals("04:08",formatSmartBreakTime(result.second));assertEquals(182f/430f,result.first,.001f)}
 @Test fun noInventedDurationOrStart(){assertNull(smartBreakTiming(0L,430.0,1L));assertNull(smartBreakTiming(1000L,0.0,2000L));assertEquals(0L,smartBreakTiming(1000L,430.0,500000L)!!.second)}
}
