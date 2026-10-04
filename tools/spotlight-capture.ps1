# Films the find-cursor spotlight: starts the companion with --preview-spotlight, sweeps
# the real cursor across the primary screen and saves frames around it.
#   powershell -ExecutionPolicy Bypass -File tools\spotlight-capture.ps1 [outDir]
param([string]$Out = "$PSScriptRoot\e2e\out\spotlight")
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class SpotDriver {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);
}
"@
[SpotDriver]::SetThreadDpiAwarenessContext([IntPtr](-4)) | Out-Null
New-Item -ItemType Directory -Force $Out | Out-Null
$exe = Join-Path $PSScriptRoot '..\companion\bin\Debug\net8.0-windows\PeekPets.Companion.exe'
$w = [SpotDriver]::GetSystemMetrics(0); $h = [SpotDriver]::GetSystemMetrics(1)
$cx = [int]($w / 2); $cy = [int]($h / 2)
[SpotDriver]::SetCursorPos($cx - 300, $cy) | Out-Null
Start-Process $exe -ArgumentList '--preview-spotlight', '--minimized'
Start-Sleep -Milliseconds 900
$box = 640
for ($i = 0; $i -lt 14; $i++) {
  $a = $i / 14.0 * [Math]::PI * 1.5
  $x = [int]($cx - 300 + $i * 45); $y = [int]($cy + [Math]::Sin($a) * 140)
  [SpotDriver]::SetCursorPos($x, $y) | Out-Null
  Start-Sleep -Milliseconds 140
  $bmp = New-Object System.Drawing.Bitmap $box, $box
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($x - $box / 2, $y - $box / 2, 0, 0, $bmp.Size)
  $bmp.Save((Join-Path $Out ("frame{0:D2}.png" -f $i)))
  $g.Dispose(); $bmp.Dispose()
}
Write-Output "saved to $Out"
