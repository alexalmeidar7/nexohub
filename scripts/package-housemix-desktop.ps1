param([switch]$ValidateOnly)

$ErrorActionPreference = 'Stop'
$hasCertificate = -not [string]::IsNullOrWhiteSpace($env:WIN_CSC_LINK)
if (-not $hasCertificate -and -not [string]::IsNullOrWhiteSpace($env:WIN_CSC_KEY_PASSWORD)) {
  throw 'Signing password configured without HMD_WINDOWS_CSC_LINK.'
}

if ($hasCertificate) {
  Write-Output 'Windows signing enabled. A valid signature is required before publishing.'
} else {
  # Preserve current releases until a verified company signing identity is set up.
  Write-Warning 'Windows signing is not configured. SmartScreen may show Unknown publisher. Configure HMD_WINDOWS_CSC_LINK and HMD_WINDOWS_CSC_KEY_PASSWORD.'
}
if ($ValidateOnly) { return }

foreach ($file in @('NexoHubBridge.exe', 'Processing.NDI.Lib.x64.dll', 'Processing.NDI.Lib.Licenses.txt')) {
  if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot "../desktop/runtime/ndi-bridge/$file"))) {
    throw "The integrated NDI runtime is incomplete: $file. Run scripts/bundle-ndi-bridge.ps1 first."
  }
}

$builderArguments = @('exec', 'electron-builder', '--', '--win', 'nsis', '--x64', '--publish', 'never')
if ($hasCertificate) { $builderArguments += '-c.forceCodeSigning=true' }
& npm @builderArguments
if ($LASTEXITCODE -ne 0) { throw "Desktop packaging failed ($LASTEXITCODE)." }

if ($hasCertificate) {
  $files = @(
    'release/win-unpacked/House Mix Desktop.exe'
    Get-ChildItem -LiteralPath 'release' -Filter 'House-Mix-Desktop-*-Setup.exe' -File | ForEach-Object { $_.FullName }
  )
  if ($files.Count -lt 2) { throw 'Signed installer was not generated.' }
  foreach ($file in $files) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing signed executable: $file" }
    $signature = Get-AuthenticodeSignature -LiteralPath $file
    if ($signature.Status -ne 'Valid') { throw "Invalid Windows signature: $file ($($signature.Status))" }
    if (-not $signature.TimeStamperCertificate) { throw "Missing signature timestamp: $file" }
    Write-Output "Verified signed executable: $file"
  }
}

# Build the separate Locutor product from the same verified frontend.
# Separate app ID, user data, installer and updater channel prevent HMD replacement.
$locutorArgs = @('exec','electron-builder','--','--win','nsis','--x64','--publish','never',
  '-c.appId=br.com.nexobrasil.housemix.locutor','-c.productName=House Mix - Locutor',
  '-c.directories.output=release-locutor','-c.win.artifactName=House-Mix-Locutor-${version}-Setup.${ext}',
  '-c.nsis.shortcutName=House Mix - Locutor','-c.nsis.include=desktop/locutor-installer.nsh',
  '-c.publish.channel=locutor','-c.extraMetadata.name=housemix-locutor')
if ($hasCertificate) { $locutorArgs += '-c.forceCodeSigning=true' }
& npm @locutorArgs
if ($LASTEXITCODE -ne 0) { throw "Locutor packaging failed ($LASTEXITCODE)." }
$locutor = Get-ChildItem -LiteralPath 'release-locutor' -Filter 'House-Mix-Locutor-*-Setup.exe' -File
if (-not $locutor) { throw 'Locutor installer missing.' }
if ($hasCertificate) {
  foreach ($file in $locutor) {
    $signature = Get-AuthenticodeSignature -LiteralPath $file.FullName
    if ($signature.Status -ne 'Valid' -or -not $signature.TimeStamperCertificate) { throw "Invalid Locutor signature: $file" }
  }
}
