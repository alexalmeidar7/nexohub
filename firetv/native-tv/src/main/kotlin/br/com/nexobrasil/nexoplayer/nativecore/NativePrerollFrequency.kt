package br.com.nexobrasil.nexoplayer.nativecore

/** Audio and video each get a first eligible ad, with a separate 15-min budget.
 * Never count a failed download as an impression or interrupt live by timer. */
internal class NativePrerollFrequency {
    private data class Budget(var lastAdAt:Long=0L,var lastChannel:String="",var fromHome:Boolean=true)
    private val budgets=mutableMapOf<String,Budget>()
    private fun get(placement:String)=budgets.getOrPut(placement){Budget()}
    fun eligible(placement:String,channel:String,now:Long):Boolean{
        val state=get(placement)
        return state.lastAdAt==0L||(!state.fromHome&&state.lastChannel.isNotBlank()&&state.lastChannel!=channel&&now-state.lastAdAt>=900000L)
    }
    fun enter(placement:String,channel:String){val b=get(placement);b.lastChannel=channel;b.fromHome=false}
    fun played(placement:String,now:Long){if(placement.isNotBlank())get(placement).lastAdAt=now}
    fun home(){budgets.values.forEach{it.fromHome=true}}
}
