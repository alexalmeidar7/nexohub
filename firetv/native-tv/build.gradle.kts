plugins {
    id("com.android.library") version "8.7.3"
    id("org.jetbrains.kotlin.android") version "2.0.21"
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.21"
}

val referenceResources = layout.buildDirectory.dir("generated/reference-resources")
val stageReferenceResources by tasks.registering(Sync::class) {
    into(referenceResources)
    from("../../public/fonts/Roboto.ttf") {
        into("font")
        rename { "ott_roboto.ttf" }
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
    defaultConfig { minSdk = 26 }
    buildFeatures { compose = true }
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
    implementation("androidx.tv:tv-material:1.0.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
