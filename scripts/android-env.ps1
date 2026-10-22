# Dot-source this helper: . .\scripts\android-env.ps1
$projectRoot = Split-Path -Parent $PSScriptRoot
$projectSdk = Join-Path $projectRoot '.local/android/sdk'
$studioSdk = Join-Path $env:LOCALAPPDATA 'Android/Sdk'
if (Test-Path -LiteralPath (Join-Path $projectSdk 'platforms')) {
    $env:ANDROID_HOME = $projectSdk
    $env:ANDROID_AVD_HOME = Join-Path $projectRoot '.local/android/avd'
} elseif (-not $env:ANDROID_HOME -and (Test-Path -LiteralPath $studioSdk)) {
    $env:ANDROID_HOME = $studioSdk
}
if (-not $env:ANDROID_HOME) { throw 'Install an Android SDK and set ANDROID_HOME to its directory.' }
$studioJava = Join-Path $env:ProgramFiles 'Android/Android Studio/jbr'
if (-not $env:JAVA_HOME -and (Test-Path -LiteralPath $studioJava)) { $env:JAVA_HOME = $studioJava }
$env:PATH = (Join-Path $env:ANDROID_HOME 'platform-tools') + ';' + (Join-Path $env:ANDROID_HOME 'emulator') + ';' + $env:PATH
Write-Host 'Android environment configured for this terminal only.'
