# Makes a standalone Windows companion (no .NET needed), zipped for the GitHub release that
# tools/windows/install-companion.ps1 downloads:
#   powershell -ExecutionPolicy Bypass -File tools\publish.ps1
# Output: dist\PeekPetsCompanion\PeekPets.Companion.exe (+ wwwroot, firewall helper)
#         dist\windows\PeekPets-Companion-windows-x64.zip
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$out = Join-Path $root 'dist\PeekPetsCompanion'
dotnet publish (Join-Path $root 'companion') -c Release -r win-x64 --self-contained true `
  -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:EnableCompressionInSingleFile=true `
  -o $out
if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed" }
$zipDir = Join-Path $root 'dist\windows'
New-Item -ItemType Directory -Force -Path $zipDir | Out-Null
$zip = Join-Path $zipDir 'PeekPets-Companion-windows-x64.zip'
Compress-Archive -Path "$out\*" -DestinationPath $zip -Force
"$((Get-FileHash $zip -Algorithm SHA256).Hash.ToLower())  PeekPets-Companion-windows-x64.zip" |
  Set-Content -Encoding ascii (Join-Path $zipDir 'SHA256SUMS')
Write-Host "Done: $zip" -ForegroundColor Green
