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
        versionCode = 4
        versionName = "1.3.0"
        buildConfigField("String", "PLAYER_START_URL", "\"https://nexobrasil.net/positivafm/player/tv\"")
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}
