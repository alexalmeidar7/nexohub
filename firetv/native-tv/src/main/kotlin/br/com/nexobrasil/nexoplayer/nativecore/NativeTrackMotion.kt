package br.com.nexobrasil.nexoplayer.nativecore

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.unit.Dp
import org.json.JSONObject

private val elegantEase=CubicBezierEasing(.16f,1f,.30f,1f)

@Composable internal fun NativeTrackText(u:TvUnits,title:String,artist:String,titleSize:Int,artistSize:Int,gap:Dp,lines:Int=1){
    Column(verticalArrangement=Arrangement.spacedBy(gap)){
        TrackMaskedLine(u,title,titleSize,700,0,lines)
        TrackMaskedLine(u,artist,artistSize,400,200,lines)
    }
}

@Composable private fun TrackMaskedLine(u:TvUnits,text:String,size:Int,weight:Int,delay:Int,lines:Int){
    val height=u.space(size*1.2f*lines)
    AnimatedContent(targetState=text,modifier=Modifier.fillMaxWidth().height(height).clipToBounds(),transitionSpec={
        (slideInVertically(tween(850,delayMillis=delay+220,easing=elegantEase)){it}+fadeIn(tween(520,delayMillis=delay+220))) togetherWith
        (slideOutVertically(tween(350,easing=elegantEase)){-it}+fadeOut(tween(250)))
    },label="maskedTrackLine"){value->Copy(value,u,size,weight,lines=lines)}
}

@Composable internal fun NativeAnimatedAudioCover(u:TvUnits,services:NativeServices,account:JSONObject?,owner:String,title:String,artist:String,cover:String,modifier:Modifier,buttonModifier:Modifier){
    val current=Triple(title,artist,cover)
    AnimatedContent(targetState=current,modifier=modifier,transitionSpec={
        ((slideInHorizontally(tween(1050,delayMillis=450,easing=elegantEase)){-it*2}+fadeIn(tween(600,delayMillis=450))) togetherWith
        (slideOutHorizontally(tween(600,easing=elegantEase)){-it*2}+fadeOut(tween(500)))).using(SizeTransform(clip=false))
    },label="audioCoverSlide"){item->
        NativeLike(u,services,account,owner,item.first,item.second,item.third,Modifier.fillMaxSize(),if(item==current)buttonModifier else Modifier,enabled=item==current)
    }
}
