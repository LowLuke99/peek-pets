using System.Net;
using System.Security.Cryptography;
using System.Text;

namespace PeekPets.Companion.Server;

public enum AuthError { None, BadCode, CodeExpired, BadToken, RateLimited, Malformed }

public readonly record struct AuthResult(AuthError Error, PairedDevice? Device = null, string? NewToken = null)
{
    public bool Ok => Error == AuthError.None;
    public string Reason => Error switch
    {
        AuthError.BadCode => "bad_code",
        AuthError.CodeExpired => "code_expired",
        AuthError.BadToken => "bad_token",
        AuthError.RateLimited => "rate_limited",
        AuthError.Malformed => "malformed",
        _ => "ok",
    };
}

/// <summary>
/// Pairing = a short code shown on the PC (QR or typed) that a phone trades for a
/// long-lived device token. Only token hashes are stored. Failed attempts are
/// rate-limited per IP so the 6-character code can't be brute forced on the LAN.
/// </summary>
public sealed class Pairing
{
    public const string Alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0/O/1/I/L
    public const int CodeLength = 6;
    public static readonly TimeSpan CodeLifetime = TimeSpan.FromMinutes(10);
    public const int MaxFailuresPerWindow = 5;
    public static readonly TimeSpan FailureWindow = TimeSpan.FromMinutes(1);
    public static readonly TimeSpan Lockout = TimeSpan.FromMinutes(1);

    private readonly CompanionSettings _settings;
    private readonly Func<DateTime> _now;
    private readonly Dictionary<IPAddress, List<DateTime>> _failures = new();
    private readonly Dictionary<IPAddress, DateTime> _lockedUntil = new();
    private readonly object _gate = new();
    private readonly string? _fixedCode;

    public string Code { get; private set; } = "";
    public DateTime CodeExpiresAt { get; private set; }
    public event Action? CodeChanged;
    public event Action? DevicesChanged;

    public Pairing(CompanionSettings settings, Func<DateTime>? now = null, string? fixedCode = null)
    {
        _settings = settings;
        _now = now ?? (() => DateTime.UtcNow);
        _fixedCode = fixedCode is null ? null : Normalize(fixedCode);
        NewCode();
    }

    public void NewCode()
    {
        lock (_gate)
        {
            Code = _fixedCode ?? RandomCode();
            CodeExpiresAt = _now() + CodeLifetime;
        }
        CodeChanged?.Invoke();
    }

    /// <summary>Rotates the code if it expired. Returns true when it changed.</summary>
    public bool RefreshIfExpired()
    {
        if (_now() < CodeExpiresAt) return false;
        NewCode();
        return true;
    }

    public static string Normalize(string input) =>
        new string(input.ToUpperInvariant().Where(char.IsLetterOrDigit).ToArray());

    public static string Format(string code) => code.Length == CodeLength ? $"{code[..3]}-{code[3..]}" : code;

    public AuthResult PairWithCode(string? code, IPAddress ip, string? deviceName)
    {
        if (string.IsNullOrWhiteSpace(code)) return new(AuthError.Malformed);
        lock (_gate)
        {
            if (IsLocked(ip)) return new(AuthError.RateLimited);
            if (_now() >= CodeExpiresAt) { RecordFailure(ip); return new(AuthError.CodeExpired); }
            var given = Encoding.ASCII.GetBytes(Normalize(code));
            var expected = Encoding.ASCII.GetBytes(Code);
            if (!CryptographicOperations.FixedTimeEquals(given, expected)) { RecordFailure(ip); return new(AuthError.BadCode); }

            var token = Base64Url(RandomNumberGenerator.GetBytes(32));
            var device = new PairedDevice
            {
                Id = Base64Url(RandomNumberGenerator.GetBytes(6)),
                Name = Sanitize(deviceName),
                TokenHash = Hash(token),
                PairedAt = _now(),
                LastSeen = _now(),
            };
            _settings.Devices.Add(device);
            _failures.Remove(ip);
            _settings.Save();
            DevicesChanged?.Invoke();
            return new(AuthError.None, device, token);
        }
    }

    public AuthResult AuthWithToken(string? token, IPAddress ip)
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length > 128) return new(AuthError.Malformed);
        lock (_gate)
        {
            if (IsLocked(ip)) return new(AuthError.RateLimited);
            var hash = Encoding.ASCII.GetBytes(Hash(token));
            var device = _settings.Devices.FirstOrDefault(d =>
                CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(d.TokenHash), hash));
            if (device is null) { RecordFailure(ip); return new(AuthError.BadToken); }
            device.LastSeen = _now();
            _settings.Save();
            return new(AuthError.None, device);
        }
    }

    public void Forget(string deviceId)
    {
        lock (_gate) _settings.Devices.RemoveAll(d => d.Id == deviceId);
        _settings.Save();
        DevicesChanged?.Invoke();
    }

    public IReadOnlyList<PairedDevice> Devices { get { lock (_gate) return _settings.Devices.ToList(); } }

    private bool IsLocked(IPAddress ip) => _lockedUntil.TryGetValue(ip, out var until) && _now() < until;

    private void RecordFailure(IPAddress ip)
    {
        var now = _now();
        if (!_failures.TryGetValue(ip, out var list)) _failures[ip] = list = [];
        list.RemoveAll(t => now - t > FailureWindow);
        list.Add(now);
        if (list.Count >= MaxFailuresPerWindow)
        {
            _lockedUntil[ip] = now + Lockout;
            list.Clear();
        }
    }

    private static string RandomCode()
    {
        Span<char> chars = stackalloc char[CodeLength];
        for (int i = 0; i < CodeLength; i++) chars[i] = Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)];
        return new string(chars);
    }

    private static string Sanitize(string? name)
    {
        var clean = new string((name ?? "Phone").Where(c => !char.IsControl(c)).Take(40).ToArray()).Trim();
        return clean.Length == 0 ? "Phone" : clean;
    }

    internal static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
    private static string Base64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
