namespace PeekPets.Companion.Server;

/// <summary>Command-line switches shared by the Windows and Mac apps: --key value, or --flag alone.</summary>
public static class CompanionArgs
{
    public static Dictionary<string, string> Parse(string[] args)
    {
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        for (int i = 0; i < args.Length; i++)
        {
            if (!args[i].StartsWith("--")) continue;
            var key = args[i][2..];
            map[key] = i + 1 < args.Length && !args[i + 1].StartsWith("--") ? args[++i] : "true";
        }
        return map;
    }
}
