package br.com.nexobrasil.nexoplayer.nativecore
import org.junit.Assert.*
import org.junit.Test
class NativePrerollFrequencyTest {
    @Test fun audioDoesNotBlockFirstVideo(){
        val f=NativePrerollFrequency()
        assertTrue(f.eligible("preroll_audio","a",1000))
        f.enter("preroll_audio","a");f.played("preroll_audio",1000);f.home()
        assertTrue(f.eligible("preroll_video","v",2000))
        f.enter("preroll_video","v");f.played("preroll_video",2000)
        assertFalse(f.eligible("preroll_video","v2",3000))
        assertTrue(f.eligible("preroll_video","v2",902000))
    }
    @Test fun failedAdDoesNotSpendBudget(){
        val f=NativePrerollFrequency()
        f.enter("preroll_video","v");f.home()
        assertTrue(f.eligible("preroll_video","v",3000))
    }
    @Test fun homeReturnDoesNotRepeatAlreadyPlayedAd(){
        val f=NativePrerollFrequency()
        f.enter("preroll_audio","a");f.played("preroll_audio",1000);f.home()
        assertFalse(f.eligible("preroll_audio","a",999999))
    }
}
