plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}
android {
    namespace = "br.com.nexobrasil.nexoplayer.firetv"
    compileSdk = 35
    defaultConfig {
        applicationId = "br.com.nexobrasil.nexoplayer.firetv"
        minSdk = 23
        targetSdk = 28
        versionCode = 1
        versionName = "1.0.0"
        buildConfigField("String", "PLAYER_START_URL", "\"https://nexohub.lovable.app/positivafm/player/app?tv=1\"")
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}
