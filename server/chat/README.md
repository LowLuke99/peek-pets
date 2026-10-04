# Peek Pets friends & chat server

A Cloudflare Worker + Durable Objects (free plan is plenty). It stores nicknames, friend
lists and messages between friends; nothing else. See `src/index.js` for the design notes
and `src/pages.js` for the privacy policy it serves at `/privacy`.

## Put it online (once, ~3 minutes)

```bash
cd server/chat
```
```bash
npm install
```
```bash
npx wrangler login
```
(opens your browser: sign in to Cloudflare, or make a free account there)
```bash
npm run deploy
```

`npm run deploy` publishes it at `https://peekpets-chat.<you>.workers.dev` and writes that
address into `phone/js/friends/config.js`, so the app uses it. Commit that file and re-sync
the iPhone app (`cd app && npm run sync`).

Before inviting people:
* Set a support contact: `SUPPORT_EMAIL` in `wrangler.toml` (shown on /privacy, /support).
* Set a moderator token so you can read reports:
  `npx wrangler secret put ADMIN_TOKEN`, then
  `curl -H "Authorization: Bearer <token>" https://…workers.dev/v1/admin/reports`.

## Develop / test

```bash
npm run dev
```
```bash
npm run e2e
```
`npm run e2e` drives three test users against the local server: 30 checks (sign-up rules,
friend codes, live delivery over WebSocket, filtering, rate limits, report, block, mutual
requests, account deletion). The phone app can point at the local server from
Settings → Friends server (`http://127.0.0.1:8790` on this PC).

## API (all JSON; `Authorization: Bearer <id>.<secret>`)

| | |
|---|---|
| `POST /v1/register` `{name, pet, agree: true}` | → `{id, token, code}` (no email/password) |
| `GET /v1/me` · `DELETE /v1/me` | profile, friends (+unread, last message), requests · delete everything |
| `POST /v1/friends/request` `{code}` · `/accept` `{id}` · `/decline` · `/remove` | friends by 6-letter code; asking someone who asked you = friends |
| `POST /v1/block` `{id}` · `POST /v1/report` `{id, reason}` | block = unfriend + silent refusal; reports keep the last 20 messages for review |
| `GET /v1/messages?friend=` · `POST /v1/messages` `{to, text?, emote?}` · `POST /v1/read` `{friend}` | friends only; text ≤ 280 chars, filtered; emotes: wave hug dance cheer snack love |
| `GET /v1/live?token=` (WebSocket) | live events: `message`, `request`, `friend`, `changed` |
