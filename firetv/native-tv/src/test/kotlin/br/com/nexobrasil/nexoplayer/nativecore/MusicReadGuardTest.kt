package br.com.nexobrasil.nexoplayer.nativecore
import org.junit.Assert.*
import org.junit.Test
class MusicReadGuardTest {
    @Test fun neverReducesWithoutProof(){val g=MusicReadGuard();assertEquals(2000L,g.interval(true,false));repeat(2){g.observe(true)};assertEquals(2000L,g.interval(true,false));g.observe(true);assertEquals(10000L,g.interval(true,false))}
    @Test fun fallbackOnMissOrBreak(){val g=MusicReadGuard();repeat(3){g.observe(true)};assertEquals(2000L,g.interval(false,false));assertEquals(2000L,g.interval(true,true));g.observe(false);assertEquals(2000L,g.interval(true,false))}
    @Test fun repeatedTitleIsDifferentEvent(){assertFalse(MusicEvent("A","B",1000).matches(MusicEvent("A","B",2000)));assertTrue(MusicEvent("A","B",1000).matches(MusicEvent("a","b",1000)))}
}