namespace PeekPets.Companion.Powers;

/// <summary>Token buckets keyed by string ("session|power.command"). Capacity = per-minute budget.</summary>
public sealed class RateLimiter(Func<DateTime> now)
{
    private readonly Dictionary<string, (double Tokens, DateTime At)> _buckets = new();
    private readonly object _gate = new();

    public bool TryTake(string key, int perMinute)
    {
        if (perMinute <= 0) return false;
        lock (_gate)
        {
            var t = now();
            var (tokens, at) = _buckets.TryGetValue(key, out var b) ? b : (perMinute, t);
            tokens = Math.Min(perMinute, tokens + (t - at).TotalSeconds * perMinute / 60.0);
            if (tokens < 1) { _buckets[key] = (tokens, t); return false; }
            _buckets[key] = (tokens - 1, t);
            if (_buckets.Count > 2000) Prune(t);
            return true;
        }
    }

    private void Prune(DateTime t)
    {
        foreach (var key in _buckets.Where(kv => t - kv.Value.At > TimeSpan.FromMinutes(5)).Select(kv => kv.Key).ToList())
            _buckets.Remove(key);
    }
}
