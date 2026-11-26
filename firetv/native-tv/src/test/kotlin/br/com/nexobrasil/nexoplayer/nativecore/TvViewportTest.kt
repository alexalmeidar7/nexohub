package br.com.nexobrasil.nexoplayer.nativecore

import androidx.compose.ui.unit.Density
import org.junit.Assert.assertEquals
import org.junit.Test

class TvViewportTest {
    @Test
    fun fullHdAndHdKeepReferenceProportions() {
        assertEquals(1f, referenceScale(1920f, 1080f), 0.0001f)
        assertEquals(2f / 3f, referenceScale(1280f, 720f), 0.0001f)
        assertEquals(1f, referenceScale(2048f, 1080f), 0.0001f)
    }

    @Test
    fun referenceTextMeasuresTheSamePhysicalSizeDespiteUserFontScale() {
        val density = Density(density = 2f, fontScale = 1.3f)
        val units = TvUnits(1f, density)
        assertEquals(50f, with(density) { units.space(50).toPx() }, 0.001f)
        assertEquals(24f, with(density) { units.text(24).toPx() }, 0.001f)
    }
}
