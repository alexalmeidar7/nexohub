package br.com.nexobrasil.nexoplayer.nativecore
import org.junit.Assert.*
import org.junit.Test
class NativeSmartSyncTest{
    private val now=1700000000000L
    private fun item(title:String,start:Long)=SyncTrack(title,"Artista",start,now,title,"")
    @Test fun hlsUsesEachPlaybackClockNotFixedDelay(){
        for(delay in listOf(2500L,10000L,21000L)){
            val s=NativeSmartSync<String>()
            s.accept(item("Anterior",now-60000));s.accept(item("Nova",now))
            assertEquals("Anterior",s.resolve(now+delay-1,now+delay-1,1000,true,now-1,null).track?.title)
            assertEquals("Nova",s.resolve(now+delay,now+delay,1001,true,now,null).track?.title)
        }
    }
    @Test fun shortPdtLossDoesNotReleaseFutureMetadata(){
        val s=NativeSmartSync<String>()
        s.accept(item("Anterior",now-60000));s.accept(item("Nova",now))
        s.resolve(now,now,1000,true,now-5000,null)
        assertEquals("Anterior",s.resolve(now+1000,now+1000,2000,true,null,null).track?.title)
    }
    @Test fun matchesTimedMetadataAndAdvancesWithMediaPosition(){
        val s=NativeSmartSync<String>()
        s.accept(item("Anterior",now-60000));s.accept(item("Nova",now))
        s.resolve(now,now,1000,true,null,null)
        s.timedMetadata(SyncSignal("Artista - Nova","",11000,now+10000))
        val a=s.resolve(now+10000,now+10000,11000,true,null,null)
        assertEquals("Nova",a.track?.title);assertEquals(10,a.status.delaySeconds)
        s.accept(item("Seguinte",now+30000))
        assertEquals("Nova",s.resolve(now+40000,now+40000,40000,true,null,null).track?.title)
        assertEquals("Seguinte",s.resolve(now+41000,now+41000,41000,true,null,null).track?.title)
    }
    @Test fun unclockedStreamRecoversInsteadOfFreezing(){
        val s=NativeSmartSync<String>()
        s.accept(item("Anterior",now-60000))
        assertEquals("Anterior",s.resolve(now,now,0,true,null,null).track?.title)
        s.accept(item("Nova",now))
        val next=s.resolve(now+3000,now+3000,3000,true,null,null)
        assertEquals("Nova",next.track?.title);assertNull(next.epoch)
        s.accept(item("Antiga",now-10000))
        assertEquals("Nova",s.resolve(now+4000,now+4000,4000,true,null,null).track?.title)
    }
    @Test fun manualIsLocalAndPlaybackResetDropsLearnedClock(){
        val s=NativeSmartSync<String>()
        s.accept(item("Anterior",now-60000));s.accept(item("Nova",now))
        assertEquals("Anterior",s.resolve(now,now,0,true,null,7000).track?.title)
        assertEquals("Nova",s.resolve(now+7000,now+7000,7000,true,null,7000).track?.title)
        s.resetPlayback();s.accept(item("Seguinte",now+8000))
        assertEquals("Nova",s.resolve(now+8000,now+8000,0,true,null,null).track?.title)
    }
}
