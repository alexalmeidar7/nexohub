package br.com.nexobrasil.nexoplayer.nativecore

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import kotlinx.coroutines.delay

@Composable internal fun rememberInteractivePrompt(eligible:Boolean,inputSerial:Int):State<Boolean>{
    val visible=remember{mutableStateOf(false)}
    LaunchedEffect(eligible,inputSerial){
        visible.value=false
        if(eligible)while(true){
            delay(90000L)
            visible.value=true
            delay(10000L)
            visible.value=false
            delay(0)
            // Start-to-start interval is 90 seconds.
            while(true){delay(80000L);visible.value=true;delay(10000L);visible.value=false}
        }
    }
    return visible
}

@Composable internal fun NativeInteractionInvitation(u:TvUnits,accent:Color,modifier:Modifier){
    val rotation=remember{Animatable(0f)}
    LaunchedEffect(Unit){while(true){rotation.snapTo(0f);rotation.animateTo(360f,tween(10000,easing=LinearEasing))}}
    val fg=if(BuildConfig.STATION_SLUG=="interativafm")android.graphics.Color.BLACK else android.graphics.Color.WHITE
    Canvas(modifier){
        val r=size.minDimension/2f
        val vibrant=if(BuildConfig.STATION_SLUG=="interativafm")Color(0xFF00E9FF) else Color(0xFFFF1744)
        drawCircle(vibrant,radius=r)
        drawCircle(Color(0xFF222222),radius=r*.69f)
        drawIntoCanvas{canvas->
            val c=canvas.nativeCanvas
            val p=android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply{color=fg;textSize=r*.14f;typeface=android.graphics.Typeface.create("sans-serif-medium",android.graphics.Typeface.NORMAL)}
            val text="CONTEÚDO INTERATIVO — PARTICIPE — "
            val radius=r*.82f
            p.textScaleX=(2f*Math.PI.toFloat()*radius/p.measureText(text)).coerceIn(.65f,1.8f)
            val path=android.graphics.Path().apply{addCircle(center.x,center.y,radius,android.graphics.Path.Direction.CW)}
            c.save();c.rotate(rotation.value,center.x,center.y);c.drawTextOnPath(text,path,0f,0f,p);c.restore()
        }
    }
}

@Composable internal fun rememberVideoPrompt(eligible:Boolean,busy:Boolean):State<Boolean>{
    val visible=remember{mutableStateOf(false)}
    val active by rememberUpdatedState(busy)
    LaunchedEffect(eligible){
        visible.value=false
        if(eligible){
            delay(10000L)
            var duration=30000L
            while(true){
                visible.value=true
                delay(duration)
                while(active)delay(250L)
                visible.value=false
                delay(240000L-duration)
                duration=20000L
            }
        }
    }
    return visible
}
