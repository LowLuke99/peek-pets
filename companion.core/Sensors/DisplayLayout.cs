namespace PeekPets.Companion.Sensors;

/// <summary>A monitor rectangle in physical pixels (virtual-desktop coordinates, may be negative).</summary>
public readonly record struct Screen(int X, int Y, int W, int H, bool Primary)
{
    public bool Contains(int px, int py) => px >= X && px < X + W && py >= Y && py < Y + H;
}

/// <summary>Normalized cursor sample. All fractions are clamped to 0..1.</summary>
public readonly record struct CursorPoint(double X, double Y, int Monitor, double MX, double MY);

/// <summary>
/// Immutable snapshot of the monitor arrangement. Normalizes raw cursor pixels into
/// both whole-desktop fractions and current-monitor fractions so the phone can
/// choose how gaze should map on multi-monitor setups.
/// </summary>
public sealed class DisplayLayout
{
    public IReadOnlyList<Screen> Screens { get; }
    public Screen Virtual { get; }

    public DisplayLayout(IReadOnlyList<Screen> screens)
    {
        if (screens.Count == 0) throw new ArgumentException("At least one screen is required.", nameof(screens));
        Screens = screens;
        int left = screens.Min(s => s.X), top = screens.Min(s => s.Y);
        int right = screens.Max(s => s.X + s.W), bottom = screens.Max(s => s.Y + s.H);
        Virtual = new Screen(left, top, right - left, bottom - top, false);
    }

    public CursorPoint Normalize(int px, int py)
    {
        int index = IndexAt(px, py);
        var s = Screens[index];
        return new CursorPoint(
            Frac(px - Virtual.X, Virtual.W), Frac(py - Virtual.Y, Virtual.H),
            index, Frac(px - s.X, s.W), Frac(py - s.Y, s.H));
    }

    /// <summary>Monitor under the point, or the nearest one when the point sits in a gap between monitors.</summary>
    public int IndexAt(int px, int py)
    {
        int best = 0;
        long bestDist = long.MaxValue;
        for (int i = 0; i < Screens.Count; i++)
        {
            var s = Screens[i];
            if (s.Contains(px, py)) return i;
            long dx = Math.Max(Math.Max(s.X - px, 0), px - (s.X + s.W - 1));
            long dy = Math.Max(Math.Max(s.Y - py, 0), py - (s.Y + s.H - 1));
            long d = dx * dx + dy * dy;
            if (d < bestDist) { bestDist = d; best = i; }
        }
        return best;
    }

    public bool SameAs(DisplayLayout other) => Screens.SequenceEqual(other.Screens);

    private static double Frac(double v, double size) => size <= 1 ? 0.5 : Math.Clamp(v / (size - 1), 0, 1);

    /// <summary>Stable order: primary first, then left-to-right. The phone treats index 0 as "main".</summary>
    public static DisplayLayout Ordered(IEnumerable<Screen> screens)
    {
        var ordered = screens.OrderByDescending(s => s.Primary).ThenBy(s => s.X).ThenBy(s => s.Y).ToList();
        return new DisplayLayout(ordered.Count > 0 ? ordered : [new Screen(0, 0, 1920, 1080, true)]);
    }
}
