# Installs or updates Peek Pets Companion on Windows in one line (no .NET or developer tools):
#
#   irm https://raw.githubusercontent.com/LowLuke99/peek-pets/main/tools/windows/install-companion.ps1 | iex
#
# Downloads the latest build from GitHub, checks it against the release's SHA256SUMS, installs to
# %LOCALAPPDATA%\Programs\Peek Pets Companion (no admin), adds Start menu + Desktop shortcuts and
# opens it. Run it again to update; settings and paired phones are kept (%APPDATA%\PeekPets).
# Testing overrides: PEEKPETS_COMPANION_URL + PEEKPETS_SUMS_URL (URLs or local paths),
# PEEKPETS_INSTALL_DIR, PEEKPETS_NO_OPEN=1, PEEKPETS_NO_SHORTCUTS=1.

function Install-PeekPetsCompanion {
    $ErrorActionPreference = 'Stop'
    $ProgressPreference = 'SilentlyContinue' # the progress bar makes downloads crawl in Windows PowerShell
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

    $repo = 'LowLuke99/peek-pets'
    $tag = 'companion-latest'
    $appName = 'Peek Pets Companion'
    $zipName = 'PeekPets-Companion-windows-x64.zip'
    $zipUrl = if ($env:PEEKPETS_COMPANION_URL) { $env:PEEKPETS_COMPANION_URL } else { "https://github.com/$repo/releases/download/$tag/$zipName" }
    $sumsUrl = if ($env:PEEKPETS_SUMS_URL) { $env:PEEKPETS_SUMS_URL } else { "https://github.com/$repo/releases/download/$tag/SHA256SUMS" }
    $dest = if ($env:PEEKPETS_INSTALL_DIR) { $env:PEEKPETS_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA "Programs\$appName" }

    if (-not [Environment]::Is64BitOperatingSystem) { throw 'Peek Pets Companion needs 64-bit Windows 10 or 11.' }

    function Get-Source([string]$from, [string]$to) {
        if (Test-Path -LiteralPath $from) { Copy-Item -LiteralPath $from -Destination $to }
        else { Invoke-WebRequest -UseBasicParsing -Uri $from -OutFile $to }
    }

    $tmp = Join-Path ([IO.Path]::GetTempPath()) ("peekpets-" + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tmp | Out-Null
    try {
        Write-Host "Downloading $appName..." -ForegroundColor Magenta
        $zip = Join-Path $tmp $zipName
        Get-Source $zipUrl $zip
        Get-Source $sumsUrl (Join-Path $tmp 'SHA256SUMS')

        $expected = Get-Content (Join-Path $tmp 'SHA256SUMS') |
            ForEach-Object { $parts = $_ -split '\s+', 2; if ($parts.Count -eq 2 -and $parts[1].TrimStart('*') -eq $zipName) { $parts[0] } } |
            Select-Object -First 1
        $actual = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash
        if (-not $expected -or $expected.ToLower() -ne $actual.ToLower()) {
            throw "Checksum mismatch for ${zipName}: the download is damaged or not the published build. Nothing was installed."
        }

        # Close a running companion politely first, so phones see "PC closed" instead of a timeout.
        $running = Get-Process -Name 'PeekPets.Companion' -ErrorAction SilentlyContinue
        foreach ($p in $running) { [void]$p.CloseMainWindow() }
        foreach ($p in $running) { if (-not $p.WaitForExit(4000)) { Stop-Process -Id $p.Id -Force } }

        Write-Host "Installing to $dest..." -ForegroundColor Magenta
        $unzipped = Join-Path $tmp 'unzipped'
        Expand-Archive -LiteralPath $zip -DestinationPath $unzipped
        if (-not (Test-Path (Join-Path $unzipped 'PeekPets.Companion.exe'))) { throw "The download didn't contain PeekPets.Companion.exe" }
        if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }
        New-Item -ItemType Directory -Force -Path (Split-Path $dest -Parent) | Out-Null
        Move-Item -LiteralPath $unzipped -Destination $dest
        Get-ChildItem -LiteralPath $dest -Recurse -File | Unblock-File
        $exe = Join-Path $dest 'PeekPets.Companion.exe'

        if ($env:PEEKPETS_NO_SHORTCUTS -ne '1') {
            $shell = New-Object -ComObject WScript.Shell
            foreach ($folder in @([Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('Desktop'))) {
                $link = $shell.CreateShortcut((Join-Path $folder "$appName.lnk"))
                $link.TargetPath = $exe
                $link.WorkingDirectory = $dest
                $link.Description = 'Your Peek Pets pet watches this PC''s cursor'
                $link.Save()
            }
        }

        if ($env:PEEKPETS_NO_OPEN -eq '1') { Write-Host "Installed $exe" -ForegroundColor Green; return }
        Write-Host 'Opening it. If Windows asks about network access, allow Private and Public networks.' -ForegroundColor Magenta
        Start-Process -FilePath $exe -WorkingDirectory $dest
        Write-Host ''
        Write-Host '  On your iPhone (same Wi-Fi): open the Camera, point it at the QR code, tap the link.'
        Write-Host '  Update later: run the same command again.'
        Write-Host ''
    }
    finally {
        Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Install-PeekPetsCompanion
