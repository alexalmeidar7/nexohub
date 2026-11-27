package br.com.nexobrasil.nexoplayer.nativecore

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.tv.material3.Text
import kotlinx.coroutines.delay

/** Geometry from Lote 16 SplashScreen.tsx; no remote image is required to show it. */
@Composable internal fun StartupSplash(stage: String) {
    var dot by remember { mutableIntStateOf(0) }
    LaunchedEffect(Unit) {
        while(true) { delay(500L); dot=(dot+1)%3 }
    }
    val logo=if(BuildConfig.STATION_SLUG=="positivafm") R.drawable.splash_positiva else R.drawable.splash_interativa
    TvViewport(Modifier.background(Color.Black)) { u ->
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            Image(painterResource(logo),contentDescription="Logo da emissora",
                modifier=Modifier.offset(u.space(768),u.space(313.2)).size(u.space(384),u.space(356.4)),
                contentScale=ContentScale.Fit)
            Row(Modifier.offset(y=u.space(766.8)).fillMaxWidth(),
                horizontalArrangement=Arrangement.Center,verticalAlignment=Alignment.CenterVertically) {
                Text("carregando sua experiência ",color=Color.White,style=u.referenceText(29.76,400))
                repeat(3) { index ->
                    val alpha by animateFloatAsState(if(index==dot) 1f else .2f,tween(230),label="dot")
                    Text(".",modifier=Modifier.alpha(alpha),color=Color.White,style=u.referenceText(29.76,400))
                }
            }
            Text(stage,modifier=Modifier.offset(y=u.space(815)).fillMaxWidth().semantics { liveRegion=LiveRegionMode.Polite },
                color=Color.White.copy(alpha=.60f),style=u.referenceText(18,400),textAlign=TextAlign.Center)
            Image(painterResource(R.drawable.splash_company),contentDescription="Nexo Brasil",modifier=Modifier.align(Alignment.BottomCenter).padding(bottom=u.space(80)).size(u.space(132),u.space(42)),contentScale=ContentScale.Fit)
            Text("desenvolvido por Nexo Brasil - Copyrighted 2026/2027",
                modifier=Modifier.align(Alignment.BottomCenter).padding(bottom=u.space(51.84)),
                color=Color.White.copy(alpha=.5f),style=u.referenceText(18.24,400),textAlign=TextAlign.Center)
        }
    }
}
