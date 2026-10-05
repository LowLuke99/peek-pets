"""Turns the raw ChatGPT art in art/chatgpt/ into the small files the app ships.

    python tools/art/build-art.py

  backdrops/*.png  -> phone/backdrops/<id>.webp        (720 px wide)
  snacks/*.png     -> phone/img/snacks/<id>.webp       (trimmed, 160 px square)
  wardrobe/*.png   -> phone/img/wardrobe/<id>.webp     (trimmed to the item, 256 px max)
  stickers/frame-* -> phone/img/frames/<id>.webp       (900 px wide) + window boxes printed
  brand/icon-mochi -> iOS AppIcon 1024 (opaque), PWA icons 180/192/512
  brand/splash     -> iOS Splash 2732 square (portrait art centred over a blurred fill)
  brand/poster, banner -> docs/img/

Raw PNGs stay in art/ (git-ignored); the outputs are committed. Needs Pillow.
"""
from pathlib import Path
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'art' / 'chatgpt'
PHONE = ROOT / 'phone'
IOS = ROOT / 'app' / 'ios' / 'App' / 'App' / 'Assets.xcassets'

# Source file name -> id used in the app (only where they differ).
WARDROBE_IDS = {
    'blossom': 'flower', 'party-hat': 'party', 'round-specs': 'specs', 'wizard-hat': 'wizard',
    'pirate-hat': 'pirate', 'flower-crown': 'flowercrown', 'chef-hat': 'chef', 'cat-ears': 'catears',
    'viking-helmet': 'viking', 'santa-hat': 'santa', 'cowboy-hat': 'cowboy', 'heart-glasses': 'heartglasses',
}
BACKDROP_IDS = {'garden-pond': 'pond', 'winter-fair': 'winterfair'}


def save_webp(im, path, quality=80):
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, 'WEBP', quality=quality, method=6)
    return path.stat().st_size


def trim(im, pad=0.04):
    """Crops to the visible (non-transparent) pixels plus a little padding."""
    box = im.getchannel('A').point(lambda a: 255 if a > 12 else 0).getbbox()
    im = im.crop(box)
    p = round(max(im.size) * pad)
    out = Image.new('RGBA', (im.width + 2 * p, im.height + 2 * p), (0, 0, 0, 0))
    out.paste(im, (p, p))
    return out


def fit(im, max_side):
    k = max_side / max(im.size)
    return im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS) if k < 1 else im


def backdrops():
    total = 0
    for f in sorted((SRC / 'backdrops').glob('*.png')):
        im = Image.open(f).convert('RGB')
        im = im.resize((720, round(720 * im.height / im.width)), Image.LANCZOS)
        total += save_webp(im, PHONE / 'backdrops' / f'{BACKDROP_IDS.get(f.stem, f.stem)}.webp', 74)
    print(f'backdrops: {total // 1024} KB')


def squares(section, out_dir, side, ids=None):
    total = 0
    for f in sorted((SRC / section).glob('*.png')):
        im = trim(Image.open(f).convert('RGBA'))
        s = max(im.size)
        sq = Image.new('RGBA', (s, s), (0, 0, 0, 0))
        sq.paste(im, ((s - im.width) // 2, (s - im.height) // 2))
        total += save_webp(sq.resize((side, side), Image.LANCZOS), out_dir / f'{(ids or {}).get(f.stem, f.stem)}.webp', 82)
    print(f'{section}: {total // 1024} KB')


def wardrobe():
    total = 0
    for f in sorted((SRC / 'wardrobe').glob('*.png')):
        im = fit(trim(Image.open(f).convert('RGBA'), pad=0.01), 256)
        total += save_webp(im, PHONE / 'img' / 'wardrobe' / f'{WARDROBE_IDS.get(f.stem, f.stem)}.webp', 84)
    print(f'wardrobe: {total // 1024} KB')


def window_box(im):
    """The transparent window inside a frame: the largest see-through box around the centre."""
    a = im.getchannel('A')
    w, h = im.size
    cx, cy = w // 2, h // 2
    clear = lambda x, y: a.getpixel((x, y)) < 40
    l = cx
    while l > 0 and clear(l - 1, cy): l -= 1
    r = cx
    while r < w - 1 and clear(r + 1, cy): r += 1
    t = cy
    while t > 0 and clear(cx, t - 1): t -= 1
    b = cy
    while b < h - 1 and clear(cx, b + 1): b += 1
    return l / w, t / h, (r + 1) / w, (b + 1) / h


def frames():
    for f in sorted((SRC / 'stickers').glob('frame-*.png')):
        im = Image.open(f).convert('RGBA')
        box = window_box(im)
        im = im.resize((900, round(900 * im.height / im.width)), Image.LANCZOS)
        size = save_webp(im, PHONE / 'img' / 'frames' / f'{f.stem[6:]}.webp', 84)
        print(f'frame {f.stem[6:]}: {size // 1024} KB, aspect {im.width / im.height:.4f}, window {tuple(round(v, 4) for v in box)}')


def icons():
    src = Image.open(SRC / 'brand' / 'icon-mochi.png').convert('RGB')
    inset = 90  # ChatGPT drew a rounded square on white: cut the white corners off (iOS masks its own)
    icon = src.crop((inset, inset, src.width - inset, src.height - inset)).resize((1024, 1024), Image.LANCZOS)
    icon.save(IOS / 'AppIcon.appiconset' / 'AppIcon-512@2x.png', optimize=True)
    for side in (180, 192, 512):
        icon.resize((side, side), Image.LANCZOS).save(PHONE / 'icons' / f'icon-{side}.png', optimize=True)
    print('icons: iOS 1024 + PWA 180/192/512')

    art = Image.open(SRC / 'brand' / 'splash.png').convert('RGB')
    S = 2732
    fill = art.resize((S, S), Image.LANCZOS).filter(ImageFilter.GaussianBlur(60))
    tall = art.resize((round(S * art.width / art.height), S), Image.LANCZOS)
    fill.paste(tall, ((S - tall.width) // 2, 0))
    for name in ('splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'):
        fill.save(IOS / 'Splash.imageset' / name, optimize=True)
    print('splash: 2732 square')

    docs = ROOT / 'docs' / 'img'
    for name, width in (('poster', 720), ('banner', 1280)):
        im = Image.open(SRC / 'brand' / f'{name}.png').convert('RGB')
        im.resize((width, round(width * im.height / im.width)), Image.LANCZOS).save(docs / f'{name}.jpg', quality=84, optimize=True)
    print('docs: poster + banner')


if __name__ == '__main__':
    backdrops()
    squares('snacks', PHONE / 'img' / 'snacks', 160)
    wardrobe()
    frames()
    icons()
