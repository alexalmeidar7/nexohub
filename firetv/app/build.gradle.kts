plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "br.com.nexobrasil.nexoplayer.firetv"
    compileSdk = 35

    defaultConfig {
        applicationId = "br.com.nexobrasil.nexoplayer.positiva"
        minSdk = 23
        targetSdk = 28
        versionCode = 10
        versionName = "1.0.5"
        buildConfigField("String", "SUPABASE_URL", "\"https://qazvgmgdidjhbvcuinpy.supabase.co\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"sb_publishable_BzjxF3H_PSgFYVA3OQIaoA_Pytdg2V3\"")
        buildConfigField("String", "STATION_SLUG", "\"positivafm\"")
        buildConfigField("String", "STATION_NAME", "\"Positiva FM\"")
        buildConfigField("String", "PAIR_ORIGIN", "\"https://housemix.nexobrasil.net\"")
    }

    buildFeatures {
        compose = true
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
            applicationId = "br.com.nexobrasil.nexoplayer.positiva.teste"
            resValue("string", "app_name", "Positiva FM (Teste)")
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

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)
    androidTestImplementation(composeBom)
    implementation("androidx.activity:activity-compose:1.10.0")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("com.google.zxing:core:3.5.3")
    debugImplementation("androidx.compose.ui:ui-tooling")
}
