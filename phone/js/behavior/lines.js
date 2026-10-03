// Short things the pet says. Kept sparse on purpose: a pet that talks constantly is
// tiring. Species can override any key with their own personality lines.

export const LINES = {
  wake: ['Mm? Oh, hi!', '*yawn* Hi!', "I'm up! I'm up!"],
  dizzy: ['Wheee…', 'The room is spinning!', '@_@'],
  hug: ['Aww ♥', 'Warm…', 'Hehe, hi'],
  poke: ['Hey! My eye!', 'Ow, hehe', 'Boop… in the eye?!'],
  cheer: ['Yay!', 'Woohoo!', 'You got this!'],
  nap: ['Nap time…', 'Just resting my eyes…'],
  connect: ['Found {pc}!', 'Hi {pc}! I see your cursor!', 'Linked up!'],
  disconnect: ["Where'd it go?", 'Hmm… PC went quiet.', 'Hello? PC?'],
  'pc-closed': ["PC's taking a break.", 'Bye for now, PC!'],
  charging: ['PC is charging ⚡', 'Snack time for the PC!'],
  'pc-back': ['Welcome back!', 'Oh! You came back!'],
  levelup: ['We leveled up! ♥', 'Best friends: level {level}!'],
  busy: ["PC's working hard!", 'Whoa, busy PC!'],
  hello: ['Hi there!', 'Hello!', 'Oh, hi!'],
  morning: ['Good morning!'],
  night: ['Getting sleepy…'],
};

export function pickLine(key, vars = {}, species = null, rand = Math.random) {
  const options = species?.lines?.[key] ?? LINES[key];
  if (!options?.length) return null;
  const line = options[Math.floor(rand() * options.length)];
  return line.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}
