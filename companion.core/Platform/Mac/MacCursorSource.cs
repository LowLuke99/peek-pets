using System.Runtime.Versioning;
using PeekPets.Companion.Sensors;

namespace PeekPets.Companion.Platform.Mac;

/// <summary>
/// macOS cursor reading through CoreGraphics. Positions and display bounds share one global
/// space in points (top-left of the main display is 0,0; y grows downwards, like Windows).
/// </summary>
[SupportedOSPlatform("macos")]
public sealed class MacCursorSource : ICursorSource
{
    private const uint MaxDisplays = 16;

    public ISamplePacer StartPacer(int hz) => new SleepPacer(hz);

    public DisplayLayout ReadLayout()
    {
        var ids = new uint[MaxDisplays];
        if (MacNative.CGGetActiveDisplayList(MaxDisplays, ids, out uint count) != 0) count = 0;
        uint main = MacNative.CGMainDisplayID();
        var displays = ids.Take((int)count).Select(id => (Bounds: MacNative.CGDisplayBounds(id), IsMain: id == main));
        return MacDisplays.LayoutFrom(displays);
    }

    public bool TryGetCursor(out int x, out int y)
    {
        x = y = 0;
        IntPtr evt = MacNative.CGEventCreate(IntPtr.Zero);
        if (evt == IntPtr.Zero) return false;
        try
        {
            var p = MacNative.CGEventGetLocation(evt);
            // Floor, not round: the last point column (e.g. 1439.9 on a 1440-wide screen) stays on its monitor.
            x = (int)Math.Floor(p.X);
            y = (int)Math.Floor(p.Y);
            return true;
        }
        finally { MacNative.CFRelease(evt); }
    }

    public int ReadButtons()
    {
        int b = 0;
        if (MacNative.CGEventSourceButtonState(MacNative.CombinedSessionState, MacNative.LeftButton)) b |= 1;
        if (MacNative.CGEventSourceButtonState(MacNative.CombinedSessionState, MacNative.RightButton)) b |= 2;
        if (MacNative.CGEventSourceButtonState(MacNative.CombinedSessionState, MacNative.CenterButton)) b |= 4;
        return b;
    }
}
