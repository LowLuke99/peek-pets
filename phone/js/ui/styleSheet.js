// "Style" sheet: the wardrobe (hats + glasses, unlocked by bond level) and the photo
// button. Locked items show the level they unlock at.

import { h } from './dom.js';
import { WARDROBE, isUnlocked } from '../core/wardrobe.js';
import { drawItemIcon } from '../pet/outfit.js';

const ICON_PX = 132;

export function styleSheet({ outfit, bonds, accent, petName, onWear, onPhoto }) {
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
  return h('div', {},
    h('button', { class: 'btn btn--photo', type: 'button', onclick: onPhoto, 'data-action': 'photo' }, `📸  Take a photo of ${petName}`),
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
