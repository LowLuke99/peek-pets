using System.Runtime.InteropServices;
using System.Runtime.Versioning;

namespace PeekPets.Companion.Powers;

/// <summary>
/// Minimal Windows Core Audio interop: read the speaker volume and toggle the default
/// microphone's mute. Works with every normal sound driver (no extra software).
/// </summary>
[SupportedOSPlatform("windows")]
internal static class CoreAudio
{
    private enum EDataFlow { eRender = 0, eCapture = 1 }
    private enum ERole { eConsole = 0, eMultimedia = 1, eCommunications = 2 }
    private const int CLSCTX_ALL = 23;

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    private class MMDeviceEnumeratorComObject { }

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDeviceEnumerator
    {
        int NotImpl1();
        [PreserveSig] int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice device);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDevice
    {
        [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
    }

    [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioEndpointVolume
    {
        int RegisterControlChangeNotify(IntPtr notify);
        int UnregisterControlChangeNotify(IntPtr notify);
        int GetChannelCount(out uint count);
        int SetMasterVolumeLevel(float levelDb, ref Guid context);
        int SetMasterVolumeLevelScalar(float level, ref Guid context);
        int GetMasterVolumeLevel(out float levelDb);
        int GetMasterVolumeLevelScalar(out float level);
        int SetChannelVolumeLevel(uint channel, float levelDb, ref Guid context);
        int SetChannelVolumeLevelScalar(uint channel, float level, ref Guid context);
        int GetChannelVolumeLevel(uint channel, out float levelDb);
        int GetChannelVolumeLevelScalar(uint channel, out float level);
        int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid context);
        int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
    }

    private static IAudioEndpointVolume? Endpoint(EDataFlow flow, ERole role)
    {
        try
        {
            var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorComObject();
            if (enumerator.GetDefaultAudioEndpoint(flow, role, out var device) != 0 || device is null) return null;
            var iid = typeof(IAudioEndpointVolume).GUID;
            return device.Activate(ref iid, CLSCTX_ALL, IntPtr.Zero, out var o) == 0 ? o as IAudioEndpointVolume : null;
        }
        catch (COMException) { return null; }
        catch (InvalidCastException) { return null; }
    }

    public static VolumeInfo? SpeakerVolume()
    {
        var ep = Endpoint(EDataFlow.eRender, ERole.eMultimedia);
        if (ep is null) return null;
        try
        {
            ep.GetMasterVolumeLevelScalar(out var level);
            ep.GetMute(out var muted);
            return new VolumeInfo((int)Math.Round(level * 100), muted);
        }
        catch (COMException) { return null; }
        finally { Marshal.ReleaseComObject(ep); }
    }

    public static bool? MicMuted()
    {
        var ep = Endpoint(EDataFlow.eCapture, ERole.eCommunications);
        if (ep is null) return null;
        try { ep.GetMute(out var muted); return muted; }
        catch (COMException) { return null; }
        finally { Marshal.ReleaseComObject(ep); }
    }

    public static bool? ToggleMic()
    {
        var ep = Endpoint(EDataFlow.eCapture, ERole.eCommunications);
        if (ep is null) return null;
        try
        {
            ep.GetMute(out var muted);
            var ctx = Guid.Empty;
            ep.SetMute(!muted, ref ctx);
            return !muted;
        }
        catch (COMException) { return null; }
        finally { Marshal.ReleaseComObject(ep); }
    }
}
