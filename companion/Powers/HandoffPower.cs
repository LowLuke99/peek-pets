using System.Text;
using System.Text.Json;

namespace PeekPets.Companion.Powers;

/// <summary>
/// Saves things sent from the phone into the "Peek Pets Inbox" folder. Images are
/// identified by their bytes (never by the name or type the phone claims), and the file
/// name is made here, so nothing executable can ever be dropped.
/// </summary>
public sealed class InboxStore(string folder, Func<DateTime>? now = null)
{
    public const long MaxImageBytes = 15 * 1024 * 1024;
    public const int MaxTextChars = 4000;
    public const long MaxInboxBytes = 500L * 1024 * 1024;
    public const int MaxInboxFiles = 300;
    public const long MinFreeDiskBytes = 2L * 1024 * 1024 * 1024;
    private readonly Func<DateTime> _now = now ?? (() => DateTime.Now);

    public string Folder { get; } = folder;

    /// <summary>The image type from magic bytes, or null if it isn't an image we accept.</summary>
    public static string? SniffImage(ReadOnlySpan<byte> head)
    {
        if (head.Length >= 3 && head[0] == 0xFF && head[1] == 0xD8 && head[2] == 0xFF) return "jpg";
        if (head.Length >= 8 && head[..8].SequenceEqual(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A })) return "png";
        if (head.Length >= 6 && (head[..6].SequenceEqual("GIF87a"u8) || head[..6].SequenceEqual("GIF89a"u8))) return "gif";
        if (head.Length >= 12 && head[..4].SequenceEqual("RIFF"u8) && head[8..12].SequenceEqual("WEBP"u8)) return "webp";
        if (head.Length >= 12 && head[4..8].SequenceEqual("ftyp"u8))
        {
            var brand = Encoding.ASCII.GetString(head[8..12]);
            if (brand is "heic" or "heix" or "hevc" or "heim" or "heis" or "mif1" or "msf1") return "heic";
        }
        return null;
    }

    /// <summary>Reads a stream fully, or returns null past <paramref name="max"/> bytes.</summary>
    public static async Task<byte[]?> ReadLimitedAsync(Stream body, long max, CancellationToken ct = default)
    {
        using var buffer = new MemoryStream();
        var chunk = new byte[81920];
        int read;
        while ((read = await body.ReadAsync(chunk, ct)) > 0)
        {
            if (buffer.Length + read > max) return null;
            buffer.Write(chunk, 0, read);
        }
        return buffer.ToArray();
    }

    public async Task<string?> SaveImageAsync(Stream body, CancellationToken ct = default)
    {
        var bytes = await ReadLimitedAsync(body, MaxImageBytes, ct);
        return bytes is null ? null : await SaveImageAsync(bytes, ct);
    }

    public async Task<string?> SaveImageAsync(byte[] bytes, CancellationToken ct = default)
    {
        if (bytes.Length > MaxImageBytes) return null;
        var ext = SniffImage(bytes.AsSpan(0, Math.Min(bytes.Length, 32)));
        if (ext is null) return null;
        var path = UniquePath("Photo", ext);
        await File.WriteAllBytesAsync(path, bytes, ct);
        return path;
    }

    /// <summary>Null if there's room for <paramref name="incoming"/> more bytes; otherwise why not.</summary>
    public string? CheckRoom(long incoming)
    {
        try
        {
            if (Directory.Exists(Folder))
            {
                var files = new DirectoryInfo(Folder).GetFiles();
                if (files.Length >= MaxInboxFiles || files.Sum(f => f.Length) + incoming > MaxInboxBytes) return "inbox_full";
            }
            var root = Path.GetPathRoot(Path.GetFullPath(Folder));
            if (root is not null && new DriveInfo(root).AvailableFreeSpace - incoming < MinFreeDiskBytes) return "disk_full";
        }
        catch (IOException) { return "disk_full"; }
        catch (UnauthorizedAccessException) { return "disk_full"; }
        return null;
    }

    public string SaveText(string text)
    {
        var path = UniquePath("Note", "txt");
        File.WriteAllText(path, text.Length > MaxTextChars ? text[..MaxTextChars] : text, new UTF8Encoding(true));
        return path;
    }

    private string UniquePath(string prefix, string ext)
    {
        Directory.CreateDirectory(Folder);
        var stamp = _now().ToString("yyyy-MM-dd HH.mm.ss");
        var path = Path.Combine(Folder, $"{prefix} {stamp}.{ext}");
        for (int i = 2; File.Exists(path); i++) path = Path.Combine(Folder, $"{prefix} {stamp} ({i}).{ext}");
        return path;
    }

    public static string DefaultFolder() =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Peek Pets Inbox");
}

