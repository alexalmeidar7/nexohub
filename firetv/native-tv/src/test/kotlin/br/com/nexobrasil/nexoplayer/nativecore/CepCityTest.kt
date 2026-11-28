package br.com.nexobrasil.nexoplayer.nativecore
import org.json.JSONObject
import org.junit.Test
import org.junit.Assert.*
class CepCityTest {
    @Test fun acceptsLocalizedCountryWithoutCountryCode() {
        val row=JSONObject().put("name","Aparecida de Goiânia").put("admin1","Goiás").put("country","Brasil").put("latitude",-16.82).put("longitude",-49.24)
        assertSame(row,matchCepCity(listOf(row),"Aparecida de Goiania","Goias","GO"))
    }
    @Test fun rejectsWrongStateAndCountry() {
        val row=JSONObject().put("name","Goiânia").put("admin1","São Paulo").put("country","Brasil").put("latitude",-16.68).put("longitude",-49.25)
        assertNull(matchCepCity(listOf(row),"Goiânia","Goiás","GO"))
        row.put("admin1","Goiás").put("country","Argentina")
        assertNull(matchCepCity(listOf(row),"Goiânia","Goiás","GO"))
    }
}
