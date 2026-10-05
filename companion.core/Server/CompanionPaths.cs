namespace PeekPets.Companion.Server;

/// <summary>Where the companion keeps its settings, certificates and logs on each OS.</summary>
public static class CompanionPaths
{
    /// <summary>%APPDATA%\PeekPets on Windows, ~/Library/Application Support/PeekPets on macOS.</summary>
    public static string DataDir => OperatingSystem.IsMacOS()
        ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Library", "Application Support", "PeekPets")
        : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "PeekPets");
}
