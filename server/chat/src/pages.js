// Public pages the App Store needs: privacy policy, terms (community rules for chat)
// and support. Plain HTML, no tracking, no external requests.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Peek Pets</title>
<style>
:root{--ink:#3A221C;--soft:#7C645C;--accent:#F2735F;--bg:#FFF6F0}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--ink:#F6E9E4;--soft:#C9B3AB;--bg:#1E1614}}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.6 ui-rounded,-apple-system,system-ui,sans-serif}
main{max-width:720px;margin:0 auto;padding:32px 16px 64px}h1{font-size:34px;margin:0 0 4px}h2{font-size:21px;margin:28px 0 6px}
.muted{color:var(--soft)}a{color:var(--accent)}li{margin:4px 0}
</style></head><body><main>${body}</main></body></html>`;
}

const contact = (env) => (env.SUPPORT_EMAIL ? `<a href="mailto:${esc(env.SUPPORT_EMAIL)}">${esc(env.SUPPORT_EMAIL)}</a>` : 'the contact address in the App Store listing');

export function privacyPage(env) {
  return page('Privacy policy', `
<h1>Privacy policy</h1><p class="muted">Peek Pets · last updated 4 October 2026</p>
<p>Peek Pets is a little pet that lives on your phone and can watch your own PC's cursor. We collect as little as possible.</p>
<h2>On your phone and PC</h2>
<ul><li>Your pet, its bond level, outfits, snacks and game scores are stored <b>only on your phone</b>.</li>
<li>The PC link runs on <b>your own Wi-Fi</b> between your phone and your PC. It never goes through our servers. Your PC shares only what you switch on in the companion app (for example cursor position, battery). It never shares your screen or what you type.</li></ul>
<h2>Friends &amp; chat (optional)</h2>
<p>Only if you turn on Friends, our chat server stores:</p>
<ul><li>the <b>nickname</b> you pick and which pet you show (no email, phone number, real name or location);</li>
<li>a random account id and friend code;</li>
<li>your friend list, friend requests and blocks;</li>
<li>messages and pet emotes between you and your friends, kept for at most <b>30 days</b> (and at most the last 200 per friend);</li>
<li>reports you send, with the recent messages they're about, so a person can review them.</li></ul>
<p>Sign-ups are rate-limited by IP address; the address is used only for that and not kept with your account. We don't sell data, show ads, or use analytics or tracking.</p>
<h2>Deleting your data</h2>
<p>In the app: <b>Friends → ⋯ → Delete my chat account</b>. This removes your account, friends, requests and messages from the server immediately and removes you from your friends' lists. Deleting the app removes everything stored on the phone.</p>
<h2>Children</h2>
<p>Chat only works between people who swap friend codes with each other. You can block and report anyone. Parents can leave Friends switched off; the rest of the app works without it.</p>
<h2>Contact</h2><p>Questions or requests: ${contact(env)}.</p>`);
}

export function termsPage(env) {
  return page('Terms', `
<h1>Terms &amp; community rules</h1><p class="muted">Peek Pets · last updated 4 October 2026</p>
<p>Friends &amp; chat is for people who know each other. By using it you agree to these rules:</p>
<ul><li>Be kind. No bullying, harassment, hate, threats, sexual content, spam or sharing other people's private information.</li>
<li>Only add people you know. Never share passwords, addresses or phone numbers in chat.</li>
<li>Rude words are filtered automatically; trying to get around the filter breaks these rules.</li>
<li>You can <b>block</b> anyone (they disappear from your friends and can't message you) and <b>report</b> anyone. Reports are reviewed within 24 hours and accounts that break the rules are removed.</li></ul>
<p>There is zero tolerance for objectionable content or abusive users. The app is provided as is. Contact: ${contact(env)}.</p>`);
}

export function supportPage(env) {
  return page('Support', `
<h1>Peek Pets support</h1>
<p>Peek Pets is a pet on your iPhone that watches your PC's cursor, plays games, and can chat with friends.</p>
<h2>Linking your PC</h2><p>Run <b>Peek Pets Companion</b> on your Windows PC (same Wi-Fi), open the app, tap your PC under <b>Find your PC</b> and type the code the PC shows. Without a PC the pet still plays solo.</p>
<h2>Friends</h2><p>Open <b>Friends</b>, share your 6-letter code with a friend, and accept their request. Block or report from the ⋯ menu in a chat.</p>
<h2>Contact</h2><p>${contact(env)} · <a href="/privacy">Privacy policy</a> · <a href="/terms">Terms</a></p>`);
}
