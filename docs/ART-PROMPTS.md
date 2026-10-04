# Peek Pets art prompt pack (ChatGPT / Kling)

Paste these into ChatGPT (image generation) or Kling. Save results into
**`art/chatgpt/<section>/<name>.png`** using the names given, push or just leave them
in the folder, and tell me: I'll compress them and wire them into the app.

Already made with Kling (2026-10-04, 20 credits): six backdrops (`art/kling/*.png`) and a
new-pet concept sheet (`art/kling/new-pets-concept.png`, now in the app as Inky,
Pebble, Lumi and Opal).

---

## 0. Style bible (paste this first in a ChatGPT chat, then the prompts below)

> You're the art director for **Peek Pets**, a cosy phone pet app. Every image follows this
> style: soft 3D clay and vinyl toy render, rounded chunky shapes, gentle subsurface glow,
> pastel colours with one warm accent, soft studio or golden-hour light, shallow depth of
> field, calm and uncluttered, Pixar-meets-Animal-Crossing charm. No text, no logos, no
> watermarks unless I ask. When I ask for a **backdrop**, it is a vertical 9:16 phone
> wallpaper with a big **empty** floor area in the lower centre (a pet is drawn there by
> the app later), and there must be **no characters, plush toys, animals or people** in it.
> When I ask for an **icon/sticker**, it is a single object centred on a transparent or plain
> white background, filling ~80% of the square.

## 1. Backdrops (9:16, save to `art/chatgpt/backdrops/`)

Each: *"Backdrop: …"* (the style bible covers the rest).

| File | Prompt |
|---|---|
| `rooftop.png` | Backdrop: a rooftop garden at dusk over a sleepy pastel city, string lights, potted lemon trees at the edges, a round wooden deck in the lower centre. |
| `underwater.png` | Backdrop: a calm underwater reef, sun rays from above, soft corals and sea grass at the edges, a smooth round patch of white sand in the lower centre, a few bubbles. |
| `library.png` | Backdrop: a tiny cosy library nook, tall round bookshelves, a reading lamp, a big round cushion-free rug in the lower centre. |
| `cherry.png` | Backdrop: a spring cherry-blossom hill, petals drifting, a pale pink path, a round grassy patch in the lower centre. |
| `desert.png` | Backdrop: a pastel desert at sunrise, rounded dunes and cacti at the edges, a flat round sand patch in the lower centre. |
| `arcade.png` | Backdrop: a soft neon retro arcade, rounded arcade cabinets glowing at the sides, a round glowing floor tile in the lower centre. |
| `rainy.png` | Backdrop: a rainy-day window seat, raindrops on the glass, a mug and a blanket at the edges, a round cushion-free seat area in the lower centre. |
| `halloween.png` | Backdrop: a cute (not scary) pumpkin patch at twilight, glowing jack-o'-lanterns at the edges, a round leaf-covered patch in the lower centre. |
| `winter-fair.png` | Backdrop: a winter festival square, warm stalls and lanterns at the edges, gentle snow, a round snowy patch in the lower centre. |
| `moon.png` | Backdrop: the surface of a soft pastel moon, Earth in the sky, rounded craters at the edges, a smooth round crater floor in the lower centre. |
| `kitchen.png` | Backdrop: a sunny pastel kitchen, jars and a kettle at the edges, a round wooden table top in the lower centre. |
| `garden-pond.png` | Backdrop: a lily pond garden, lily pads and reeds at the edges, a big round stepping stone in the lower centre. |

## 2. New pet concept sheets (16:9, save to `art/chatgpt/pets/`)

Four creatures per sheet, side by side, facing the viewer, big glossy eyes, simple
readable silhouettes (they get redrawn as vector + WebGL clay in the app, so clear shapes
matter more than detail).

