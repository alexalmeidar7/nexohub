plugins {
    id("com.android.application") version "8.7.3"
    id("org.jetbrains.kotlin.android") version "2.0.21"
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.21"
}

val referenceResources = layout.buildDirectory.dir("generated/reference-resources")
val stageReferenceResources by tasks.registering(Sync::class) {
    into(referenceResources)
    from("../../public/logos/nexo-positiva-splash-v17.png") { into("drawable-nodpi"); rename { "splash_positiva.png" } }
    from("../../public/logos/interativa.png") { into("drawable-nodpi"); rename { "splash_interativa.png" } }
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

android {
    namespace = "br.com.nexobrasil.nexoplayer.nativecore"
    compileSdk = 35
    defaultConfig {
        applicationId = "br.com.nexobrasil.nexoplayer.nativepilot"
        minSdk = 26
        targetSdk = 35
        versionCode = 4
        versionName = "0.1.3-native-preview"
        buildConfigField("String", "SUPABASE_URL", "\"https://qazvgmgdidjhbvcuinpy.supabase.co\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"sb_publishable_BzjxF3H_PSgFYVA3OQIaoA_Pytdg2V3\"")
    }
    flavorDimensions += "station"
    productFlavors {
        create("positiva") {
            dimension = "station"
            applicationIdSuffix = ".positiva"
            resValue("string", "app_name", "Positiva FM Nativo (teste)")
            buildConfigField("String", "STATION_SLUG", "\"positivafm\"")
            buildConfigField("String", "STATION_NAME", "\"Positiva FM\"")
        }
        create("interativa") {
            dimension = "station"
            applicationIdSuffix = ".interativa"
            resValue("string", "app_name", "Interativa FM Nativo (teste)")
            buildConfigField("String", "STATION_SLUG", "\"interativafm\"")
            buildConfigField("String", "STATION_NAME", "\"Interativa FM\"")
        }
    }
    buildFeatures { compose = true; buildConfig = true }
    sourceSets.getByName("main").res.srcDir(referenceResources)
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
    implementation("androidx.tv:tv-material:1.0.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
