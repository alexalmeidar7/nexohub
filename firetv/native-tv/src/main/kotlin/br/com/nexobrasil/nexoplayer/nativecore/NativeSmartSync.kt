package br.com.nexobrasil.nexoplayer.nativecore

import java.text.Normalizer
import java.util.Locale

/** The metadata history is independent of the playback session. Never use a fixed network delay. */
internal data class SyncTrack<T>(val title:String,val artist:String,val start:Long,val received:Long,val content:T,val artwork:String)
internal data class SyncSignal(val title:String,val artist:String,val position:Long,val received:Long)
internal data class SyncStatus(val mode:String="Aguardando reprodução",val delaySeconds:Int?=null)
internal data class SyncResult<T>(val track:SyncTrack<T>?,val epoch:Long?,val status:SyncStatus)
internal class NativeSmartSync<T>{
    private val tracks=mutableListOf<SyncTrack<T>>()
    private var shown:SyncTrack<T>?=null
    private var signal:SyncSignal?=null
    private var anchor:Pair<Long,Long>?=null // music source epoch, media position
    private var manualAnchor:Pair<Long,Long>?=null
    private var manualValue:Long?=null
    private var lastPosition:Long?=null
    private var lastPdtAt:Long?=null
    private var missingSince:Long?=null
    private fun norm(s:String)=Normalizer.normalize(s,Normalizer.Form.NFD).replace(Regex("\\p{M}+"),"").lowercase(Locale.ROOT).replace(Regex("[^\\p{L}\\p{N}]+")," ").trim()
    private fun same(a:SyncTrack<T>,b:SyncTrack<T>)=norm(a.title)==norm(b.title)&&norm(a.artist)==norm(b.artist)
    private fun sameEvent(a:SyncTrack<T>,b:SyncTrack<T>)=same(a,b)&&(a.start==b.start||a.start==0L||b.start==0L)
    fun resetPlayback(){signal=null;anchor=null;manualAnchor=null;manualValue=null;lastPosition=null;lastPdtAt=null;missingSince=null}
    fun clear(){tracks.clear();shown=null;resetPlayback()}
    fun accept(item:SyncTrack<T>){
        if(item.title.isBlank())return
        val last=tracks.lastOrNull()
        if(last!=null&&item.start>0&&last.start>0&&item.start<last.start)return
        if(last!=null&&sameEvent(last,item)){
            tracks[tracks.lastIndex]=item.copy(start=item.start.takeIf{it>0}?:last.start,received=last.received,artwork=item.artwork.ifBlank{last.artwork})
        }else{
            tracks.add(item)
            if(tracks.size>48)tracks.removeAt(0)
        }
    }
    fun enrich(title:String,artist:String,start:Long,art:String){
        if(art.isBlank())return
        val i=tracks.indexOfLast{it.title==title&&it.artist==artist&&(start<=0||it.start==start)}
        if(i>=0)tracks[i]=tracks[i].copy(artwork=art)
    }
    fun timedMetadata(value:SyncSignal){
        if(value.title.isBlank())return
        val old=signal
        if(old!=null&&norm(old.title)==norm(value.title)&&norm(old.artist)==norm(value.artist))return
        signal=value
    }
    private fun matches(s:SyncSignal,t:SyncTrack<T>):Boolean{
        val x=norm(s.title);val title=norm(t.title);val artist=norm(t.artist)
        if(x.isBlank()||title.isBlank())return false
        if(s.artist.isNotBlank())return x==title&&norm(s.artist)==artist
        return artist.isNotBlank()&&(x==norm(t.artist+" "+t.title)||x==norm(t.title+" "+t.artist))
    }
    fun latestStart():Long?=tracks.lastOrNull()?.start?.takeIf{it>0}
    fun resolve(now:Long,serverNow:Long,position:Long,playing:Boolean,pdt:Long?,manual:Long?):SyncResult<T>{
        val previous=lastPosition
        if(previous!=null&&position+1000<previous)resetPlayback()
        lastPosition=position
        val validPdt=pdt?.takeIf{serverNow-it in -2000L..120000L}
        if(validPdt!=null&&playing){lastPdtAt=now}
        if(!playing)return SyncResult(shown,null,SyncStatus("Aguardando reprodução"))
        val event=signal
        if(event!=null&&now-event.received in 0L..120000L){
            val match=tracks.lastOrNull{matches(event,it)&&it.start>0&&serverNow-it.start in -2000L..180000L}
            if(match!=null){
                val atEvent=serverNow-(now-event.received)
                if(atEvent-match.start in -2000L..120000L){
                    anchor=match.start to event.position
                    signal=null
                }
            }
        }
        val timedEpoch=anchor?.let{(start,pos)->(start+position-pos).takeIf{serverNow-it in -2000L..120000L}}
        if(manualValue!=manual){manualValue=manual;manualAnchor=null}
        if(manual!=null&&manualAnchor==null)manualAnchor=(serverNow-manual) to position
        val manualEpoch=manualAnchor?.let{(start,pos)->start+position-pos}
        val hold=lastPdtAt?.let{now-it<2000L}==true
        val mode=when{
            validPdt!=null->"Automático · HLS"
            hold->"Aguardando relógio HLS"
            timedEpoch!=null->"Automático · metadados do streaming"
            manualEpoch!=null->"Calibração local"
            else->"Sem referência temporal"
        }
        val epoch=when(mode){
            "Automático · HLS"->validPdt
            "Automático · metadados do streaming"->timedEpoch
            "Calibração local"->manualEpoch
            else->null
        }
        if(epoch!=null){
            missingSince=null
            // Keep the most recent eligible song, including after a channel switch or reconnect.
            val ready=tracks.lastOrNull{
                val start=it.start.takeIf{s->s>0&&s<=serverNow+1000L&&serverNow-s<86400000L}
                if(start!=null)start<=epoch else if(manual!=null&&mode=="Calibração local")it.received+(serverNow-now)<=epoch else false
            }
            if(ready!=null)shown=ready
        }else if(!hold){
            // An unclocked stream cannot guarantee sync. Keep the UI live rather than freezing forever.
            val since=missingSince?:now.also{missingSince=it}
            if(shown==null||now-since>=3000L)shown=tracks.lastOrNull()?:shown
        }
        shown?.let{old->tracks.lastOrNull{sameEvent(old,it)}?.let{shown=it}}
        val seconds=epoch?.let{((serverNow-it).coerceAtLeast(0)/1000).toInt()}
        return SyncResult(shown,epoch,SyncStatus(if(mode=="Sem referência temporal")"Dados ao vivo · sem sincronização confirmada" else mode,seconds))
    }
}
