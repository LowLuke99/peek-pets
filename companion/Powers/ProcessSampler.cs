using System.Diagnostics;

namespace PeekPets.Companion.Powers;

public sealed record ProcessUsage(int Pid, string Name, double Cpu, double MemoryMb);

/// <summary>
/// Per-process CPU (percent of the whole machine) and memory, sampled over a short window.
/// Only process names, ids and usage: nothing about windows, files or contents.
/// </summary>
public static class ProcessSampler
{
    private static readonly HashSet<string> Ignore = new(StringComparer.OrdinalIgnoreCase)
    {
        "Idle", "System", "Memory Compression", "Registry", "Secure System", "smss", "csrss", "wininit", "Interrupts",
    };

    public static async Task<List<ProcessUsage>> SampleAsync(TimeSpan window, int top = 12)
    {
        var first = Snapshot();
        var sw = Stopwatch.StartNew();
        await Task.Delay(window);
        var second = Snapshot();
        double wallMs = sw.Elapsed.TotalMilliseconds * Environment.ProcessorCount;
        int self = Environment.ProcessId;
        var result = new List<ProcessUsage>();
        foreach (var (pid, (name, cpu, mem)) in second)
        {
            if (pid == self || Ignore.Contains(name) || !first.TryGetValue(pid, out var before)) continue;
            double pct = Math.Max(0, (cpu - before.Cpu).TotalMilliseconds / wallMs * 100);
            result.Add(new ProcessUsage(pid, name, Math.Round(pct, 1), Math.Round(mem / 1048576.0)));
        }
        return result.OrderByDescending(p => p.Cpu).ThenByDescending(p => p.MemoryMb).Take(top).ToList();
    }

    public static List<ProcessUsage> TopByMemory(int top = 5)
    {
        int self = Environment.ProcessId;
        return Snapshot()
            .Where(kv => kv.Key != self && !Ignore.Contains(kv.Value.Name))
            .Select(kv => new ProcessUsage(kv.Key, kv.Value.Name, 0, Math.Round(kv.Value.Mem / 1048576.0)))
            .OrderByDescending(p => p.MemoryMb).Take(top).ToList();
    }

    private static Dictionary<int, (string Name, TimeSpan Cpu, long Mem)> Snapshot()
    {
        var map = new Dictionary<int, (string, TimeSpan, long)>();
        foreach (var p in Process.GetProcesses())
        {
            try { map[p.Id] = (p.ProcessName, p.TotalProcessorTime, p.WorkingSet64); }
            catch (Exception) { /* protected or already exited */ }
            finally { p.Dispose(); }
        }
        return map;
    }

    /// <summary>CPU time of one process, or null if it has exited / can't be read.</summary>
    public static TimeSpan? CpuTime(int pid, out string? name)
    {
        name = null;
        try
        {
            using var p = Process.GetProcessById(pid);
            if (p.HasExited) return null;
            name = p.ProcessName;
            return p.TotalProcessorTime;
        }
        catch (Exception) { return null; }
    }
}
