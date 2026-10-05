using System.Diagnostics;
using PeekPets.Companion.Facts;
using PeekPets.Companion.Platform.Mac;
using PeekPets.Companion.Sensors;
using PeekPets.Companion.Server;

namespace PeekPets.Companion.Platform;

/// <summary>Picks the Windows or macOS implementation of each OS-specific piece.</summary>
public static class PlatformServices
{
    public static ICursorSource CreateCursorSource() =>
        OperatingSystem.IsWindows() ? new WindowsCursorSource()
        : OperatingSystem.IsMacOS() ? new MacCursorSource()
        : throw new PlatformNotSupportedException("Peek Pets Companion runs on Windows and macOS.");

    public static IFactProvider[] CreateFacts() =>
        OperatingSystem.IsWindows() ? WindowsFacts.All()
        : OperatingSystem.IsMacOS() ? MacFacts.All()
        : [];

    public static IKeyVault CreateKeyVault() =>
        OperatingSystem.IsWindows() ? new DpapiKeyVault() : new OwnerOnlyKeyVault();

    /// <summary>Null where Bonjour isn't available (the phone can still type the address).</summary>
    public static IServiceAdvertiser? CreateAdvertiser() =>
        OperatingSystem.IsWindows() ? new MdnsAdvertiser()
        : OperatingSystem.IsMacOS() ? new MacBonjourAdvertiser()
        : null;

    private static readonly TimeSpan NameLookupTimeout = TimeSpan.FromSeconds(2);
    private static readonly Lazy<string> FriendlyName = new(ReadFriendlyName);

    /// <summary>
    /// The name the phone shows ("Linked to …"). On a Mac that's the Sharing name
    /// ("Luke's MacBook Air"), not the DNS-style host name.
    /// </summary>
    public static string ComputerName => FriendlyName.Value;

    private static string ReadFriendlyName()
    {
        if (!OperatingSystem.IsMacOS()) return Environment.MachineName;
        try
        {
            var psi = new ProcessStartInfo("/usr/sbin/scutil") { RedirectStandardOutput = true, UseShellExecute = false };
            psi.ArgumentList.Add("--get");
            psi.ArgumentList.Add("ComputerName");
            using var p = Process.Start(psi);
            if (p is null) return Environment.MachineName;
            var output = p.StandardOutput.ReadToEndAsync();
            if (!p.WaitForExit(NameLookupTimeout)) { p.Kill(); return Environment.MachineName; }
            var clean = new string(output.Result.Trim().Where(c => !char.IsControl(c)).Take(40).ToArray()).Trim();
            return clean.Length > 0 ? clean : Environment.MachineName;
        }
        catch (Exception ex) when (ex is System.ComponentModel.Win32Exception or InvalidOperationException)
        {
            return Environment.MachineName;
        }
    }
}
