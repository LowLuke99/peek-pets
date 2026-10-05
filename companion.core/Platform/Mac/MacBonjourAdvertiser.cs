using System.Net;
using System.Runtime.Versioning;
using PeekPets.Companion.Server;

namespace PeekPets.Companion.Platform.Mac;

/// <summary>
/// Bonjour on macOS through the system's dns_sd API (mDNSResponder). The registration lives
/// as long as the service reference is open; the host name and addresses are the Mac's own.
/// </summary>
[SupportedOSPlatform("macos")]
public sealed class MacBonjourAdvertiser : IServiceAdvertiser
{
    private IntPtr _ref;

    public string? Error { get; private set; }

    public bool Start(string pcName, IReadOnlyList<IPAddress> addresses, int port, Dictionary<string, string> txt)
    {
        try
        {
            ushort networkPort = (ushort)IPAddress.HostToNetworkOrder((short)port);
            var record = Bonjour.EncodeTxt(txt);
            int err = MacNative.DNSServiceRegister(out _ref, 0, 0, Bonjour.Sanitize(pcName), Bonjour.ServiceType,
                null, null, networkPort, (ushort)record.Length, record, IntPtr.Zero, IntPtr.Zero);
            if (err == 0) return true;
            _ref = IntPtr.Zero;
            Error = $"dns_sd error {err}";
            return false;
        }
        catch (Exception ex) when (ex is DllNotFoundException or EntryPointNotFoundException)
        {
            Error = "dns_sd unavailable";
            return false;
        }
    }

    public void Dispose()
    {
        if (_ref == IntPtr.Zero) return;
        MacNative.DNSServiceRefDeallocate(_ref);
        _ref = IntPtr.Zero;
    }
}
