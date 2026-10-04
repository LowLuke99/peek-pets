# Putting Peek Pets on the App Store

Everything that could be done and checked from this PC is done (✅). The steps marked 🔑
need your accounts. Do them in order; it's about an hour plus Apple's review (usually 1-2 days).

## Already done ✅

| | |
|---|---|
| App works with **no PC** (solo/demo mode, games, shop, friends) | Apple rejects companion-only apps that do nothing alone (4.2) |
| **Privacy manifest** `app/ios/App/App/PrivacyInfo.xcprivacy` (no tracking; user id, messages, game scores for app functionality) | required for new apps |
| App icon without transparency, Peek Pets launch screen, `ITSAppUsesNonExemptEncryption = false` | icon alpha = automatic rejection |
| Chat safety for guideline **1.2** (user-generated content): agree-to-rules at sign-up, profanity + link/email/phone filter, **block** (also from friend requests), **report** (keeps the messages as evidence), moderator **ban**, 24 h review promise, friends-only messaging, opt-in public leaderboard | |
| **Account deletion** in the app (Friends → ⋯ → Delete my chat account), guideline 5.1.1(v) | |
| Privacy policy, terms and support pages served by the chat server (`/privacy`, `/terms`, `/support`) | |
| 6 screenshots at 6.9" (1320×2868): `docs/appstore/screenshot-1…6.png` | regenerate: `node tools/appstore/screenshots.mjs` |
| macOS CI builds the app and checks the manifest/icon/export key on every change | `.github/workflows/mac-setup.yml` |

## Your steps 🔑

1. **Apple Developer Program** ($99/year): developer.apple.com → Enroll (as an individual).
2. **Put the chat server online** (free Cloudflare account), see `server/chat/README.md`:
   ```bash
   cd server/chat
   ```
   ```bash
   npx wrangler login
   ```
   ```bash
   npx wrangler secret put ADMIN_TOKEN
   ```
   (type a long random password: it's your moderator key)
   ```bash
   npm run deploy
   ```
   Then commit `phone/js/friends/config.js` (deploy writes the server address into it).
3. **Contact email** (Apple requires one for chat apps): set `SUPPORT_EMAIL` in
   `server/chat/wrangler.toml`, deploy again. Optional but recommended: `REPORT_WEBHOOK`
   (a Discord channel webhook) so every report pings your phone.
4. **App Store Connect → Apps → +**: name *Peek Pets* (if taken: "Peek Pets: Cursor Pal"),
   bundle id `com.lowluke.peekpets`, SKU `peekpets1`.
5. **Build + upload**: GitHub → Actions → *iOS TestFlight* (needs the 4 secrets listed in
   `docs/NATIVE-APP.md`), or on the Mac: Xcode → Product → Archive → Distribute → App Store
   Connect. Test it from TestFlight on your iPhone first.
6. Fill in the listing with the text below, upload the screenshots, answer the privacy and
   age questions as below, paste the review notes, **Submit for Review**.

## Listing text (copy/paste)

**Subtitle** (30): `Your pet watches your cursor`

**Promotional text**: New: dress-up shop, three mini-games, friends & chat with pet emotes, and four new pets!

**Description**:
```
Meet your new desk buddy! Peek Pets is a squishy little pet that lives on your iPhone and watches your PC's mouse cursor: move the mouse and its eyes follow, live.

• 12 adorable pets: Mochi, Pip, Nimbus, Plum, Sprig, Ember, Puff, Bun, Inky the jelly octopus, Pebble the mossy golem, Lumi the fuzzy moth and Opal the crystal dragon.
• Quick, cute games: Treat Catch, Cup Shuffle (your pet peeks!) and Bubble Pop. Earn coins and level up.
• Shop: hats, glasses and painted worlds for your pet to live in. Every pet keeps its own outfit.
• Friends: add friends with a 6-letter code, chat, send hugs and dances their pet acts out, challenge them to beat your score, and climb the leaderboards.
• Snacks, photo mode, shake & tilt, naps and lots of little reactions.

Works great on its own. Pair it with the free Peek Pets Companion for Windows (same Wi-Fi) and your pet follows your real cursor, helps you take breaks, finds your cursor and more. Nothing goes to the internet except the optional Friends feature.

Friends is safe by design: no email or phone number, only people you add can message you, rude words and contact details are filtered, and you can block and report anyone.
```

**Keywords** (100): `virtual pet,tamagotchi,cute,kawaii,mini games,desk pet,cursor,dress up,friends,chat,squishy`

**Category**: Games → Casual (secondary: Simulation). **Price**: Free. **No in-app purchases.**

**URLs**: Support `https://<your worker>/support` · Privacy `https://<your worker>/privacy`

**Copyright**: `© 2026 LowLuke99`

## Privacy questions (App Privacy)

"Do you collect data?" **Yes**, only for Friends:

| Data type | Linked to user | Tracking | Purpose |
|---|---|---|---|
| Identifiers → **User ID** | Yes | No | App Functionality |
| User Content → **Other User Content** (messages) | Yes | No | App Functionality |
| Gameplay Content | Yes | No | App Functionality |

Everything else: **not collected** (no contact info, location, contacts, health, purchases,
browsing, diagnostics, analytics, ads). The nickname is user content, not a real name.

## Age rating

Answer *Messaging and Chat: Yes*, *User-Generated Content: Yes*, everything else *None/No*.
Expect **13+**. Recommendation: keep 13+ and don't pick the Kids category (Kids apps can't have
open chat and need parental gates).

## Review notes (paste into "Notes for the reviewer")

```
Peek Pets works fully on its own: tap "Play solo (demo)" on first launch. The optional Windows companion app (free, same Wi-Fi) makes the pet follow the PC's cursor; it isn't required for review.

Friends & chat: open Friends (bottom bar), pick a nickname, and you get a 6-letter friend code. To try chat, sign up on a second device or simulator and add one code from the other. Chat is friends-only (both sides must add/accept). Moderation: rude words, links, emails and phone numbers are filtered; users can block (including from friend requests) and report from any chat; reports go to our moderators, who can remove accounts. Account deletion: Friends → ⋯ → Delete my chat account. Privacy policy and terms are linked in the app and at /privacy and /terms on our server.

No account, email, payment or tracking is used. Local Network permission is used only to find the user's own PC.
```

## Notes

* **Art licence**: backdrops and the new-pet concepts were generated with Kling on a paid
  membership; check Kling's current commercial-use terms before publishing.
* **Peek Bot (recommended next)**: a built-in friend that auto-accepts and answers with emotes
  would let reviewers (and lonely new users) try chat without a second device.
* After launch: watch reports (webhook), keep `ADMIN_TOKEN` private, ban with
  `POST /v1/admin/ban {"id": "…"}` (see `server/chat/src/index.js`).
