param(
  [string]$InstallRoot = ""
)

$ErrorActionPreference = "Stop"
$version = "3.38.0"
$assetName = "liblouis-$version-win64.zip"
$assetUrl = "https://github.com/liblouis/liblouis/releases/download/v$version/$assetName"
$expectedSha256 = "3210c585074fb975ec49bc580f331ea2980a241065e304feb294087d6678d3b3"
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))

if ([string]::IsNullOrWhiteSpace($InstallRoot)) {
  $InstallRoot = Join-Path $repoRoot ".tools\liblouis\$version"
}
$InstallRoot = [System.IO.Path]::GetFullPath($InstallRoot)

function Find-LiblouisFile([string]$root, [string]$name) {
  return Get-ChildItem -LiteralPath $root -Recurse -File -Filter $name -ErrorAction SilentlyContinue |
    Select-Object -First 1
}

function Show-Configuration([string]$root) {
  $command = Find-LiblouisFile $root "lou_translate.exe"
  $table = Find-LiblouisFile $root "en-ueb-g2.ctb"
  $display = Find-LiblouisFile $root "unicode.dis"
  if (-not $command -or -not $table -or -not $display) {
    throw "The extracted Liblouis package is missing lou_translate.exe, en-ueb-g2.ctb, or unicode.dis."
  }

  Write-Output "Liblouis $version is ready. Add these server-only values to .env.local:"
  Write-Output "LIBLOUIS_ENABLED=true"
  Write-Output ("LIBLOUIS_COMMAND=" + $command.FullName.Replace("\", "/"))
  Write-Output ("LIBLOUIS_TABLE=" + $table.FullName.Replace("\", "/"))
  Write-Output ("LIBLOUIS_DISPLAY_TABLE=" + $display.FullName.Replace("\", "/"))
  Write-Output "LIBLOUIS_TIMEOUT_MS=5000"
}

if (Test-Path -LiteralPath $InstallRoot) {
  try {
    Show-Configuration $InstallRoot
    exit 0
  } catch {
    throw "A partial Liblouis installation already exists at $InstallRoot. Move it aside and run the installer again."
  }
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("insighted-liblouis-" + [Guid]::NewGuid().ToString("N"))
$archivePath = Join-Path $tempRoot $assetName
$extractRoot = Join-Path $tempRoot "extracted"

New-Item -ItemType Directory -Path $tempRoot | Out-Null
try {
  Write-Output "Downloading official Liblouis $version Windows x64 release..."
  Invoke-WebRequest -Uri $assetUrl -OutFile $archivePath
  $actualSha256 = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualSha256 -ne $expectedSha256) {
    throw "Liblouis archive checksum mismatch. Expected $expectedSha256 but received $actualSha256."
  }

  New-Item -ItemType Directory -Path $extractRoot | Out-Null
  Expand-Archive -LiteralPath $archivePath -DestinationPath $extractRoot
  $payloadRoot = Get-Item -LiteralPath $extractRoot

  # Verify required files before moving anything into the project runtime directory.
  [void](Show-Configuration $payloadRoot.FullName)
  New-Item -ItemType Directory -Path (Split-Path -Parent $InstallRoot) -Force | Out-Null
  Move-Item -LiteralPath $payloadRoot.FullName -Destination $InstallRoot
  Show-Configuration $InstallRoot
} finally {
  $resolvedTemp = [System.IO.Path]::GetFullPath($tempRoot)
  $systemTemp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  if ($resolvedTemp.StartsWith($systemTemp, [System.StringComparison]::OrdinalIgnoreCase) -and
      (Split-Path -Leaf $resolvedTemp).StartsWith("insighted-liblouis-")) {
    Remove-Item -LiteralPath $resolvedTemp -Recurse -Force -ErrorAction SilentlyContinue
  }
}
