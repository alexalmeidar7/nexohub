package br.com.nexobrasil.nexoplayer.nativecore

import androidx.compose.runtime.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.Alignment
import androidx.compose.ui.geometry.Offset
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.math.*
import org.json.JSONObject

internal val LocalNexoRewards=compositionLocalOf<NativeRewardState?>{null}
internal fun nativePointsLabel(value:Double)=if(value%1.0==0.0)value.toLong().toString()else String.format(java.util.Locale("pt","BR"),"%.1f",value)
internal class NativeRewardState(private val services:NativeServices,private val owner:String,private val profile:String){
    var total by mutableStateOf<Double?>(null);private set
    var serial by mutableIntStateOf(0);private set
    var source by mutableStateOf(Offset(1580f,490f));private set
    var gained by mutableDoubleStateOf(0.0);private set
    private val historyItems=linkedSetOf<String>()
    private var historyBusy=false
    suspend fun visitHistory(item:JSONObject){
        val id=listOf(item.str("dia"),item.str("horario"),item.str("musica"),item.str("artista")).joinToString("|")
        if(item.str("musica").isBlank())return
        historyItems.add(id)
        if(historyItems.size<8||historyBusy)return
        historyBusy=true
        val batch=historyItems.take(8)
        try{val before=total?:read();val after=services.historyReward(owner,batch,profile);total=after;historyItems.removeAll(batch.toSet());if(before!=null&&after>before){gained=after-before;source=Offset(1580f,490f);serial++}}catch(e:CancellationException){throw e}catch(_:Exception){}finally{historyBusy=false}
    }
    suspend fun read():Double?{
        return try{services.pointsTotal(owner,profile).also{total=it}}catch(e:CancellationException){throw e}catch(_:Exception){null}
    }
    suspend fun confirm(before:Double?,x:Float,y:Float){
        val after=read()
        if(before!=null&&after!=null&&after>before){gained=after-before;source=Offset(x,y);serial++}
    }
}
@Composable internal fun NativeRewardOverlay(u:TvUnits,state:NativeRewardState?,screen:Screen,accent:Color){
    if(state==null)return
    val serial=state.serial
    val motion=remember{Animatable(0f)}
    var active by remember{mutableStateOf(false)}
    var badge by remember{mutableStateOf(false)}
    LaunchedEffect(serial){
        if(serial==0)return@LaunchedEffect
        active=true;badge=true;motion.snapTo(0f)
        kotlinx.coroutines.coroutineScope{launch{launchChime()};motion.animateTo(1f,tween(1100,easing=FastOutSlowInEasing))}
        active=false;delay(2600);badge=false
    }
    val target=if(screen==Screen.HOME)Offset(146f,650f)else Offset(1775f,108f)
    if(active)Canvas(Modifier.fillMaxSize()){
        val xScale=size.width/1920f;val yScale=size.height/1080f
        for(i in 0..4){
            val t=((motion.value-i*.055f)/.78f).coerceIn(0f,1f)
            val px=(state.source.x+(target.x-state.source.x)*t+(i-2)*28f*sin(t*PI).toFloat())*xScale
            val py=(state.source.y+(target.y-state.source.y)*t-85f*sin(t*PI).toFloat())*yScale
            val radius=(11f+9f*sin(t*PI).toFloat())*xScale
            if(t>0f&&t<1f){
                val path=Path()
                for(j in 0..9){val angle=-PI/2+j*PI/5;val r=if(j%2==0)radius else radius*.45f;val x=px+cos(angle).toFloat()*r;val y=py+sin(angle).toFloat()*r;if(j==0)path.moveTo(x,y)else path.lineTo(x,y)}
                path.close();drawPath(path,accent)
            }
        }
    }
    if(badge&&state.total!=null&&screen!=Screen.PROFILE){
        Box(u.at(if(screen==Screen.HOME)90 else 1640,if(screen==Screen.HOME)565 else 27,200,42).background(accent,u.round(22)),contentAlignment=Alignment.Center){Copy("+"+nativePointsLabel(state.gained)+"  •  "+nativePointsLabel(state.total!!)+" pts",u,17,600,color=if(BuildConfig.STATION_SLUG=="interativafm")Color.Black else Color.White)}
    }
}
private suspend fun launchChime()=withContext(Dispatchers.IO){
    runCatching{
        val rate=22050;val samples=ShortArray((rate*.34).toInt())
        val frequencies=doubleArrayOf(880.0,1174.66,1567.98)
        samples.indices.forEach{i->val t=i.toDouble()/rate;var v=0.0;frequencies.forEachIndexed{j,hz->val x=t-j*.065;if(x in 0.0..0.2){val gain=if(x<.018).035*x/.018 else .035*exp(-26*(x-.018));v+=sin(2*PI*hz*x)*gain}};samples[i]=(v*32767).toInt().coerceIn(-32767,32767).toShort()}
        val track=android.media.AudioTrack.Builder().setAudioAttributes(android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_GAME).setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION).build()).setAudioFormat(android.media.AudioFormat.Builder().setSampleRate(rate).setEncoding(android.media.AudioFormat.ENCODING_PCM_16BIT).setChannelMask(android.media.AudioFormat.CHANNEL_OUT_MONO).build()).setBufferSizeInBytes(samples.size*2).setTransferMode(android.media.AudioTrack.MODE_STATIC).build()
        try{track.write(samples,0,samples.size);track.play();delay(360)}finally{track.release()}
    }
}

@Composable internal fun NativeRewardHost(services:NativeServices,owner:String?,account:JSONObject?,screen:Screen,profile:String="",content:@Composable ()->Unit){
    val user=account.str("id")
    val state=remember(owner,user,profile){if(owner.isNullOrBlank()||user.isBlank())null else NativeRewardState(services,owner,profile)}
    LaunchedEffect(state,screen==Screen.PROFILE){state?.read()}
    CompositionLocalProvider(LocalNexoRewards provides state,content=content)
}
