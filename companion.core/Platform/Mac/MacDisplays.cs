using PeekPets.Companion.Sensors;

namespace PeekPets.Companion.Platform.Mac;

/// <summary>CoreGraphics display maths. Pure (no macOS calls), so it is tested on every OS.</summary>
internal static class MacDisplays
{
    /// <summary>CoreGraphics display rectangles → a <see cref="DisplayLayout"/>.</summary>
    public static DisplayLayout LayoutFrom(IEnumerable<(MacNative.CGRect Bounds, bool IsMain)> displays) =>
        DisplayLayout.Ordered(displays
            .Where(d => d.Bounds.Width >= 1 && d.Bounds.Height >= 1)
            .Select(d => new Screen(
                (int)Math.Round(d.Bounds.X), (int)Math.Round(d.Bounds.Y),
                (int)Math.Round(d.Bounds.Width), (int)Math.Round(d.Bounds.Height), d.IsMain)));
}
