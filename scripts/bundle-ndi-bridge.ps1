param([string]$RuntimeDirectory)
$ErrorActionPreference = 'Stop'
$destination = Join-Path $PSScriptRoot '../desktop/runtime/ndi-bridge'
New-Item -ItemType Directory -Force -Path $destination | Out-Null

if (-not $RuntimeDirectory) {
  # Install only the official redistributable on the build runner, not NDI Tools/Webcam.
  $installer = Join-Path $env:TEMP 'HouseMix-NDI-Runtime.exe'
  Invoke-WebRequest -Uri 'https://ndi.link/NDIRedistV6' -OutFile $installer
  $signature = Get-AuthenticodeSignature -LiteralPath $installer
  if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'NDI|NewTek|Vizrt') {
    throw 'The NDI runtime installer does not have a valid NDI publisher signature.'
  }
  $runtimeTarget = Join-Path $env:TEMP 'HouseMix-NDI-Redist'
  $process = Start-Process -FilePath $installer -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', ('/DIR="' + $runtimeTarget + '"')) -WindowStyle Hidden -Wait -PassThru
  if ($process.ExitCode -notin @(0, 3010)) { throw "NDI runtime installer failed ($($process.ExitCode))." }
  $RuntimeDirectory = $runtimeTarget
}
$library = Get-ChildItem -LiteralPath $RuntimeDirectory -Filter 'Processing.NDI.Lib.x64.dll' -Recurse -File | Select-Object -First 1
$notices = Get-ChildItem -LiteralPath $RuntimeDirectory -Filter 'Processing.NDI.Lib.Licenses.txt' -Recurse -File | Select-Object -First 1
if (-not $library -or -not $notices) { throw 'NDI x64 runtime or its third-party notices are missing.' }
Copy-Item -LiteralPath $library.FullName -Destination $destination -Force
Copy-Item -LiteralPath $notices.FullName -Destination $destination -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '../tools/NexoHubBridge/NDI-NOTICE.txt') -Destination $destination -Force
dotnet publish (Join-Path $PSScriptRoot '../tools/NexoHubBridge/NexoHubBridge.csproj') -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o $destination
if ($LASTEXITCODE -ne 0) { throw 'Failed to publish the bundled NDI worker.' }
foreach ($name in @('NexoHubBridge.exe','Processing.NDI.Lib.x64.dll','Processing.NDI.Lib.Licenses.txt')) {
  if (-not (Test-Path -LiteralPath (Join-Path $destination $name))) { throw "Missing bundled file: $name" }
}
