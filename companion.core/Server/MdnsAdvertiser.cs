using System.Net;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;

namespace PeekPets.Companion.Server;

/// <summary>
/// Announces the companion on the LAN as "_peekpets._tcp" (Bonjour/mDNS) using Windows'
/// built-in DNS-SD service (Windows 10 1809+), so the iPhone app can list "your PCs"
/// instead of asking for an IP address. The TXT record carries the address and port,
/// plus the protocol version. Nothing secret: pairing still needs the code on screen.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class MdnsAdvertiser : IServiceAdvertiser
{
    private const string ServiceType = Bonjour.ServiceType + ".local";
    private IntPtr _instance;
    private IntPtr _cancel;
    private GCHandle _callbackHandle;
    private DNS_SERVICE_REGISTER_REQUEST _request;
    private readonly List<IntPtr> _strings = [];

    public bool Registered { get; private set; }
    public string? Error { get; private set; }

    public bool Start(string pcName, IReadOnlyList<IPAddress> addresses, int port, Dictionary<string, string> txt)
    {
        try
        {
            var ipv4 = addresses.FirstOrDefault(a => a.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork);
            uint ip = ipv4 is null ? 0 : BitConverter.ToUInt32(ipv4.GetAddressBytes(), 0);
            var host = $"{Bonjour.Sanitize(pcName)}.local";
            var instanceName = $"{Bonjour.Sanitize(pcName)}.{ServiceType}";
            var keys = txt.Keys.Select(Str).ToArray();
            var values = txt.Values.Select(Str).ToArray();
            var ipPtr = Marshal.AllocHGlobal(4);
            Marshal.WriteInt32(ipPtr, unchecked((int)ip));
            _strings.Add(ipPtr);
            _instance = DnsServiceConstructInstance(instanceName, host, ipv4 is null ? IntPtr.Zero : ipPtr, IntPtr.Zero,
                (ushort)port, 0, 0, (uint)keys.Length, keys, values);
            if (_instance == IntPtr.Zero) { Error = "construct failed"; return false; }

            DnsServiceRegisterComplete callback = (status, _, inst) => { if (inst != IntPtr.Zero && inst != _instance) DnsServiceFreeInstance(inst); };
            _callbackHandle = GCHandle.Alloc(callback);
            _cancel = Marshal.AllocHGlobal(IntPtr.Size);
            _request = new DNS_SERVICE_REGISTER_REQUEST
            {
                Version = 1, // DNS_QUERY_REQUEST_VERSION1
                InterfaceIndex = 0,
                pServiceInstance = _instance,
                pRegisterCompletionCallback = Marshal.GetFunctionPointerForDelegate(callback),
                pQueryContext = IntPtr.Zero,
                hCredentials = IntPtr.Zero,
                unicastEnabled = false,
            };
            uint result = DnsServiceRegister(ref _request, _cancel);
            Registered = result == 9506; // DNS_REQUEST_PENDING
            if (!Registered) Error = $"register returned {result}";
            return Registered;
        }
        catch (Exception ex) when (ex is DllNotFoundException or EntryPointNotFoundException)
        {
            Error = "needs Windows 10 (1809) or newer";
            return false;
        }

        IntPtr Str(string s)
        {
            var p = Marshal.StringToHGlobalUni(s);
            _strings.Add(p);
            return p;
        }
    }

    public void Dispose()
    {
        try
        {
            if (Registered) DnsServiceDeRegister(ref _request, IntPtr.Zero);
        }
        catch (Exception) { /* shutting down */ }
        Registered = false;
        if (_instance != IntPtr.Zero) { DnsServiceFreeInstance(_instance); _instance = IntPtr.Zero; }
        foreach (var p in _strings) Marshal.FreeHGlobal(p);
        _strings.Clear();
        if (_cancel != IntPtr.Zero) { Marshal.FreeHGlobal(_cancel); _cancel = IntPtr.Zero; }
        if (_callbackHandle.IsAllocated) _callbackHandle.Free();
    }

    [UnmanagedFunctionPointer(CallingConvention.Winapi)]
    private delegate void DnsServiceRegisterComplete(uint status, IntPtr queryContext, IntPtr instance);

    [StructLayout(LayoutKind.Sequential)]
    private struct DNS_SERVICE_REGISTER_REQUEST
    {
        public uint Version;
        public uint InterfaceIndex;
        public IntPtr pServiceInstance;
        public IntPtr pRegisterCompletionCallback;
        public IntPtr pQueryContext;
        public IntPtr hCredentials;
        [MarshalAs(UnmanagedType.Bool)] public bool unicastEnabled;
    }

    [DllImport("dnsapi.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr DnsServiceConstructInstance(string pServiceName, string pHostName, IntPtr pIp4, IntPtr pIp6,
        ushort wPort, ushort wPriority, ushort wWeight, uint dwPropertiesCount, IntPtr[] keys, IntPtr[] values);

    [DllImport("dnsapi.dll")] private static extern uint DnsServiceRegister(ref DNS_SERVICE_REGISTER_REQUEST request, IntPtr pCancel);
    [DllImport("dnsapi.dll")] private static extern uint DnsServiceDeRegister(ref DNS_SERVICE_REGISTER_REQUEST request, IntPtr pCancel);
    [DllImport("dnsapi.dll")] private static extern void DnsServiceFreeInstance(IntPtr instance);
}
