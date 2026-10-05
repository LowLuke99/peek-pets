// The Shop: photo button, backdrops and wardrobe. Things you own: tap to use/wear.
// Things you don't: the coin price; tap to buy (then it's yours to use).

import { h } from './dom.js';
import { WARDROBE, isOwned } from '../core/wardrobe.js';
import { BACKDROPS, backdropUrl } from '../core/backdrops.js';

/**
 * @param {{outfit: object, owned: string[], coins: () => number, petName: string, backdrop: string,
 *          onWear: (id: string) => object, onPhoto: Function, onBackdrop: (id: string) => void, onBuy: (entry: object) => boolean}} o
 */
export function styleSheet({ outfit, owned, coins, petName, backdrop, onWear, onPhoto, onBackdrop, onBuy }) {
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
      const pic = h('img', { class: 'wear__img', src: item.img, alt: '', draggable: 'false', loading: 'lazy' });
      return h('button', {
        class: `wear${mine ? '' : ' wear--locked'}`, type: 'button', 'data-item': item.id, 'aria-pressed': String(worn),
        'aria-label': mine ? `${item.name}${worn ? ', wearing' : ''}` : `${item.name}, buy for ${item.price} coins`,
        onclick: () => {
          if (!mine && !tryBuy(item)) return;
          render(onWear(item.id));
        },
      }, pic, h('b', { text: item.name }), mine ? null : h('small', { class: 'wear__price', text: `🪙 ${item.price}` }));
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

/**
 * Shows a finished photo with frame choices and Share / Save. `render(frameId)` makes the
 * photo in another frame (resolves to a PNG blob or null). Returns { el, dispose }.
 * @param {{blob: Blob, fileName: string, petName: string, frames: {id: string, name: string, thumb: string|null}[],
 *          render: (frameId: string) => Promise<Blob|null>}} o
 */
export function photoSheet({ blob, fileName, petName, frames, render }) {
  const urls = [];
  const img = h('img', { class: 'photo', alt: `Photo of ${petName}` });
  const actions = h('div', { class: 'btn-row' });
  const show = (b) => {
    const url = URL.createObjectURL(b);
    urls.push(url);
    img.src = url;
    const file = typeof File === 'function' ? new File([b], fileName, { type: 'image/png' }) : null;
    const canShare = Boolean(file && navigator.canShare?.({ files: [file] }));
    actions.replaceChildren(
      canShare ? h('button', {
        class: 'btn', type: 'button', text: 'Share…',
        onclick: () => navigator.share({ files: [file], title: petName }).catch(() => {}),
      }) : null,
      h('a', { class: `btn${canShare ? ' btn--ghost' : ''}`, href: url, download: fileName, text: 'Save' }),
    );
  };
  let busy = false;
  const chips = h('div', { class: 'frames', role: 'group', 'aria-label': 'Frame' }, ...frames.map((f, i) => h('button', {
    class: 'frame-chip', type: 'button', 'data-frame': f.id, 'aria-pressed': String(i === 0),
    onclick: async (e) => {
      const btn = e.currentTarget;
      if (busy || btn.getAttribute('aria-pressed') === 'true') return;
      busy = true;
      const b = await render(f.id).catch(() => null);
      busy = false;
      if (!b) return;
      for (const c of chips.children) c.setAttribute('aria-pressed', String(c === btn));
      show(b);
    },
  }, f.thumb ? h('img', { src: f.thumb, alt: '', draggable: 'false' }) : h('i', { 'aria-hidden': 'true' }), h('small', { text: f.name }))));
  show(blob);
  const el = h('div', {},
    img,
    chips,
    actions,
    h('p', { class: 'lead lead--small', text: 'Tip: press and hold the photo to save it to Photos.' }),
  );
  return { el, dispose: () => setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 60_000) };
}
