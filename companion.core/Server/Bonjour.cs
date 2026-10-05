using System.Net;

namespace PeekPets.Companion.Server;

/// <summary>
/// Announces the companion on the LAN as "_peekpets._tcp" so the iPhone app can list
/// "your computers" instead of asking for an IP address. Nothing secret is advertised:
/// pairing still needs the code on screen.
/// </summary>
public interface IServiceAdvertiser : IDisposable
{
    string? Error { get; }
    bool Start(string pcName, IReadOnlyList<IPAddress> addresses, int port, Dictionary<string, string> txt);
}

/// <summary>Shared Bonjour pieces (pure, so they can be tested on any OS).</summary>
public static class Bonjour
{
    public const string ServiceType = "_peekpets._tcp";

    /// <summary>TXT values (what the phone reads). Pure so it can be tested.</summary>
    public static Dictionary<string, string> TxtRecord(string pcName, IEnumerable<IPAddress> addresses, int port, int securePort, int protocol, string version) => new()
    {
        ["pc"] = pcName.Length > 40 ? pcName[..40] : pcName,
        ["ip"] = string.Join(",", addresses.Where(a => a.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork).Take(3)),
        ["port"] = port.ToString(),
        ["sport"] = securePort > 0 ? securePort.ToString() : "",
        ["proto"] = protocol.ToString(),
        ["ver"] = version,
    };

    /// <summary>A DNS-safe instance/host label: letters, digits and dashes, at most 40.</summary>
    public static string Sanitize(string name)
    {
        var clean = new string(name.Where(c => char.IsLetterOrDigit(c) || c == '-').ToArray());
        return clean.Length == 0 ? "PeekPets-PC" : clean.Length > 40 ? clean[..40] : clean;
    }

    /// <summary>RFC 6763 TXT record bytes: each entry is a length byte then "key=value" (UTF-8, at most 255 bytes).</summary>
    public static byte[] EncodeTxt(Dictionary<string, string> txt)
    {
        var bytes = new List<byte>();
        foreach (var (key, value) in txt)
        {
            var entry = System.Text.Encoding.UTF8.GetBytes($"{key}={value}");
            if (entry.Length > 255) entry = entry[..255];
            bytes.Add((byte)entry.Length);
            bytes.AddRange(entry);
        }
        return bytes.Count == 0 ? [0] : bytes.ToArray();
    }
}
