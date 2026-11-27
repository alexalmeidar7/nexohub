plugins {
    id("com.android.application") version "8.7.3"
    id("org.jetbrains.kotlin.android") version "2.0.21"
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.21"
}

val referenceResources = layout.buildDirectory.dir("generated/reference-resources")
val stageReferenceResources by tasks.registering(Sync::class) {
    into(referenceResources)
    from("../../public/logos/nexo-positiva-splash-v17.png") { into("drawable-nodpi"); rename { "splash_positiva.png" } }
    from("../app/src/interativa/res/drawable-nodpi/nexo_startup_logo.png") { into("drawable-nodpi"); rename { "splash_interativa.png" } }
    from("../../src/assets/logo-nexo-solucoes-visuais.png") { into("drawable-nodpi"); rename { "splash_company.png" } }
    from("../../src/components/player/tv/nexo-lote13-hotpark.png") { into("drawable-nodpi"); rename { "home_hotpark.png" } }
    from("../../public/avatars/usr-default.png") { into("drawable-nodpi"); rename { "visitor_avatar.png" } }
    (1..8).forEach { n ->
        from("../../public/avatars/usr-$n.png") { into("drawable-nodpi"); rename { "visitor_avatar_$n.png" } }
    }
    from("../app/src/positiva/res/drawable-nodpi/tv_launcher.png") {
        into("drawable-nodpi")
        rename { "positiva_tv_launcher.png" }
    }
}
tasks.matching { it.name == "preBuild" }.configureEach { dependsOn(stageReferenceResources) }

val permanentSigningPath = providers.environmentVariable("NEXO_TV_SIGNING_FILE").orNull
if (System.getenv("CI") == "true") {
    require(!permanentSigningPath.isNullOrBlank() && file(permanentSigningPath).isFile) {
        "Permanent Nexo TV signing keystore is required in CI."
    }
}

android {
    signingConfigs {
        if (!permanentSigningPath.isNullOrBlank()) {
            create("nexoPermanent") {
                storeFile = file(permanentSigningPath)
                storePassword = "android"
                keyAlias = "androiddebugkey"
                keyPassword = "android"
            }
        }
    }
    buildTypes {
        getByName("debug") {
            if (!permanentSigningPath.isNullOrBlank()) {
                signingConfig = signingConfigs.getByName("nexoPermanent")
            }
        }
    }
    namespace = "br.com.nexobrasil.nexoplayer.nativecore"
    compileSdk = 35
    defaultConfig {
        applicationId = "br.com.nexobrasil.nexoplayer.nativepilot"
        minSdk = 26
        targetSdk = 35
        versionCode = 16
        versionName = "0.1.15-native-preview"
        buildConfigField("String", "SUPABASE_URL", "\"https://qazvgmgdidjhbvcuinpy.supabase.co\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"sb_publishable_BzjxF3H_PSgFYVA3OQIaoA_Pytdg2V3\"")
    }
    flavorDimensions += "station"
    productFlavors {
        create("positiva") {
            dimension = "station"
            applicationIdSuffix = ".positiva"
            manifestPlaceholders["stationIcon"] = "@mipmap/positiva_launcher"
            manifestPlaceholders["stationBanner"] = "@drawable/native_tv_tile"
            resValue("string", "app_name", "Positiva FM Nativo (teste)")
            buildConfigField("String", "STATION_SLUG", "\"positivafm\"")
            buildConfigField("String", "STATION_NAME", "\"Positiva FM\"")
        }
        create("interativa") {
            dimension = "station"
            applicationIdSuffix = ".interativa"
            manifestPlaceholders["stationIcon"] = "@mipmap/interativa_launcher"
            manifestPlaceholders["stationBanner"] = "@drawable/native_tv_tile"
            resValue("string", "app_name", "Interativa FM Nativo (teste)")
            buildConfigField("String", "STATION_SLUG", "\"interativafm\"")
            buildConfigField("String", "STATION_NAME", "\"Interativa FM\"")
        }
    }
    buildFeatures { compose = true; buildConfig = true }
    sourceSets.getByName("main").res.srcDir(referenceResources)
    sourceSets.getByName("positiva").res.srcDir("../app/src/positiva/res")
    sourceSets.getByName("interativa").res.srcDir("../app/src/interativa/res")
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.media3:media3-exoplayer:1.5.1")
    implementation("androidx.media3:media3-exoplayer-hls:1.5.1")
    implementation("androidx.media3:media3-ui:1.5.1")
    implementation("io.coil-kt:coil-compose:2.7.0")
    implementation("com.google.zxing:core:3.5.3")
    implementation("androidx.tv:tv-material:1.0.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
