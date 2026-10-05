namespace PeekPets.Companion.Powers;

/// <summary>Turns raw Labs counts into a plain-language verdict for the scorecard.</summary>
public static class Scorecard
{
    public static string Verdict(ScoreRow r)
    {
        int touches = r.Fired + r.Used;
        if (!r.Allowed) return "blocked on PC";
        if (touches == 0 && r.Dismissed == 0) return r.On ? "on, waiting for a moment to help" : "not tried yet";
        double dismissRate = (double)r.Dismissed / Math.Max(1, touches);
        if (r.Used >= 3 && dismissRate < 0.5) return "★ earning its place";
        if (r.Fired >= 3 && dismissRate >= 0.6 && r.Used == 0) return "mostly dismissed: tune or drop";
        if (r.Used > 0) return "getting used";
        return "early days";
    }
}
