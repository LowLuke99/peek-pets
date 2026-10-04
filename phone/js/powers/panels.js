// Controls for each power on the Powers screen. A panel gets the power's live state
// and a context ({run, glue, memo, rerender}) and returns DOM. Countdowns tick via
// data-left/data-at attributes so panels only rebuild when the PC sends new state.

import { h } from '../ui/dom.js';
import { fmtClock, fmtDuration, parseTimer, remaining } from '../core/powers.js';

const btn = (text, onclick, extra = {}) => h('button', { class: 'pbtn', type: 'button', text, onclick, ...extra });
const countdown = (leftSec, at) => h('span', { class: 'countdown', 'data-left': String(leftSec ?? 0), 'data-at': String(at ?? Date.now()), text: fmtClock(remaining(leftSec, at, Date.now())) });
const note = (text) => h('p', { class: 'pnote', text });

export const PANELS = {
  breaks: {
    icon: '👀', blurb: '20-20-20 eye breaks, stretch & water nudges',
    build(s) {
      if (!s) return note('Counting your active time…');
      const tired = ['fresh', 'a bit tired', 'tired'][s.tired ?? 0];
      return h('div', {},
        h('div', { class: 'stats' },
          stat(`${s.streakMin ?? 0} min`, 'this stretch'),
          stat(`${s.todayMin ?? 0} min`, 'active today'),
          stat(String(s.breaksToday ?? 0), 'breaks today')),
        note(s.onBreak ? 'On a break. Nice!' : s.snoozedSec > 0 ? `Snoozed for ${fmtDuration(s.snoozedSec)}.` : `Next eye break in about ${s.nextEyesMin ?? 20} min. Your pet looks ${tired}.`),
      );
    },
    extra(ctx) {
      return h('div', { class: 'prow' }, btn('Eye break now', () => { ctx.glue.app.rig.perform('lookFar', 20); ctx.glue.app.ui.say('Look far away with me! 👀', 3000); }));
    },
  },

  focus: {
    icon: '📖', blurb: 'A calm focus timer the pet sits through with you',
    build(s, ctx, at) {
      if (s?.running) {
        return h('div', { class: 'focus' },
          h('div', { class: 'focus__time' }, countdown(s.leftSec, at)),
          note(`${s.minutes}-minute focus. Break nudges wait until it ends.`),
          h('div', { class: 'prow' }, btn('Stop', () => ctx.run('focus', 'stop', {}, 'Stop the focus session'))));
      }
      return h('div', {},
        h('div', { class: 'prow' },
          btn('25 min', () => ctx.run('focus', 'start', { minutes: 25 }, 'Start a focus session'), { 'data-main': '' }),
          btn('50 min', () => ctx.run('focus', 'start', { minutes: 50 }, 'Start a focus session')),
          btn('10 min', () => ctx.run('focus', 'start', { minutes: 10 }, 'Start a focus session'))),
        note('The pet gets a little desk and book, and celebrates when you finish.'));
    },
  },

  media: {
    icon: '🎧', blurb: 'Play/pause, skip and volume for whatever is playing',
    build(s, ctx) {
      const run = (name, label) => () => ctx.run('media', name, {}, label);
      return h('div', {},
        h('div', { class: 'now' },
          h('b', { text: s?.title ?? 'Nothing playing' }),
          h('small', { text: [s?.artist, s?.app].filter(Boolean).join(' · ') || 'Start music on your PC' })),
        h('div', { class: 'prow prow--media' },
          btn('⏮', run('prev', 'Previous track'), { 'aria-label': 'Previous track' }),
          btn(s?.playing ? '⏸' : '▶', run('play_pause', 'Play / pause media'), { 'aria-label': 'Play or pause', 'data-main': '' }),
          btn('⏭', run('next', 'Next track'), { 'aria-label': 'Next track' })),
        h('div', { class: 'prow prow--media' },
          btn('🔉', run('vol_down', 'Volume down'), { 'aria-label': 'Volume down' }),
          btn(s?.muted ? '🔇' : `${s?.volume ?? '–'}%`, run('mute', 'Mute / unmute speakers'), { 'aria-label': 'Mute' }),
          btn('🔊', run('vol_up', 'Volume up'), { 'aria-label': 'Volume up' })));
    },
  },

  watch: {
    icon: '⏳', blurb: 'Tell me when a render, build, install or download is done',
    build(s, ctx) {
      const watches = s?.watches ?? [];
      const list = watches.map((w) => h('div', { class: 'item' },
        h('div', {}, h('b', { text: w.label }), h('small', { text: w.kind === 'downloads' ? `${w.partials ? `${w.partials} downloading` : 'settling'} · ${fmtDuration(w.sinceSec)}` : `${w.cpu ?? 0}% CPU${w.busy ? '' : ' · waiting for it to get busy'} · ${fmtDuration(w.sinceSec)}` })),
        btn('Stop', () => ctx.run('watch', 'cancel', { id: w.id }, 'Stop watching'))));
      const procs = ctx.memo.processes;
      return h('div', {},
        list.length ? h('div', { class: 'items' }, list) : null,
        h('div', { class: 'prow' },
          btn('The busy one', () => ctx.run('watch', 'watch_busy', {}, 'Watch the busiest process'), { 'data-main': '' }),
          btn('Downloads', () => ctx.run('watch', 'watch_downloads', {}, 'Watch the Downloads folder')),
          btn('Pick an app…', async () => {
            ctx.memo.processes = 'loading';
            ctx.rerender();
            const r = await ctx.run('watch', 'processes', {}, 'List busy processes');
            ctx.memo.processes = r.ok ? r.data.processes : null;
            ctx.rerender();
          })),
        procs === 'loading' ? note('Looking at what\'s busy…') : Array.isArray(procs) ? h('div', { class: 'items' }, procs.map((p) => h('div', { class: 'item' },
          h('div', {}, h('b', { text: p.name }), h('small', { text: `${p.cpu}% CPU · ${p.memMb} MB` })),
          btn('Watch', () => { ctx.memo.processes = null; ctx.run('watch', 'watch', { pid: p.pid }, 'Watch a process'); })))) : null);
    },
  },

  health: {
    icon: '🩹', blurb: 'Low disk space, RAM/CPU hogs and heat, with one-tap fixes',
    build(s, ctx) {
      if (!s?.ready) return note('Checking the PC…');
      const drives = (s.drives ?? []).map((d) => h('div', { class: `drive${d.level ? ` drive--${d.level}` : ''}` },
        h('div', { class: 'drive__head' }, h('b', { text: `${d.name}${d.label ? ` ${d.label}` : ''}` }), h('small', { text: `${d.freeGb} GB free of ${Math.round(d.totalGb)} GB` })),
        h('div', { class: 'bar' }, h('i', { style: `width:${Math.max(2, 100 - d.freePct)}%` }))));
      const hints = s.hints ?? ctx.memo.hints;
      return h('div', {},
        h('div', { class: 'stats' },
          stat(s.memory != null ? `${s.memory}%` : '–', 'memory'),
          stat(s.cpu != null ? `${s.cpu}%` : '–', 'CPU'),
          stat(s.throttled ? 'hot!' : s.tempC != null ? `${Math.round(s.tempC)}°` : 'n/a', s.throttled ? 'slowing down' : 'temp')),
        h('div', { class: 'drives' }, drives),
        s.fill ? note(s.fill.daysLeft != null ? `${s.fill.drive} is losing about ${s.fill.gbPerDay} GB a day: full in ~${s.fill.daysLeft} days at this rate.` : `${s.fill.drive} isn't filling up lately. 👍`) : null,
        s.hog ? note(`Biggest app right now: ${s.hog}`) : null,
        hints ? h('div', { class: 'hints' },
          hint('Recycle Bin', hints.recycleGb), hint('Temp files', hints.tempGb), hint('Downloads', hints.downloadsGb)) : null,
        h('div', { class: 'prow prow--wrap' },
          btn('Storage Settings', () => ctx.run('health', 'open_storage', {}, 'Open Storage Settings'), { 'data-main': '' }),
          btn('Where did space go?', async () => { const r = await ctx.run('health', 'space_hints', {}, 'Measure where disk space went'); if (r.ok) { ctx.memo.hints = r.data; ctx.rerender(); } }),
          btn('Disk Cleanup', () => ctx.run('health', 'open_cleanup', {}, 'Open Disk Cleanup')),
          btn('Downloads', () => ctx.run('health', 'open_downloads', {}, 'Open the Downloads folder')),
          btn('Task Manager', () => ctx.run('health', 'open_taskmgr', {}, 'Open Task Manager'))));
    },
  },

  handoff: {
    icon: '✈️', blurb: 'Send text or photos to the PC, grab its clipboard',
    build(s, ctx) {
      const area = h('textarea', { class: 'ptext', rows: '3', maxlength: '4000', placeholder: 'Type or paste something for your PC…', 'aria-label': 'Text to send' });
      const file = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async () => {
        const f = file.files?.[0];
        if (!f) return;
        ctx.glue.app.ui.toast('Sending photo… (allow it on the PC if asked)', 4000);
        const r = await ctx.glue.client.sendPhoto(f);
        ctx.glue.app.ui.toast(r.ok ? 'Photo is in your PC\'s Peek Pets Inbox 📸' : `Photo not sent: ${r.reason ?? 'error'}`, 3000);
      } });
      const send = (to) => async () => {
        const text = area.value.trim();
        if (!text) return area.focus();
        const r = await ctx.run('handoff', 'send_text', { text, to }, 'Send text to this PC');
        if (r.ok) { area.value = ''; ctx.glue.app.ui.toast(to === 'clipboard' ? 'On your PC clipboard: Ctrl+V' : 'Saved to the PC inbox', 2400); }
      };
      const grabbed = ctx.memo.grabbed;
      return h('div', {},
        area,
        h('div', { class: 'prow prow--wrap' },
          btn('To PC clipboard', send('clipboard'), { 'data-main': '' }),
          btn('Save to inbox', send('inbox')),
          btn('Send a photo', () => file.click()), file,
          btn('Grab PC clipboard', async () => { const r = await ctx.run('handoff', 'grab_clipboard', {}, 'Read the PC clipboard (text)'); if (r.ok) {
            ctx.memo.grabbed = r.data.text;
            ctx.rerender();
            clearTimeout(ctx.memo.forget);
            ctx.memo.forget = setTimeout(() => { ctx.memo.grabbed = null; ctx.rerender(); }, 60_000); // don't keep PC secrets around
          } })),
        grabbed ? h('div', { class: 'grabbed' },
          h('textarea', { class: 'ptext', rows: '3', readonly: true, 'aria-label': 'Text from the PC clipboard', value: grabbed }),
          btn('Copy on phone', async (e) => {
            const ta = e.target.parentElement.querySelector('textarea');
            try { await navigator.clipboard.writeText(grabbed); ctx.glue.app.ui.toast('Copied ✓'); }
            catch { ta.select(); ctx.glue.app.ui.toast('Selected: tap Copy'); }
          })) : null,
        note(`Photos and notes land in "${s?.inbox ?? 'Peek Pets Inbox'}" in your user folder.`));
    },
  },

  quick: {
    icon: '🖱️', blurb: 'Find my cursor, lock the PC, mic mute, favourite apps',
    build(s, ctx) {
      const favs = s?.favorites ?? [];
      return h('div', {},
        h('div', { class: 'prow prow--wrap' },
          btn('Where\'s my cursor?', () => { ctx.glue.app.rig.perform('point', 2.4); ctx.run('quick', 'find_cursor', {}, 'Show where the cursor is'); }, { 'data-main': '' }),
          btn(s?.micMuted == null ? 'Mic' : s.micMuted ? '🎙️ Unmute mic' : '🎙️ Mute mic', () => ctx.run('quick', 'mic_toggle', {}, 'Mute / unmute the microphone')),
          btn('🔒 Lock PC', () => { if (confirm('Lock your PC now?')) ctx.run('quick', 'lock', {}, 'Lock this PC'); })),
        favs.length ? h('div', { class: 'prow prow--wrap' }, favs.map((f) => btn(f.label, () => ctx.run('quick', 'launch', { id: f.id }, 'Open a favourite app or site'))))
          : note('Add favourite apps or sites in the companion\'s Powers tab on your PC.'));
    },
  },

  timers: {
    icon: '⏰', blurb: '"Pizza in 12 min": rings on the phone and the PC',
    build(s, ctx, at) {
      const input = h('input', { class: 'ptext ptext--line', placeholder: 'pizza in 12 min', 'aria-label': 'New timer', enterkeyhint: 'go' });
      const start = async (text) => {
        const t = parseTimer(text);
        if (!t) { ctx.glue.app.ui.toast('Try "tea 3 min" or "laundry 1h"'); return input.focus(); }
        await ctx.run('timers', 'add', t, 'Start a timer');
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') start(input.value); });
      const timers = (s?.timers ?? []).map((t) => h('div', { class: 'item' },
        h('div', {}, h('b', { text: t.label }), h('small', {}, countdown(t.leftSec, at), ` of ${fmtDuration(t.totalSec)}`)),
        btn('Cancel', () => ctx.run('timers', 'cancel', { id: t.id }, 'Cancel a timer'))));
      return h('div', {},
        h('div', { class: 'prow' }, input, btn('Start', () => start(input.value), { 'data-main': '' })),
        h('div', { class: 'prow prow--wrap' }, [1, 5, 10, 25].map((m) => btn(`${m} min`, () => ctx.run('timers', 'add', { label: `${m}-minute timer`, seconds: m * 60 }, 'Start a timer')))),
        timers.length ? h('div', { class: 'items' }, timers) : null);
    },
  },

  away: {
    icon: '👋', blurb: 'A tiny summary when you come back to the PC',
    build(s) {
      const last = s?.last;
      if (!last) return note('Step away from the PC for 5+ minutes and I\'ll greet you with what happened.');
      return h('div', {}, note(`Last time you were away ${last.awayMin} min.`),
        last.items?.length ? h('ul', { class: 'pitems' }, last.items.map((i) => h('li', { text: i }))) : null);
    },
  },
};

function stat(value, label) {
  return h('div', { class: 'stat' }, h('b', { text: value }), h('small', { text: label }));
}

function hint(label, gb) {
  return h('div', { class: 'hint' }, h('b', { text: gb == null ? '–' : gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(gb * 1024)} MB` }), h('small', { text: label }));
}

/** Refreshes every countdown under `root` (cheap; called each second). */
export function tickCountdowns(root, now = Date.now()) {
  for (const el of root.querySelectorAll('.countdown')) {
    const text = fmtClock(remaining(Number(el.dataset.left), Number(el.dataset.at), now));
    if (el.textContent !== text) el.textContent = text;
  }
}