/// <summary>Phone ↔ PC handoff: text to the clipboard or inbox, photos to the inbox, PC clipboard text to the phone.</summary>
public sealed class HandoffPower(InboxStore? inbox = null) : PowerBase
{
    private readonly InboxStore _inbox = inbox ?? new InboxStore(InboxStore.DefaultFolder());
    private int _received;

    public string InboxFolder => _inbox.Folder;
    public override string Key => "handoff";
    public override string Label => "Phone ↔ PC handoff";
    public override string Description => "Send text or a photo from the phone to this PC's clipboard or the \"Peek Pets Inbox\" folder, or grab the PC's copied text. Images and text only.";
    public override IReadOnlyList<CommandSpec> Commands { get; } =
    [
        new("send_text", "Send text to this PC", 20),
        new("send_photo", "Send a photo to the inbox", 12),
        new("grab_clipboard", "Read the PC clipboard (text)", 10, Sensitive: true),
        new("open_inbox", "Open the inbox folder", 6),
    ];

    public override Task<CommandResult> RunAsync(string command, JsonElement args, CommandCaller caller)
    {
        if (Ctx is null) return Task.FromResult(CommandResult.Fail("power_off"));
        switch (command)
        {
            case "send_text":
            {
                var text = Args.Text(args, "text", InboxStore.MaxTextChars, multiline: true);
                var to = Args.OneOf(args, "to", "clipboard", "inbox") ?? "clipboard";
                if (text is null) return Task.FromResult(CommandResult.Fail("bad_args"));
                if (to == "clipboard")
                {
                    Ctx.Actions.SetClipboardText(text);
                    Ctx.Actions.Toast($"📋 From {caller.DeviceName}", $"{Preview(text)}  ({Shape(text)}, copied: Ctrl+V)");
                }
                else
                {
                    if (_inbox.CheckRoom(text.Length * 3) is { } why) return Task.FromResult(CommandResult.Fail(why));
                    var path = _inbox.SaveText(text);
                    Ctx.Actions.Toast($"📥 Note from {caller.DeviceName}", Preview(text), path);
                }
                _received++;
                Ctx.Emit("received", new { kind = "text", to }, fired: false);
                Ctx.StateChanged();
                return Task.FromResult(CommandResult.Success(new { to }));
            }
            case "grab_clipboard":
            {
                var text = Ctx.Actions.GetClipboardText(); // null when empty or marked private (password managers)
                if (string.IsNullOrEmpty(text)) return Task.FromResult(CommandResult.Fail("empty"));
                Ctx.Actions.Toast($"📋 {caller.DeviceName} read your clipboard", $"{Shape(text)} sent to the phone.");
                return Task.FromResult(CommandResult.Success(new { text = text.Length > InboxStore.MaxTextChars ? text[..InboxStore.MaxTextChars] : text }));
            }
            case "open_inbox":
                Directory.CreateDirectory(_inbox.Folder);
                Ctx.Actions.Open(OpenTarget.InboxFolder, _inbox.Folder);
                return Task.FromResult(CommandResult.Success());
            case "send_photo":
                return Task.FromResult(CommandResult.Fail("use_upload")); // photos arrive over POST /api/inbox
        }
        return Task.FromResult(CommandResult.Fail("unknown_command"));
    }

    /// <summary>Called by the server for an authenticated, approved upload (body already read).</summary>
    public async Task<CommandResult> ReceivePhotoAsync(byte[] body, CommandCaller caller)
    {
        if (Ctx is null) return CommandResult.Fail("power_off");
        if (_inbox.CheckRoom(body.Length) is { } why) return CommandResult.Fail(why);
        var path = await _inbox.SaveImageAsync(body);
        if (path is null) return CommandResult.Fail("not_an_image");
        _received++;
        Ctx.Actions.Toast($"🖼️ Photo from {caller.DeviceName}", "Saved to Peek Pets Inbox. Click to show it.", path);
        Ctx.Emit("received", new { kind = "photo", name = Path.GetFileName(path) }, fired: false);
        Ctx.StateChanged();
        return CommandResult.Success(new { name = Path.GetFileName(path) });
    }

    public override object? Snapshot() => new { received = _received, inbox = "Peek Pets Inbox" };

    /// <summary>"3 lines, 120 characters": so a hidden second line in pasted text is visible.</summary>
    private static string Shape(string text)
    {
        int lines = text.Count(c => c == '\n') + 1;
        return lines > 1 ? $"{lines} lines, {text.Length} characters" : $"{text.Length} characters";
    }

    private static string Preview(string text)
    {
        var line = text.Replace('\n', ' ').Replace('\t', ' ');
        return line.Length > 60 ? line[..60] + "…" : line;
    }
}
