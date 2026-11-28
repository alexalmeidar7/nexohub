package br.com.nexobrasil.nexoplayer.nativecore

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.translate
import kotlin.math.*

/** Flat monochrome weather pictograms; motion is limited to rays and precipitation. */
@Composable internal fun NativeWeatherIcon(code:Int,modifier:Modifier,isDay:Boolean=true){
    val transition=rememberInfiniteTransition(label="weather")
    val phase by transition.animateFloat(0f,1f,infiniteRepeatable(tween(2200,easing=LinearEasing),RepeatMode.Restart),label="weatherMotion")
    Canvas(modifier){
        val d=minOf(size.width,size.height)
        if(d<=0f)return@Canvas
        val ox=(size.width-d)/2
        val oy=(size.height-d)/2
        fun p(x:Float,y:Float)=Offset(ox+d*x,oy+d*y)
        val stroke=Stroke(d*.065f,cap=StrokeCap.Round,join=StrokeJoin.Round)
        fun line(a:Offset,b:Offset)=drawLine(Color.White,a,b,d*.065f,StrokeCap.Round)
        fun sun(x:Float,y:Float,r:Float){
            val center=p(x,y)
            if(isDay){
                drawCircle(Color.White,d*r,center,style=stroke)
                rotate(phase*45f,center){repeat(8){i->val angle=i*PI/4;val vx=cos(angle).toFloat();val vy=sin(angle).toFloat();line(p(x+vx*(r+.065f),y+vy*(r+.065f)),p(x+vx*(r+.14f),y+vy*(r+.14f)))}}
            }else{
                val moon=Path().apply{moveTo(p(x+.02f,y-r).x,p(x+.02f,y-r).y);cubicTo(p(x-r*1.5f,y-r*.7f).x,p(x-r*1.5f,y-r*.7f).y,p(x-r*1.25f,y+r*1.35f).x,p(x-r*1.25f,y+r*1.35f).y,p(x+r,y+r*.55f).x,p(x+r,y+r*.55f).y);cubicTo(p(x-r*.15f,y+r*.6f).x,p(x-r*.15f,y+r*.6f).y,p(x-r*.5f,y-r*.25f).x,p(x-r*.5f,y-r*.25f).y,p(x+.02f,y-r).x,p(x+.02f,y-r).y);close()}
                drawPath(moon,Color.White)
            }
        }
        fun cloud(y:Float=0f){
            val outline=Path().apply{
                fun move(x:Float,v:Float){val q=p(x,v+y);moveTo(q.x,q.y)}
                fun curve(a:Float,b:Float,c:Float,e:Float,g:Float,h:Float){val q=p(a,b+y);val r=p(c,e+y);val s=p(g,h+y);cubicTo(q.x,q.y,r.x,r.y,s.x,s.y)}
                move(.27f,.73f)
                curve(.03f,.73f,.04f,.43f,.26f,.40f)
                curve(.31f,.12f,.65f,.12f,.72f,.37f)
                curve(.99f,.33f,1f,.73f,.75f,.73f)
                val q=p(.27f,.73f+y);lineTo(q.x,q.y);close()
            }
            drawPath(outline,Color.White,style=stroke)
        }
        when{
            code in 0..1->sun(.5f,.5f,.22f)
            code==2->{sun(.67f,.30f,.12f);cloud(.06f)}
            code==45||code==48->{cloud(-.10f);repeat(2){i->val shift=sin((phase*2*PI+i).toDouble()).toFloat()*.04f;line(p(.19f+shift,.75f+i*.13f),p(.81f+shift,.75f+i*.13f))}}
            code in 71..77||code in 85..86->{cloud(-.12f);repeat(3){i->val x=.26f+i*.24f;val y=.76f+((phase+i*.3f)%1f)*.10f;drawCircle(Color.White,d*.038f,p(x,y))}}
            code>=95->{cloud(-.12f);val bolt=Path().apply{val a=p(.52f,.66f);moveTo(a.x,a.y);val b=p(.38f,.83f);lineTo(b.x,b.y);val c=p(.54f,.83f);lineTo(c.x,c.y);val e=p(.47f,.98f);lineTo(e.x,e.y)};drawPath(bolt,Color.White.copy(alpha=.72f+.28f*sin(phase*PI).toFloat()),style=stroke)}
            code in 51..67||code in 80..82->{cloud(-.12f);repeat(3){i->val x=.29f+i*.23f;val y=.70f+((phase+i*.25f)%1f)*.13f;line(p(x,y),p(x-.065f,y+.10f))}}
            else->cloud()
        }
    }
}
