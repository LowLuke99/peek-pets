using System.Formats.Asn1;
using System.Net;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;

namespace PeekPets.Companion.Server;

/// <summary>
/// A private certificate authority for the optional "install as app" (HTTPS) mode.
/// iPhones only allow offline web apps, Wake Lock and secure WebSockets on HTTPS, and a
/// LAN IP can't get a public certificate, so the user trusts this CA once on the phone.
///
/// Safety: the CA carries X.509 Name Constraints limiting it to private LAN addresses
/// and .local names, so even if its key leaked it could not impersonate real websites.
/// The private key never leaves this PC (stored under %APPDATA%\PeekPets\certs).
/// </summary>
public sealed class LocalCertificates
{
    private const string CaFile = "ca.pfx";
    private static readonly TimeSpan CaLifetime = TimeSpan.FromDays(365 * 5);
    private static readonly TimeSpan LeafLifetime = TimeSpan.FromDays(390);

    private readonly string _dir;
    private X509Certificate2? _ca;
    private X509Certificate2? _leaf;
    private string _leafKey = "";

    public LocalCertificates(string? dir = null)
    {
        _dir = dir ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "PeekPets", "certs");
    }

    public X509Certificate2 Authority => _ca ??= LoadOrCreateAuthority();

    /// <summary>DER bytes of the CA certificate (public part only) for the phone to download.</summary>
    public byte[] AuthorityDer => Authority.Export(X509ContentType.Cert);

    /// <summary>Server certificate for the given LAN addresses; re-issued when they change.</summary>
    public X509Certificate2 ServerCertificate(IReadOnlyList<IPAddress> addresses, string hostName)
    {
        var key = string.Join(",", addresses.Select(a => a.ToString()).Order()) + "|" + hostName;
        if (_leaf is not null && key == _leafKey && _leaf.NotAfter > DateTime.Now.AddDays(7)) return _leaf;
        _leaf = IssueLeaf(addresses, hostName);
        _leafKey = key;
        return _leaf;
    }

    private X509Certificate2 LoadOrCreateAuthority()
    {
        var path = Path.Combine(_dir, CaFile);
        if (File.Exists(path))
        {
            try
            {
                var existing = new X509Certificate2(File.ReadAllBytes(path), (string?)null, X509KeyStorageFlags.Exportable | X509KeyStorageFlags.EphemeralKeySet);
                if (existing.NotAfter > DateTime.Now.AddDays(30) && existing.HasPrivateKey) return existing;
            }
            catch (CryptographicException) { /* regenerate below */ }
        }

        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var name = new X500DistinguishedName($"CN=Peek Pets Local CA ({Environment.MachineName}), O=Peek Pets");
        var req = new CertificateRequest(name, key, HashAlgorithmName.SHA256);
        req.CertificateExtensions.Add(new X509BasicConstraintsExtension(true, true, 0, true));
        req.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.KeyCertSign | X509KeyUsageFlags.CrlSign, true));
        req.CertificateExtensions.Add(new X509SubjectKeyIdentifierExtension(req.PublicKey, false));
        req.CertificateExtensions.Add(NameConstraints());
        var now = DateTimeOffset.UtcNow.AddMinutes(-5);
        var ca = req.CreateSelfSigned(now, now + CaLifetime);

        Directory.CreateDirectory(_dir);
        File.WriteAllBytes(path, ca.Export(X509ContentType.Pfx));
        return new X509Certificate2(ca.Export(X509ContentType.Pfx), (string?)null, X509KeyStorageFlags.Exportable | X509KeyStorageFlags.EphemeralKeySet);
    }

    private X509Certificate2 IssueLeaf(IReadOnlyList<IPAddress> addresses, string hostName)
    {
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var req = new CertificateRequest($"CN={hostName}.local", key, HashAlgorithmName.SHA256);
        var san = new SubjectAlternativeNameBuilder();
        san.AddDnsName($"{hostName.ToLowerInvariant()}.local");
        san.AddDnsName("localhost");
        san.AddIpAddress(IPAddress.Loopback);
        foreach (var ip in addresses) san.AddIpAddress(ip);
        req.CertificateExtensions.Add(san.Build());
        req.CertificateExtensions.Add(new X509BasicConstraintsExtension(false, false, 0, true));
        req.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.DigitalSignature, true));
        req.CertificateExtensions.Add(new X509EnhancedKeyUsageExtension([new Oid("1.3.6.1.5.5.7.3.1")], false));
        req.CertificateExtensions.Add(X509AuthorityKeyIdentifierExtension.CreateFromCertificate(Authority, true, false));

        var now = DateTimeOffset.UtcNow.AddMinutes(-5);
        var notAfter = now + LeafLifetime < Authority.NotAfter ? now + LeafLifetime : new DateTimeOffset(Authority.NotAfter);
        var serial = RandomNumberGenerator.GetBytes(12);
        serial[0] &= 0x7F;
        using var signed = req.Create(Authority, now, notAfter, serial);
        using var withKey = signed.CopyWithPrivateKey(key);
        // Round-trip through PFX so SChannel (Kestrel on Windows) can use the key.
        return new X509Certificate2(withKey.Export(X509ContentType.Pfx), (string?)null, X509KeyStorageFlags.Exportable);
    }

    /// <summary>
    /// RFC 5280 NameConstraints: permitted iPAddress 10/8, 172.16/12, 192.168/16,
    /// 169.254/16, 127/8 and dNSName "local" + "localhost".
    /// </summary>
    internal static X509Extension NameConstraints()
    {
        var w = new AsnWriter(AsnEncodingRules.DER);
        using (w.PushSequence())
        {
            using (w.PushSequence(new Asn1Tag(TagClass.ContextSpecific, 0, true))) // permittedSubtrees
            {
                foreach (var dns in new[] { "local", "localhost" })
                {
                    using (w.PushSequence()) w.WriteCharacterString(UniversalTagNumber.IA5String, dns, new Asn1Tag(TagClass.ContextSpecific, 2));
                }
                foreach (var (net, mask) in new[] {
                    ("10.0.0.0", "255.0.0.0"), ("172.16.0.0", "255.240.0.0"), ("192.168.0.0", "255.255.0.0"),
                    ("169.254.0.0", "255.255.0.0"), ("127.0.0.0", "255.0.0.0") })
                {
                    using (w.PushSequence())
                    {
                        var bytes = IPAddress.Parse(net).GetAddressBytes().Concat(IPAddress.Parse(mask).GetAddressBytes()).ToArray();
                        w.WriteOctetString(bytes, new Asn1Tag(TagClass.ContextSpecific, 7));
                    }
                }
            }
        }
        return new X509Extension("2.5.29.30", w.Encode(), critical: true);
    }
}
