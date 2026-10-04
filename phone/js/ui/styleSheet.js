// "Style" sheet: the photo button, the backdrop picker (painted scenes) and the
// wardrobe (hats + glasses, unlocked by bond level; locked items show their level).

import { h } from './dom.js';
import { WARDROBE, isUnlocked } from '../core/wardrobe.js';
import { drawItemIcon } from '../pet/outfit.js';
import { BACKDROPS, backdropUrl } from '../core/backdrops.js';

const ICON_PX = 132;

export function styleSheet({ outfit, bonds, accent, petName, backdrop, onWear, onPhoto, onBackdrop }) {
  const grid = h('div', { class: 'wardrobe', role: 'group', 'aria-label': 'Wardrobe' });
  const render = (current) => {
    grid.replaceChildren(...WARDROBE.map((item) => {
      const open = isUnlocked(item, bonds);
      const worn = current[item.slot] === item.id;
      const canvas = h('canvas', { width: String(ICON_PX), height: String(ICON_PX), 'aria-hidden': 'true' });
      drawItemIcon(canvas.getContext('2d'), item.id, ICON_PX, accent);
      return h('button', {
        class: `wear${open ? '' : ' wear--locked'}`, type: 'button', 'data-item': item.id,
        'aria-pressed': String(worn), disabled: !open,
        'aria-label': open ? `${item.name}${worn ? ', wearing' : ''}` : `${item.name}, unlocks at bond level ${item.level}`,
        onclick: () => render(onWear(item.id)),
      }, canvas, h('b', { text: item.name }), open ? null : h('small', { class: 'wear__lock', text: `🔒 Lv ${item.level}` }));
    }));
  };
  render(outfit);
  const scenes = h('div', { class: 'backdrops', role: 'group', 'aria-label': 'Backdrop' });
  const renderScenes = (current) => scenes.replaceChildren(...BACKDROPS.map((b) => {
    const url = backdropUrl(b);
    const thumb = h('i', { class: url ? '' : 'bd--none', 'aria-hidden': 'true' });
    if (url) thumb.style.backgroundImage = `url("${url}")`;
    return h('button', {
      class: 'bd', type: 'button', 'data-backdrop': b.id, 'aria-pressed': String(b.id === current), 'aria-label': b.name,
      onclick: () => { onBackdrop(b.id); renderScenes(b.id); },
    }, thumb, h('small', { text: b.name }));
  }));
  renderScenes(backdrop);
  return h('div', {},
    h('button', { class: 'btn btn--photo', type: 'button', onclick: onPhoto, 'data-action': 'photo' }, `📸  Take a photo of ${petName}`),
    h('p', { class: 'group__title', text: 'Backdrop' }),
    scenes,
    h('p', { class: 'group__title', text: 'Wardrobe' }),
    h('p', { class: 'lead lead--small', text: 'Tap to wear, tap again to take off. More unlock as your bond grows (any pet counts).' }),
    grid,
  );
}

/** Shows a finished photo with Share / Save. Returns { el, dispose }. */
export function photoSheet({ blob, fileName, petName }) {
  const url = URL.createObjectURL(blob);
  const file = typeof File === 'function' ? new File([blob], fileName, { type: 'image/png' }) : null;
  const canShare = Boolean(file && navigator.canShare?.({ files: [file] }));
  const el = h('div', {},
    h('img', { class: 'photo', src: url, alt: `Photo of ${petName}` }),
    h('div', { class: 'btn-row' },
      canShare ? h('button', {
        class: 'btn', type: 'button', text: 'Share…',
        onclick: () => navigator.share({ files: [file], title: petName }).catch(() => {}),
      }) : null,
      h('a', { class: `btn${canShare ? ' btn--ghost' : ''}`, href: url, download: fileName, text: 'Save' }),
    ),
    h('p', { class: 'lead lead--small', text: 'Tip: press and hold the photo to save it to Photos.' }),
  );
  return { el, dispose: () => setTimeout(() => URL.revokeObjectURL(url), 60_000) };
}
