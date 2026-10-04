using System.Text.Json;

namespace PeekPets.Companion.Powers;

public sealed record AuditEntry(DateTime At, string Device, string Power, string Command, string Outcome, string? Detail = null)
{
    public override string ToString() =>
        $"{At.ToLocalTime():HH:mm:ss}  {Device} → {Power}.{Command}: {Outcome}{(Detail is null ? "" : $" ({Detail})")}";
}

/// <summary>
/// Every phone → PC command attempt, allowed or not. Kept in memory for the companion
/// window and appended to %APPDATA%\PeekPets\audit.log (rolled at 1 MB).
/// </summary>
public sealed class AuditLog(string? path = null)
{
    public const int Keep = 200;
    private const long MaxFileBytes = 1024 * 1024;
    private readonly LinkedList<AuditEntry> _entries = new();
    private readonly object _gate = new();

    public event Action<AuditEntry>? Added;

    public IReadOnlyList<AuditEntry> Entries { get { lock (_gate) return _entries.ToList(); } }

    public void Add(AuditEntry entry)
    {
        lock (_gate)
        {
            _entries.AddFirst(entry);
            while (_entries.Count > Keep) _entries.RemoveLast();
            if (path is not null) Append(path, entry);
        }
        Added?.Invoke(entry);
    }

    private static void Append(string file, AuditEntry entry)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(file)!);
            if (File.Exists(file) && new FileInfo(file).Length > MaxFileBytes) File.Move(file, file + ".1", overwrite: true);
            File.AppendAllText(file, JsonSerializer.Serialize(entry) + Environment.NewLine);
        }
        catch (IOException) { /* the in-memory log still has it */ }
        catch (UnauthorizedAccessException) { }
    }
}
