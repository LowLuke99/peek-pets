// A gentle bond meter per pet. It only goes up from attention and drifts down very
// slowly, never below the start of the current level, so ignoring the pet never
// takes away anything you earned.

export const HEARTS_PER_LEVEL = (level) => 12 + level * 8;

export function levelFor(hearts) {
  let level = 1;
  let floor = 0;
  while (hearts >= floor + HEARTS_PER_LEVEL(level)) {
    floor += HEARTS_PER_LEVEL(level);
    level++;
  }
  return { level, floor, next: floor + HEARTS_PER_LEVEL(level), progress: (hearts - floor) / HEARTS_PER_LEVEL(level) };
}

export function addHearts(bond, amount) {
  const hearts = Math.max(0, (bond?.hearts ?? 0) + amount);
  const before = levelFor(bond?.hearts ?? 0).level;
  const info = levelFor(hearts);
  return { hearts, level: info.level, leveledUp: info.level > before };
}
