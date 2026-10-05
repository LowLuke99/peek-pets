namespace PeekPets.Companion.Facts;

/// <summary>
/// A single piece of PC information the user can choose to share with the pet.
/// Add a new fact by implementing this and listing it in WindowsFacts.All / MacFacts.All.
/// Values must be small JSON-serializable objects; return an "available: false"
/// shape rather than null when the PC simply doesn't have the thing (e.g. no battery).
/// </summary>
public interface IFactProvider
{
    string Key { get; }
    string Label { get; }
    string Description { get; }
    bool DefaultShared { get; }
    TimeSpan Interval { get; }
    object Read();
}
