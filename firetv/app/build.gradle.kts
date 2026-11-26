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
        versionCode = providers.gradleProperty("nexoVersionCode").orNull?.toInt() ?: 12
        versionName = providers.gradleProperty("nexoVersionName").orNull ?: "1.2.1"
        manifestPlaceholders["appIcon"] = "@mipmap/ic_launcher"
        manifestPlaceholders["appBanner"] = "@drawable/tv_banner"
        buildConfigField("String", "PLAYER_ORIGIN", "\"https://housemix.nexobrasil.net\"")
        buildConfigField("String", "SUPABASE_URL", "\"https://qazvgmgdidjhbvcuinpy.supabase.co\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"sb_publishable_BzjxF3H_PSgFYVA3OQIaoA_Pytdg2V3\"")
        buildConfigField("String", "STATION_SLUG", "\"positivafm\"")
        buildConfigField("String", "STATION_NAME", "\"Positiva FM\"")
        buildConfigField("String", "PAIR_ORIGIN", "\"https://nexobrasil.net\"")
    }

    buildTypes {
        getByName("debug") {
            buildConfigField("String", "PLAYER_ORIGIN", "\"http://127.0.0.1:8080\"")
        }
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
            buildConfigField("String", "STATION_SLUG", "\"positivafm\"")
            buildConfigField("String", "STATION_NAME", "\"Positiva FM\"")
            manifestPlaceholders["appIcon"] = "@mipmap/positiva_launcher"
            manifestPlaceholders["appBanner"] = "@drawable/positiva_tv_banner"
        }
        create("interativa") {
            dimension = "station"
            applicationId = "br.com.nexobrasil.nexoplayer.interativa"
            resValue("string", "app_name", "Interativa FM")
            manifestPlaceholders["appIcon"] = "@mipmap/interativa_launcher"
            manifestPlaceholders["appBanner"] = "@drawable/interativa_tv_banner"
            buildConfigField("String", "STATION_SLUG", "\"interativafm\"")
            buildConfigField("String", "STATION_NAME", "\"Interativa FM\"")
        }
    }

    dependenciesInfo { includeInApk = false }
}