| File | Prompt |
|---|---|
| `sheet-ocean.png` | Concept sheet: a puffy pufferfish balloon, a tiny jellyfish with ribbon tentacles, a round sea-otter pup holding a shell, a baby narwhal with a pastel horn. |
| `sheet-sweets.png` | Concept sheet: a strawberry-shortcake slime, a living dumpling with steam curls, a marshmallow ghost, a mochi-ice-cream cat. |
| `sheet-sky.png` | Concept sheet: a tiny thundercloud with a lightning-bolt tail, a hot-air-balloon bird, a paper-plane fox, a sleepy crescent-moon owl. |
| `sheet-forest.png` | Concept sheet: an acorn knight with a cap helmet, a mushroom frog, a pinecone hedgehog, a leaf-wing fairy beetle. |
| `sheet-tech.png` | Concept sheet: a floppy-disk robot, a retro TV head creature, a little satellite pup, a game-controller crab. |
| `turnaround-<pet>.png` | Turnaround of `<one pet you liked>`: front, three-quarter, side and back views on one sheet, same lighting. |

## 3. Snack icons (1:1, transparent/plain, save to `art/chatgpt/snacks/`)

*"Icon: a single cute 3D clay `<snack>` with a tiny glossy highlight."*
`berry` (strawberry) · `cookie` (choc-chip cookie) · `onigiri` (rice ball with nori) ·
`icecream` (soft-serve cone) · `chili` (red chili pepper) · plus new ones: `donut`,
`taiyaki`, `boba` (bubble tea), `cupcake`, `watermelon`, `pancakes`, `dumpling`.

## 4. Wardrobe items (1:1, save to `art/chatgpt/wardrobe/`)

*"Icon: a tiny clay `<item>` for a toy figure, front view."* Used as reference to draw
new vector hats, and as icons. `bow`, `blossom`, `party-hat`, `round-specs`, `beanie`,
`shades`, `crown`, `wizard-hat`, plus new: `pirate-hat`, `flower-crown`, `headphones`,
`chef-hat`, `cat-ears`, `halo`, `viking-helmet`, `santa-hat`, `cowboy-hat`, `bandana`,
`monocle`, `heart-glasses`.

## 5. App icon & branding (save to `art/chatgpt/brand/`)

| File | Prompt |
|---|---|
| `icon-mochi.png` (1:1) | App icon: Mochi, a round coral daruma-shaped blob with a cream face window and big glossy brown eyes, peeking up from the bottom edge, looking up-right as if following a mouse cursor, soft peach gradient background, rounded-square composition, no text. |
| `icon-alt-*.png` (1:1) | Same, but the pet is `<Pip / Nimbus / Inky / Opal>` (alternate icons). |
| `poster.png` (9:16) | Poster: all twelve Peek Pets standing together in a happy group photo on a pastel stage, a tiny mouse cursor floating above them that every pet is looking at, confetti, warm light, no text. |
| `banner.png` (21:9) | Wide banner: the pets peeking over the bottom edge of the frame at a computer cursor in the sky, pastel gradient, room on the left for a title. |
| `splash.png` (9:16) | Splash screen: Mochi asleep on a cloud pillow, soft gradient, big empty space above for the logo. |

## 6. Photo-mode frames & stickers (save to `art/chatgpt/stickers/`)

*"Sticker sheet: 12 cute 3D clay stickers on a plain background, evenly spaced: hearts,
stars, a cursor arrow with a face, a paw print, a speech bubble, a sparkle, a rainbow, a
cloud, a crown, a snack, a camera, a tiny trophy."* Plus polaroid frame borders:
`frame-birthday.png`, `frame-spooky.png`, `frame-winter.png` (*"An empty polaroid photo
frame border decorated with `<theme>` clay decorations around the edge, the middle fully
transparent/empty"*).

## 7. Kling video ideas (optional, ~50 credits each at 1080p)

* Each backdrop as a **subtle living loop** (5 s): fireflies drift, snow falls, waves roll.
  Image-to-video from the backdrop PNG, "static camera, very gentle ambient motion only,
  seamless loop". The app could play these behind the pet.
* A 5 s **trailer shot** from `poster.png`: slow push-in, pets bounce.
