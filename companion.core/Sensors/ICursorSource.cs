namespace PeekPets.Companion.Sensors;

/// <summary>
/// The OS-specific half of cursor sampling. <see cref="CursorSampler"/> owns the loop and the
/// maths; this reads the pointer, the buttons and the monitor list, and paces the loop.
/// All coordinates are in one global space with y growing downwards (monitor rectangles and
/// cursor positions must agree), so <see cref="DisplayLayout.Normalize"/> works unchanged.
/// </summary>
public interface ICursorSource
{
    /// <summary>Called on the sampler thread before sampling starts; disposed when it stops.</summary>
    ISamplePacer StartPacer(int hz);

    DisplayLayout ReadLayout();

    /// <summary>False when the position can't be read right now (the sample is skipped).</summary>
    bool TryGetCursor(out int x, out int y);

    /// <summary>Bitmask of buttons held down: 1 = left, 2 = right, 4 = middle.</summary>
    int ReadButtons();
}

public interface ISamplePacer : IDisposable
{
    /// <summary>Blocks until the next sample is due.</summary>
    void Wait();
}

/// <summary>Plain sleep pacing; good enough where the OS sleep is already ~1 ms precise (macOS).</summary>
public sealed class SleepPacer(int hz) : ISamplePacer
{
    private readonly int _periodMs = Math.Max(1, 1000 / hz);

    public void Wait() => Thread.Sleep(_periodMs);

    public void Dispose() { }
}
