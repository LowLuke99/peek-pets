using System.Runtime.Versioning;
using System.Security.Cryptography;

namespace PeekPets.Companion.Server;

/// <summary>Keeps the local CA's private key (PFX bytes) at rest in a folder.</summary>
public interface IKeyVault
{
    /// <summary>File name inside the certificate folder.</summary>
    string FileName { get; }

    /// <summary>The stored PFX, or null when there is none. Throws <see cref="CryptographicException"/> when unreadable.</summary>
    byte[]? Load(string dir);

    void Save(string dir, byte[] pfx);
}

/// <summary>Windows: encrypted with DPAPI, readable only by this Windows user.</summary>
[SupportedOSPlatform("windows")]
public sealed class DpapiKeyVault : IKeyVault
{
    private static readonly byte[] Entropy = "PeekPets.LocalCA.v1"u8.ToArray();

    public string FileName => "ca.pfx.dpapi";

    public byte[]? Load(string dir)
    {
        var path = Path.Combine(dir, FileName);
        return File.Exists(path) ? ProtectedData.Unprotect(File.ReadAllBytes(path), Entropy, DataProtectionScope.CurrentUser) : null;
    }

    public void Save(string dir, byte[] pfx)
    {
        Directory.CreateDirectory(dir);
        File.WriteAllBytes(Path.Combine(dir, FileName), ProtectedData.Protect(pfx, Entropy, DataProtectionScope.CurrentUser));
    }
}

/// <summary>
/// macOS/Linux: a file only this user can read (folder 0700, file 0600). Not encrypted at
/// rest; on a Mac, FileVault covers the disk. Other users on the machine can't read it.
/// </summary>
[UnsupportedOSPlatform("windows")]
public sealed class OwnerOnlyKeyVault : IKeyVault
{
    public const UnixFileMode FolderMode = UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute;
    public const UnixFileMode FileMode = UnixFileMode.UserRead | UnixFileMode.UserWrite;

    public string FileName => "ca.p12";

    public byte[]? Load(string dir)
    {
        var path = Path.Combine(dir, FileName);
        return File.Exists(path) ? File.ReadAllBytes(path) : null;
    }

    public void Save(string dir, byte[] pfx)
    {
        Directory.CreateDirectory(dir, FolderMode);
        File.SetUnixFileMode(dir, FolderMode); // tighten a folder that already existed
        var path = Path.Combine(dir, FileName);
        // Write a temp file then swap it in, so a crash mid-write can't leave a truncated key
        // (which would silently mint a new CA and make every phone re-trust it).
        var temp = path + ".tmp";
        var options = new FileStreamOptions { Mode = System.IO.FileMode.Create, Access = FileAccess.Write, UnixCreateMode = FileMode };
        using (var stream = new FileStream(temp, options))
        {
            stream.Write(pfx);
            stream.Flush(flushToDisk: true);
        }
        File.SetUnixFileMode(temp, FileMode); // UnixCreateMode only applies to new files
        File.Move(temp, path, overwrite: true);
    }
}
