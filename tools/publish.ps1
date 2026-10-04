# Makes a standalone companion a friend can run without installing .NET:
#   powershell -ExecutionPolicy Bypass -File tools\publish.ps1
# Output: dist\PeekPetsCompanion\PeekPets.Companion.exe (+ wwwroot, firewall helper)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$out = Join-Path $root 'dist\PeekPetsCompanion'
dotnet publish (Join-Path $root 'companion') -c Release -r win-x64 --self-contained true `
  -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:EnableCompressionInSingleFile=true `
  -o $out
Compress-Archive -Path "$out\*" -DestinationPath (Join-Path $root 'dist\PeekPetsCompanion-win-x64.zip') -Force
Write-Host "Done: $out" -ForegroundColor Green
