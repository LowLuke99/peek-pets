# Saves a screenshot of a window by process name (used for docs):
#   powershell -File tools\capture-window.ps1 -Process PeekPets.Companion -Out docs\img\x.png
param([string]$Process = 'PeekPets.Companion', [string]$Out = 'window.png')
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class W {
  [StructLayout(LayoutKind.Sequential)] public struct R { public int L, T, Ri, B; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint f);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
}
"@
[W]::SetProcessDPIAware() | Out-Null
$p = Get-Process $Process | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { throw "no window for $Process" }
[W]::ShowWindow($p.MainWindowHandle, 9) | Out-Null   # restore
[W]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 700
$r = New-Object W+R
[W]::GetWindowRect($p.MainWindowHandle, [ref]$r) | Out-Null
$bmp = New-Object System.Drawing.Bitmap ($r.Ri - $r.L - 16), ($r.B - $r.T - 8)   # trim the invisible resize borders
$g = [System.Drawing.Graphics]::FromImage($bmp)
# WPF draws with the GPU, so copy the window's pixels off the screen (it was just brought to front).
$g.CopyFromScreen($r.L + 8, $r.T, 0, 0, $bmp.Size)
$g.Dispose()
$bmp.Save((Resolve-Path -LiteralPath (Split-Path $Out -Parent)).Path + '\' + (Split-Path $Out -Leaf), [System.Drawing.Imaging.ImageFormat]::Png)
"saved $Out"
