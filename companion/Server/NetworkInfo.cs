using System.Diagnostics;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;

namespace PeekPets.Companion.Server;

public sealed record LanAddress(IPAddress Address, string Interface, bool HasGateway);

public sealed record FirewallReport(string NetworkName, string Category, bool PortRuleExists, bool AppBlocked, string? Error)
{
    /// <summary>True when a phone on the Wi-Fi probably can't reach us.</summary>
    public bool LikelyBlocked => AppBlocked || (!PortRuleExists && Error is null);
}

public static class NetworkInfo
{
    private static readonly string[] VirtualHints =
        ["radmin", "vpn", "virtual", "vethernet", "vmware", "hyper-v", "wsl", "bluetooth", "loopback", "tailscale", "zerotier", "hamachi", "npcap"];

    /// <summary>LAN IPv4 addresses a phone on the same Wi-Fi could use, best first.</summary>
    public static IReadOnlyList<LanAddress> LanAddresses()
    {
        var found = new List<LanAddress>();
        foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (nic.OperationalStatus != OperationalStatus.Up) continue;
            if (nic.NetworkInterfaceType is NetworkInterfaceType.Loopback or NetworkInterfaceType.Tunnel) continue;
            var name = $"{nic.Name} {nic.Description}".ToLowerInvariant();
            if (VirtualHints.Any(name.Contains)) continue;
            var props = nic.GetIPProperties();
            bool gateway = props.GatewayAddresses.Any(g => g.Address.AddressFamily == AddressFamily.InterNetwork && !g.Address.Equals(IPAddress.Any));
            foreach (var ua in props.UnicastAddresses)
            {
                if (ua.Address.AddressFamily != AddressFamily.InterNetwork) continue;
                if (!IsLanV4(ua.Address)) continue;
                found.Add(new LanAddress(ua.Address, nic.Name, gateway));
            }
        }
        return found
            .OrderByDescending(a => a.HasGateway)
            .ThenByDescending(a => a.Interface.Contains("wi-fi", StringComparison.OrdinalIgnoreCase) || a.Interface.Contains("wlan", StringComparison.OrdinalIgnoreCase))
            .ToList();
    }

    private static bool IsLanV4(IPAddress ip)
    {
        var b = ip.GetAddressBytes();
        return b[0] == 10 || (b[0] == 172 && b[1] >= 16 && b[1] <= 31) || (b[0] == 192 && b[1] == 168);
    }

    /// <summary>
    /// Requests are only served to loopback and private/link-local ranges so the
    /// cursor stream never leaves the local network even if a port gets forwarded.
    /// </summary>
    public static bool IsLocalNetwork(IPAddress? ip)
    {
        if (ip is null) return false;
        if (ip.IsIPv4MappedToIPv6) ip = ip.MapToIPv4();
        if (IPAddress.IsLoopback(ip)) return true;
        if (ip.AddressFamily == AddressFamily.InterNetwork)
        {
            var b = ip.GetAddressBytes();
            return IsLanV4(ip) || (b[0] == 169 && b[1] == 254); // private ranges + link-local
        }
        if (ip.AddressFamily == AddressFamily.InterNetworkV6)
        {
            var b = ip.GetAddressBytes();
            return ip.IsIPv6LinkLocal || (b[0] & 0xFE) == 0xFC; // fe80::/10, fc00::/7
        }
        return false;
    }

    /// <summary>
    /// Asks Windows (read-only) whether inbound connections to our port are likely allowed.
    /// Runs PowerShell, so call off the UI thread.
    /// </summary>
    public static async Task<FirewallReport> CheckFirewallAsync(int port, string exePath)
    {
        string script = $$"""
            $ErrorActionPreference='SilentlyContinue'
            $p = Get-NetConnectionProfile | Where-Object { $_.IPv4Connectivity -ne 'NoTraffic' } | Select-Object -First 1
            $cat = "$($p.NetworkCategory)" -replace 'DomainAuthenticated','Domain'
            function Active($r) { $r.Enabled -eq 'True' -and $r.Direction -eq 'Inbound' -and ("$($r.Profile)" -eq 'Any' -or "$($r.Profile)" -match $cat) }
            $byPort = @(Get-NetFirewallPortFilter -Protocol TCP | Where-Object { $_.LocalPort -contains '{{port}}' } | Get-NetFirewallRule | Where-Object { Active $_ })
            $byApp = @(Get-NetFirewallApplicationFilter -Program $env:PEEK_EXE | Get-NetFirewallRule | Where-Object { Active $_ })
            $portOk = @(($byPort + $byApp) | Where-Object { $_.Action -eq 'Allow' }).Count -gt 0
            $blocked = @(($byPort + $byApp) | Where-Object { $_.Action -eq 'Block' }).Count -gt 0
            "$($p.Name)|$($p.NetworkCategory)|$portOk|$blocked"
            """;
        try
        {
            var psi = new ProcessStartInfo("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script])
            {
                RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true,
            };
            psi.Environment["PEEK_EXE"] = exePath; // passed as data, never spliced into the script
            using var proc = Process.Start(psi)!;
            string output = (await proc.StandardOutput.ReadToEndAsync()).Trim();
            await proc.WaitForExitAsync();
            var parts = output.Split('|');
            if (parts.Length < 4) return new("?", "?", false, false, "Could not read firewall state");
            return new(parts[0], parts[1], parts[2] == "True", parts[3] == "True", null);
        }
        catch (Exception ex)
        {
            return new("?", "?", false, false, ex.Message);
        }
    }
}
