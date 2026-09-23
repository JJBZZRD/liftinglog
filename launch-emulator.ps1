<#
.SYNOPSIS
Starts the installed WorkoutLog MVP Check app on an Android emulator.

.EXAMPLE
.\launch-emulator.ps1

.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File .\launch-emulator.ps1
#>
[CmdletBinding()]
param(
    [string]$AvdName = 'Pixel_9_Pro_XL',
    [ValidateRange(5554, 5682)]
    [int]$Port = 5554,
    [ValidateRange(1, 3600)]
    [int]$BootTimeoutSeconds = 120
)

$ErrorActionPreference = 'Stop'
if (($Port % 2) -ne 0) { throw 'Emulator console ports must be even numbers from 5554 through 5682.' }
$packageName = 'com.anonymous.LiftingLog.mvpacceptance'
$activityName = "$packageName/com.anonymous.LiftingLog.MainActivity"
$serial = "emulator-$Port"

$sdkRoot = $env:ANDROID_HOME
if ([string]::IsNullOrWhiteSpace($sdkRoot)) { $sdkRoot = $env:ANDROID_SDK_ROOT }
if ([string]::IsNullOrWhiteSpace($sdkRoot)) {
    $sdkRoot = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
}
$adb = Join-Path $sdkRoot 'platform-tools\adb.exe'
$emulator = Join-Path $sdkRoot 'emulator\emulator.exe'
if (-not (Test-Path -LiteralPath $adb -PathType Leaf)) { throw "Android adb was not found at '$adb'. Set ANDROID_HOME or ANDROID_SDK_ROOT to your Android SDK directory." }
if (-not (Test-Path -LiteralPath $emulator -PathType Leaf)) { throw "Android emulator was not found at '$emulator'. Set ANDROID_HOME or ANDROID_SDK_ROOT to your Android SDK directory." }

function Invoke-Adb {
    param([string[]]$Arguments)
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $result = @(& $adb @Arguments 2>&1)
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($exitCode -ne 0) { throw "adb command failed ($($Arguments -join ' ')): $($result -join ' ')" }
    return $result
}

$deviceRows = @(Invoke-Adb -Arguments @('-P', '5037', 'devices'))
$isRunning = $false
foreach ($row in $deviceRows) {
    if ($row -match "^$([regex]::Escape($serial))\s+(\S+)") {
        if ($Matches[1] -ne 'device') { throw "Emulator serial $serial is already present in state '$($Matches[1])'. Wait for it to become available before rerunning; no emulator state was changed." }
        $isRunning = $true
        break
    }
}

if (-not $isRunning) {
    $oldAvdHome = $env:ANDROID_AVD_HOME
    $setAvdHome = [string]::IsNullOrWhiteSpace($oldAvdHome)
    if ($setAvdHome) { $env:ANDROID_AVD_HOME = Join-Path $env:USERPROFILE '.android\avd' }
    try {
        $null = Start-Process -FilePath $emulator -ArgumentList @('-avd', $AvdName, '-port', "$Port") -PassThru
    } catch {
        throw "Could not start emulator '$AvdName': $($_.Exception.Message)"
    } finally {
        if ($setAvdHome) { Remove-Item Env:ANDROID_AVD_HOME -ErrorAction SilentlyContinue }
        else { $env:ANDROID_AVD_HOME = $oldAvdHome }
    }
}

$deadline = (Get-Date).AddSeconds($BootTimeoutSeconds)
$booted = $false
while ((Get-Date) -lt $deadline) {
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $deviceRows = @(& $adb -P 5037 devices 2>&1)
        $devicesExitCode = $LASTEXITCODE
        if ($devicesExitCode -eq 0 -and ($deviceRows | Where-Object { $_ -match "^$([regex]::Escape($serial))\s+device\b" })) {
            $bootValue = @(& $adb -P 5037 -s $serial shell getprop sys.boot_completed 2>&1)
            $bootExitCode = $LASTEXITCODE
            if ($bootExitCode -eq 0 -and (($bootValue -join '').Trim() -eq '1')) { $booted = $true }
        }
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($booted) { break }
    Start-Sleep -Seconds 2
}
if (-not $booted) {
    throw "Emulator $serial did not finish booting within $BootTimeoutSeconds seconds. Check the emulator window and try again."
}

$actualAvd = (Invoke-Adb -Arguments @('-P', '5037', '-s', $serial, 'shell', 'getprop', 'ro.boot.qemu.avd_name') | Out-String).Trim()
if ([string]::IsNullOrWhiteSpace($actualAvd)) {
    $actualAvd = (Invoke-Adb -Arguments @('-P', '5037', '-s', $serial, 'shell', 'getprop', 'ro.kernel.qemu.avd_name') | Out-String).Trim()
}
if ([string]::IsNullOrWhiteSpace($actualAvd)) { throw "Could not verify which AVD is running on $serial. No app was launched." }
if ($actualAvd -ne $AvdName) { throw "Emulator $serial is running '$actualAvd', not '$AvdName'. No app was launched." }

$installed = Invoke-Adb -Arguments @('-P', '5037', '-s', $serial, 'shell', 'pm', 'path', $packageName)
if (-not (($installed -join "`n") -match 'package:')) {
    throw "WorkoutLog MVP Check ($packageName) is not installed on $serial. Install the existing MVP Check package, then rerun this script. No build or installation was attempted."
}
$launchResult = Invoke-Adb -Arguments @('-P', '5037', '-s', $serial, 'shell', 'am', 'start', '-n', $activityName)
if (($launchResult -join "`n") -match '(?i)error:|exception') {
    throw "Android reported an error while starting ${activityName}: $($launchResult -join ' ')"
}
Write-Output "WorkoutLog MVP Check launched on $serial."
