using System.Text.Json;

namespace PeekPets.Companion.Facts;

/// <summary>
/// Polls the shared fact providers and raises <see cref="Changed"/> only when a value
/// actually changes. Unshared facts are never read at all.
/// </summary>
public sealed class FactHub : IDisposable
{
    private readonly Dictionary<string, (string Json, object Value)> _last = new();
    private readonly Dictionary<string, DateTime> _nextDue = new();
    private readonly Func<string, bool> _isShared;
    private readonly Timer _timer;
    private readonly object _gate = new();

    public IReadOnlyList<IFactProvider> Providers { get; }
    public event Action<string, object>? Changed;

    public FactHub(Func<string, bool> isShared, IEnumerable<IFactProvider> providers)
    {
        _isShared = isShared;
        Providers = providers.ToList();
        _timer = new Timer(_ => Tick(), null, TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(1));
    }

    /// <summary>Current values of every shared fact (used when a phone first connects).</summary>
    public Dictionary<string, object> Snapshot()
    {
        lock (_gate)
        {
            var result = new Dictionary<string, object>();
            foreach (var p in Providers)
            {
                if (!_isShared(p.Key)) continue;
                result[p.Key] = _last.TryGetValue(p.Key, out var v) ? v.Value : ReadAndStore(p).Value;
            }
            return result;
        }
    }

    /// <summary>Forget cached values so the next tick re-sends (used after sharing toggles change).</summary>
    public void Invalidate() { lock (_gate) { _last.Clear(); _nextDue.Clear(); } }

    private void Tick()
    {
        var changes = new List<(string, object)>();
        lock (_gate)
        {
            var now = DateTime.UtcNow;
            foreach (var p in Providers)
            {
                if (!_isShared(p.Key)) continue;
                if (_nextDue.TryGetValue(p.Key, out var due) && now < due) continue;
                _nextDue[p.Key] = now + p.Interval;
                string? previous = _last.TryGetValue(p.Key, out var old) ? old.Json : null;
                var fresh = ReadAndStore(p);
                if (fresh.Json != previous) changes.Add((p.Key, fresh.Value));
            }
        }
        foreach (var (key, value) in changes) Changed?.Invoke(key, value);
    }

    private (string Json, object Value) ReadAndStore(IFactProvider p)
    {
        object value;
        try { value = p.Read(); }
        catch (Exception ex) { value = new { available = false, reason = "error", detail = ex.GetType().Name }; }
        var entry = (JsonSerializer.Serialize(value), value);
        _last[p.Key] = entry;
        return entry;
    }

    public void Dispose() => _timer.Dispose();
}
