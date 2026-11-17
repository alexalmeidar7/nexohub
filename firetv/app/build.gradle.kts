plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "br.com.nexobrasil.nexoplayer.firetv"
    compileSdk = 35

    defaultConfig {
        applicationId = "br.com.nexobrasil.nexoplayer.positiva"
        minSdk = 23
        targetSdk = 28
        versionCode = 11
        versionName = "1.1.0"
        manifestPlaceholders["appIcon"] = "@mipmap/ic_launcher"
        manifestPlaceholders["appBanner"] = "@drawable/tv_banner"
        buildConfigField("String", "PLAYER_ORIGIN", "\"https://housemix.nexobrasil.net\"")
        buildConfigField("String", "SUPABASE_URL", "\"https://qazvgmgdidjhbvcuinpy.supabase.co\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"sb_publishable_BzjxF3H_PSgFYVA3OQIaoA_Pytdg2V3\"")
        buildConfigField("String", "STATION_SLUG", "\"positivafm\"")
        buildConfigField("String", "STATION_NAME", "\"Positiva FM\"")
        buildConfigField("String", "PAIR_ORIGIN", "\"https://nexobrasil.net\"")
    }

    buildFeatures {
        buildConfig = true
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    flavorDimensions += "station"
    productFlavors {
        create("positiva") {
            dimension = "station"
            applicationId = "br.com.nexobrasil.nexoplayer.positiva"
            resValue("string", "app_name", "Positiva FM")
            manifestPlaceholders["appIcon"] = "@drawable/tv_launcher"
            manifestPlaceholders["appBanner"] = "@drawable/tv_launcher"
        }
        create("interativa") {
            dimension = "station"
            applicationId = "br.com.nexobrasil.nexoplayer.interativa"
            resValue("string", "app_name", "Interativa FM")
            buildConfigField("String", "STATION_SLUG", "\"interativafm\"")
            buildConfigField("String", "STATION_NAME", "\"Interativa FM\"")
        }
    }

    dependenciesInfo { includeInApk = false }
}
