package br.com.nexobrasil.nexoplayer.nativecore

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp

const val REFERENCE_WIDTH = 1920
const val REFERENCE_HEIGHT = 1080

fun referenceScale(widthPx: Float, heightPx: Float): Float =
    minOf(widthPx / REFERENCE_WIDTH, heightPx / REFERENCE_HEIGHT)

data class TvUnits(
    val pixelsPerUnit: Float,
    private val density: Density,
) {
    fun space(units: Number) = (units.toFloat() * pixelsPerUnit / density.density).dp
    fun text(units: Number) = with(density) { space(units).toSp() }
}

@OptIn(ExperimentalTextApi::class)
private val referenceFont = FontFamily(
    listOf(400, 450, 500, 550, 600, 650, 700).map { weight ->
        Font(
            resId = R.font.ott_montserrat,
            weight = FontWeight(weight),
            variationSettings = FontVariation.Settings(FontVariation.weight(weight)),
        )
    }
)

fun TvUnits.referenceText(size: Number, weight: Int = 400) = TextStyle(
    fontFamily = referenceFont,
    fontWeight = FontWeight(weight),
    fontSize = text(size),
    lineHeight = text(size.toFloat() * 1.4f),
)

@Composable
fun TvViewport(modifier: Modifier = Modifier, content: @Composable (TvUnits) -> Unit) {
    BoxWithConstraints(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        val density = LocalDensity.current
        val units = TvUnits(
            referenceScale(constraints.maxWidth.toFloat(), constraints.maxHeight.toFloat()),
            density,
        )
        Box(Modifier.size(units.space(REFERENCE_WIDTH), units.space(REFERENCE_HEIGHT))) {
            content(units)
        }
    }
}
