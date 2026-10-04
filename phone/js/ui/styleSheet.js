// The Shop: photo button, backdrops and wardrobe. Things you own: tap to use/wear.
// Things you don't: the coin price; tap to buy (then it's yours to use).

import { h } from './dom.js';
import { WARDROBE, isOwned } from '../core/wardrobe.js';
import { drawItemIcon } from '../pet/outfit.js';
import { BACKDROPS, backdropUrl } from '../core/backdrops.js';

const ICON_PX = 132;

/**
 * @param {{outfit: object, owned: string[], coins: () => number, accent: string, petName: string, backdrop: string,
 *          onWear: (id: string) => object, onPhoto: Function, onBackdrop: (id: string) => void, onBuy: (entry: object) => boolean}} o
 */
export function styleSheet({ outfit, owned, coins, accent, petName, backdrop, onWear, onPhoto, onBackdrop, onBuy }) {
  const wallet = h('p', { class: 'shop__coins' });
  const showCoins = () => { wallet.textContent = `🪙 ${coins()} coins · earn more by playing games`; };
  const has = (entry) => entry.price === 0 || owned.includes(entry.id);
  const tryBuy = (entry) => {
    if (!onBuy(entry)) return false;
    owned = [...owned, entry.id];
    showCoins();
    return true;
  };

  const grid = h('div', { class: 'wardrobe', role: 'group', 'aria-label': 'Wardrobe' });
  const render = (current) => {
    grid.replaceChildren(...WARDROBE.map((item) => {
      const mine = isOwned(item, owned);
      const worn = current[item.slot] === item.id;
      const canvas = h('canvas', { width: String(ICON_PX), height: String(ICON_PX), 'aria-hidden': 'true' });
      drawItemIcon(canvas.getContext('2d'), item.id, ICON_PX, accent);
      return h('button', {
        class: `wear${mine ? '' : ' wear--locked'}`, type: 'button', 'data-item': item.id, 'aria-pressed': String(worn),
        'aria-label': mine ? `${item.name}${worn ? ', wearing' : ''}` : `${item.name}, buy for ${item.price} coins`,
        onclick: () => {
          if (!mine && !tryBuy(item)) return;
          render(onWear(item.id));
        },
      }, canvas, h('b', { text: item.name }), mine ? null : h('small', { class: 'wear__price', text: `🪙 ${item.price}` }));
    }));
  };
  render(outfit);

  const scenes = h('div', { class: 'backdrops', role: 'group', 'aria-label': 'Backdrop' });
  const renderScenes = (current) => scenes.replaceChildren(...BACKDROPS.map((b) => {
    const url = backdropUrl(b);
    const thumb = h('i', { class: url ? '' : 'bd--none', 'aria-hidden': 'true' });
    if (url) thumb.style.backgroundImage = `url("${url}")`;
    const mine = has(b);
    return h('button', {
      class: `bd${mine ? '' : ' bd--locked'}`, type: 'button', 'data-backdrop': b.id, 'aria-pressed': String(b.id === current),
      'aria-label': mine ? b.name : `${b.name}, buy for ${b.price} coins`,
      onclick: () => {
        if (!mine && !tryBuy(b)) return;
        onBackdrop(b.id);
        renderScenes(b.id);
      },
    }, thumb, h('small', { text: mine ? b.name : `🪙 ${b.price}` }));
  }));
  renderScenes(backdrop);
  showCoins();

  return h('div', {},
    wallet,
    h('button', { class: 'btn btn--photo', type: 'button', onclick: onPhoto, 'data-action': 'photo' }, `📸  Take a photo of ${petName}`),
    h('p', { class: 'group__title', text: 'Backdrops' }),
    scenes,
    h('p', { class: 'group__title', text: 'Wardrobe' }),
    h('p', { class: 'lead lead--small', text: 'Tap to wear, tap again to take off. Each pet keeps its own outfit.' }),
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
