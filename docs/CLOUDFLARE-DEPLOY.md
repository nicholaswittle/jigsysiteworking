# Deploy the ordering app to public Cloudflare Workers + D1

This moves the app off the OpenAI **Sites** host (which forces every visitor to
sign in with a ChatGPT account and is therefore unusable for customers, staff, or
resale) onto a **public** Cloudflare Worker with a D1 database — no login wall.

The app is already Cloudflare-native (`@cloudflare/vite-plugin`, `wrangler`, D1),
so this is a redeploy of the same code, not a rewrite. The ChatGPT gate was added
by the Sites *platform*, not by this repo — a plain `wrangler deploy` has no gate.

> Requires **Node 22.13+** and a Cloudflare account. None of the secret values
> ever go into the repo or into chat — they are set with `wrangler secret put`,
> which prompts for the value directly.

---

## What the build produces

`pnpm build` emits a deployable Worker:

- `dist/server/index.js` — the Worker (`worker/index.ts`: image opt + `/api/*` via
  `handleOrderingApi` + vinext app router)
- `dist/server/wrangler.json` — generated wrangler config (name, `nodejs_compat`,
  D1 binding `DB`, `assets.directory: ../client`)
- `dist/client/*` — static assets (HTML/CSS/JS, images, `sw.js`, `staff.webmanifest`)

The generated config's D1 `database_id` is a **placeholder** unless you pass
`CF_D1_DATABASE_ID` at build time (see step 4). `vite.config.ts` reads:
`CF_D1_DATABASE_ID` and `CF_D1_DATABASE_NAME`.

---

## One-time setup

### 1. Install deps
```bash
corepack enable
pnpm install
```

### 2. Log into Cloudflare
```bash
pnpm dlx wrangler login
```

### 3. Create the D1 database (once)
```bash
pnpm dlx wrangler d1 create jigsys-ordering
```
Copy the `database_id` it prints (a UUID). Keep the name `jigsys-ordering`.

### 4. Build with the real D1 id baked into the generated config
```bash
CF_D1_DATABASE_ID=<paste-uuid> CF_D1_DATABASE_NAME=jigsys-ordering pnpm build
```

### 5. Deploy the Worker
```bash
pnpm dlx wrangler deploy --config dist/server/wrangler.json
```
Wrangler prints the public URL, e.g.
`https://jigsys-ordering-demo.<your-subdomain>.workers.dev`.

The app **self-provisions its schema** on first request (`ensureSchema` creates
tables and adds the `square_refund_id` column), so no manual migration is
required. To pre-apply instead, run the `drizzle/*.sql` files against the DB with
`wrangler d1 execute jigsys-ordering --remote --file drizzle/0000_heavy_penance.sql`
(repeat 0001→0003 in order).

### 6. Set the secrets (values prompted; never committed)
Run from the repo root (wrangler uses the generated config to target the Worker):
```bash
CFG="dist/server/wrangler.json"
pnpm dlx wrangler secret put STAFF_PIN               --config $CFG
pnpm dlx wrangler secret put STAFF_SESSION_SECRET    --config $CFG
pnpm dlx wrangler secret put SQUARE_ENV              --config $CFG   # value: sandbox
pnpm dlx wrangler secret put SQUARE_APPLICATION_ID   --config $CFG
pnpm dlx wrangler secret put SQUARE_APPLICATION_SECRET --config $CFG # the ROTATED sandbox secret
pnpm dlx wrangler secret put SQUARE_TOKEN_ENCRYPTION_KEY --config $CFG
pnpm dlx wrangler secret put SQUARE_REDIRECT_URI     --config $CFG   # see step 7
```
Secrets take effect immediately (no redeploy). Before they are set, the app runs
in manual/pay-at-pickup mode (Square simply reports "not configured").

### 7. Point Square OAuth at the new URL
- `SQUARE_REDIRECT_URI` must be
  `https://<your-worker-url>/api/square/oauth/callback`.
- In the **Square Developer Dashboard → your app → OAuth**, add that exact URL to
  the **Redirect URL** allowlist. OAuth connect will fail until this matches.
- Reconnect Square from the staff **Payments** tab after deploy (the old Sites
  connection/tokens do not carry over).

### 8. Repoint the Vercel redirect at the new public URL
Edit `vercel.json` — change both redirect destinations from
`https://jigsys-ordering-demo.nicholaswittle.chatgpt.site` to the new
`https://<your-worker-url>`, then redeploy Vercel (`vercel --prod`, the CLI path
you already use). Now the pilot link lands on the public app with no login wall.

---

## Redeploying after code changes
```bash
CF_D1_DATABASE_ID=<uuid> CF_D1_DATABASE_NAME=jigsys-ordering pnpm build
pnpm dlx wrangler deploy --config dist/server/wrangler.json
```
Secrets and D1 data persist across deploys.

---

## Notes & caveats

- **No `IMAGES` binding needed.** `worker/index.ts` has a `/_vinext/image`
  optimization route, but the ordering/marketing pages use plain static `<img>`
  tags, so it is never hit. If you later adopt `next/image`, add a Cloudflare
  Images binding named `IMAGES`.
- **Secrets, not vars.** Everything sensitive (Square secret, token encryption
  key, session secret, staff PIN) is a Worker secret. Never put these in
  `wrangler.json`, `.env` committed files, or chat.
- **Custom domain (optional).** Add a route/custom domain in the Cloudflare
  dashboard (e.g. `order.jigsys.com`) and update `SQUARE_REDIRECT_URI` + the
  Square allowlist to match.
- **Resale / multi-tenant.** For another restaurant, repeat with a new D1 database,
  a new Worker name, that tenant's secrets, and its own `RESTAURANT_ID`/menu data.
  Nothing about this deploy is Jigsy-specific except the data and secrets.
- **Rotate the Square Sandbox secret** before entering it here (it was exposed in
  a prior chat).
