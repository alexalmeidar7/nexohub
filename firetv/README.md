# Nexo Player for Amazon Fire TV

Dedicated Android WebView shell for Fire OS. Separate from House Mix Desktop and from the existing web player.

## First test device
- Amazon Fire TV Stick HD (1st generation)
- Fire OS 7.7.1.7
- Initial station: Positiva FM (slug: positivafm)

## Build
Run the GitHub Actions workflow "Build Nexo Player Fire TV APK", or locally:
    cd firetv
    gradle :app:assembleDebug

APK output: firetv/app/build/outputs/apk/debug/app-debug.apk

## Install over ADB
With the Fire Stick and computer on the same network and ADB debugging authorized:
    adb connect <FIRE_TV_IP>:5555
    adb install -r app-debug.apk

## Change the default station
Update PLAYER_START_URL in firetv/app/build.gradle.kts to the station's public Nexo Player TV route.

## Notes
- This first package is an online WebView shell and requires internet access.
- It does not bundle station data, media, or a local/offline player runtime.
- The debug APK is for controlled sideload testing. A signed release package and physical-device QA are still required before distribution.
- Validate remote navigation, stream playback, chat, QR pairing, and screen-saver behavior on the actual Fire TV Stick.
