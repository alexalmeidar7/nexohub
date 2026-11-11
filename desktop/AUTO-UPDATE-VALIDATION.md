# House Mix Desktop — Auto Update

The desktop application uses electron-updater with GitHub Releases.

Validation scope:
- Windows x64 NSIS installer
- Automatic update download when online
- Install on application exit
- Offline startup remains available
- Local offline database/runtime is preserved

Release workflow is triggered by version tags in the form v*.*.*.
