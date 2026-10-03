# Test helper: moves the real Windows cursor so the end-to-end test can watch the
# pet's eyes follow. Reads commands from stdin, one per line:
#   move <x> <y>      -> sets the cursor (physical px) and prints "moved <unix_ms>"
#   corners           -> prints the virtual screen rect "rect <x> <y> <w> <h>"
#   quit
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class CursorDriver {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);
}
"@
[CursorDriver]::SetThreadDpiAwarenessContext([IntPtr](-4)) | Out-Null
[Console]::Out.WriteLine("ready")
[Console]::Out.Flush()
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line -or $line -eq 'quit') { break }
  $parts = $line.Split(' ')
  switch ($parts[0]) {
    'move' {
      [CursorDriver]::SetCursorPos([int]$parts[1], [int]$parts[2]) | Out-Null
      [Console]::Out.WriteLine("moved " + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
    }
    'corners' {
      $m = [CursorDriver]
      [Console]::Out.WriteLine("rect " + $m::GetSystemMetrics(76) + " " + $m::GetSystemMetrics(77) + " " + $m::GetSystemMetrics(78) + " " + $m::GetSystemMetrics(79))
    }
  }
  [Console]::Out.Flush()
}
