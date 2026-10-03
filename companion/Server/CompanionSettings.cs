using System.Text.Json;
using System.Text.Json.Serialization;

namespace PeekPets.Companion.Server;

public sealed class PairedDevice
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "Phone";
    /// <summary>SHA-256 of the device token; the token itself only lives on the phone.</summary>
    public string TokenHash { get; set; } = "";
    public DateTime PairedAt { get; set; }
    public DateTime LastSeen { get; set; }
}

/// <summary>Persisted companion preferences. Stored under %APPDATA%\PeekPets.</summary>
public sealed class CompanionSettings
{
    public int Port { get; set; } = 8787;
    public Dictionary<string, bool> Shared { get; set; } = new()
    {
        ["cursor"] = true,
        ["clicks"] = true,
        ["battery"] = true,
        ["activity"] = true,
        ["load"] = false,
    };
    public List<PairedDevice> Devices { get; set; } = [];

    [JsonIgnore] public string? FilePath { get; private set; }

    private static readonly JsonSerializerOptions Json = new() { WriteIndented = true };
    private readonly object _gate = new();

    public bool IsShared(string key) { lock (_gate) return Shared.TryGetValue(key, out var v) && v; }
    public void SetShared(string key, bool value) { lock (_gate) Shared[key] = value; Save(); }

    public static CompanionSettings Load(string? path = null)
    {
        path ??= Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "PeekPets", "companion.json");
        CompanionSettings settings;
        try
        {
            settings = File.Exists(path)
                ? JsonSerializer.Deserialize<CompanionSettings>(File.ReadAllText(path)) ?? new CompanionSettings()
                : new CompanionSettings();
        }
        catch (JsonException)
        {
            // A corrupt file shouldn't brick the app; keep a copy for debugging and start fresh.
            File.Copy(path, path + ".corrupt", overwrite: true);
            settings = new CompanionSettings();
        }
        settings.FilePath = path;
        foreach (var (k, v) in new CompanionSettings().Shared) settings.Shared.TryAdd(k, v);
        return settings;
    }

    public void Save()
    {
        if (FilePath is null) return;
        lock (_gate)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(FilePath)!);
            var tmp = FilePath + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(this, Json));
            File.Move(tmp, FilePath, overwrite: true);
        }
    }
}
