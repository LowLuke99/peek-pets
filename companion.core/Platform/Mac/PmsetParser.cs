using System.Text.RegularExpressions;

namespace PeekPets.Companion.Platform.Mac;

/// <summary>Reads `pmset` output. Pure (no macOS calls), so it is tested on every OS.</summary>
internal static partial class PmsetParser
{
    /// <summary>Parses `pmset -g batt`.</summary>
    public static object Parse(string batt, bool saver)
    {
        bool pluggedIn = batt.Contains("'AC Power'", StringComparison.Ordinal);
        var m = BatteryLine().Match(batt);
        if (!m.Success) return new { available = false, reason = "no_battery", pluggedIn };
        string state = m.Groups["state"].Value.Trim().ToLowerInvariant();
        return new
        {
            available = true,
            percent = (int?)int.Parse(m.Groups["pct"].Value),
            charging = state is "charging" or "finishing charge",
            pluggedIn,
            saver,
        };
    }

    /// <summary>`pmset -g` lists "lowpowermode 1" while Low Power Mode is on.</summary>
    public static bool LowPowerMode(string? settings) => settings is not null && LowPowerLine().IsMatch(settings);

    [GeneratedRegex(@"InternalBattery[^\t]*\t\s*(?<pct>\d{1,3})%;\s*(?<state>[^;]+);")]
    private static partial Regex BatteryLine();

    [GeneratedRegex(@"^\s*lowpowermode\s+1\b", RegexOptions.Multiline)]
    private static partial Regex LowPowerLine();
}
