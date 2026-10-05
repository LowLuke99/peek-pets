using System.Runtime.InteropServices;

namespace PeekPets.Companion.Platform.Mac;

/// <summary>
/// Thin P/Invoke surface for macOS. Everything the companion reads from the Mac goes through
/// here. None of these calls need the Accessibility or Input Monitoring permission.
/// </summary>
internal static class MacNative
{
    private const string CoreGraphics = "/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics";
    private const string CoreFoundation = "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation";
    private const string LibSystem = "/usr/lib/libSystem.dylib";

    [StructLayout(LayoutKind.Sequential)]
    public struct CGPoint { public double X; public double Y; }

    [StructLayout(LayoutKind.Sequential)]
    public struct CGRect { public double X; public double Y; public double Width; public double Height; }

    public const int CombinedSessionState = 0;      // kCGEventSourceStateCombinedSessionState
    public const uint AnyInputEvent = 0xFFFFFFFF;   // kCGAnyInputEventType
    public const uint LeftButton = 0, RightButton = 1, CenterButton = 2;

    // Global display coordinates: origin at the top-left of the main display, y grows downwards.
    [DllImport(CoreGraphics)] public static extern IntPtr CGEventCreate(IntPtr source);
    [DllImport(CoreGraphics)] public static extern CGPoint CGEventGetLocation(IntPtr evt);
    [DllImport(CoreGraphics)] [return: MarshalAs(UnmanagedType.I1)] public static extern bool CGEventSourceButtonState(int stateId, uint button);
    [DllImport(CoreGraphics)] public static extern double CGEventSourceSecondsSinceLastEventType(int stateId, uint eventType);
    [DllImport(CoreGraphics)] public static extern int CGGetActiveDisplayList(uint maxDisplays, [Out] uint[] displays, out uint count);
    [DllImport(CoreGraphics)] public static extern CGRect CGDisplayBounds(uint display);
    [DllImport(CoreGraphics)] public static extern uint CGMainDisplayID();

    [DllImport(CoreFoundation)] public static extern void CFRelease(IntPtr obj);

    // dns_sd (Bonjour), part of libSystem.
    [DllImport(LibSystem)]
    public static extern int DNSServiceRegister(out IntPtr sdRef, uint flags, uint interfaceIndex,
        [MarshalAs(UnmanagedType.LPUTF8Str)] string? name, [MarshalAs(UnmanagedType.LPUTF8Str)] string regType,
        [MarshalAs(UnmanagedType.LPUTF8Str)] string? domain, [MarshalAs(UnmanagedType.LPUTF8Str)] string? host,
        ushort portNetworkOrder, ushort txtLen, byte[] txtRecord, IntPtr callBack, IntPtr context);

    [DllImport(LibSystem)] public static extern void DNSServiceRefDeallocate(IntPtr sdRef);
}
