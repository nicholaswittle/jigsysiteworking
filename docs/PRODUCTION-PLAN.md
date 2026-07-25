# Production Plan — Hosting, Multi-Site, and Square Onboarding

Planning notes for taking the ordering app from the current sandbox test
(public Cloudflare Worker at `jigsys-ordering-demo.wisense.workers.dev`) to a
real pilot and, later, a reusable product. Nothing here is implemented yet.

---

## 1. Hosting & staff-console access

### Single restaurant (Jigsy's)

- **Custom domain** instead of `*.workers.dev` — e.g. `order.jigsys.com` or a
  WiSense-owned domain like `jigsys.wisenseorder.com`. Add it as a Custom Domain
  on the Worker (one CNAME); no code change.
- **Customer** at `/` (or `/order`), **staff** at `/staff` — same app, same
  Worker. The staff console is already PIN + session protected, so a path is fine.
- **Optional staff subdomain** (`kitchen.jigsys.com`) for an extra lock: put
  **Cloudflare Access** in front of it (shop network or staff email login) on top
  of the PIN. Recommended once it's real; not required to start.

### Reselling to other restaurants — two models

| | Per-restaurant deploy (recommended first) | Multi-tenant (later, at scale) |
|---|---|---|
| Setup | Each client: own Worker + D1 + secrets + domain | One Worker + one D1, tenant by subdomain |
| Isolation | Fully isolated data/secrets | Shared infra, logical separation |
| Effort | Repeat the deploy runbook (scriptable) | Code work: dynamic `RESTAURANT_ID`, per-tenant menu/settings/config table |
| Best when | A handful of restaurants / white-label | Many restaurants; per-client deploys become a chore |

The code is **partly ready** for multi-tenant — `orders` and `square_connections`
are keyed by `restaurant_id` — but the menu, settings, and `RESTAURANT_ID` are
per-deploy today. **Recommendation: per-restaurant deploys first** (lowest risk,
clean isolation and billing); move to true multi-tenant only when the deploy count
justifies the engineering. Each client would get `order.theirshop.com` + `/staff`.

---

## 2. How orders reach the restaurant's Square

No card data ever flows through the app; payment is taken at the counter on the
restaurant's own Square.

1. An **authorized person at the restaurant** does a one-time **OAuth connect** —
   clicks "Connect Square," logs into *their own* Square on Square's page, approves,
   and picks the correct **location**. WiSense never sees their password. Square
   returns a token the app stores encrypted.
2. On each accepted order, the app calls Square's **Orders API** (`POST /v2/orders`)
   with the location, line items, the $0.99 fee line, and pickup name/phone/time —
   creating the order in their Square so it shows on the POS and prints.
3. Staff **collect payment at the counter** on their Square. The app only tracks the
   order and the WiSense fee.

### What you need FROM the restaurant

- An **authorized Square user** (owner/admin) to click through the OAuth connect and
  choose the location.
- **Which location** (if they have more than one).
- **Square plan / printer confirmation** — that their setup **auto-prints incoming
  orders** on the kitchen printer (Star TSP100 / Square printer profile). The one
  real-hardware item to verify on-site.
- **Menu, prices, modifiers** — so what the app sends matches their Square catalog.
- **Tax treatment** — whether their Square location applies tax at checkout, or the
  app should send tax lines (today it sends food + $0.99, no tax line).
- Basic **business info** for the customer side: hours, typical pickup time, phone.

### What you must NOT ask them for (and never need)

Their Square **password**, bank/deposit/payout access, payroll, or customer card
numbers. OAuth is exactly what avoids all of that.

### WiSense-side prerequisite for the real (non-sandbox) connection

The WiSense Square Developer app must be in **production** mode with the production
**redirect URL** registered (Square may require app review for production OAuth).
Then the restaurant owner authorizes WiSense's app against their Square account.

---

## 3. On-site test: does the register surface the order?

### The design assumption

The Square push is **additive, not load-bearing**. The app is self-sufficient:

- Orders live in our own D1 database (source of truth)
- Staff are alerted by our own console (repeating sound + browser notifications)
- The kitchen ticket prints from our own "Print ticket" button

So if Square never surfaces the order at the register, **no business operation
stops** — the kitchen already has its ticket and the cashier rings the order up as
a normal walk-in. Keep it this way: do not let the Square sync become a dependency
the restaurant cannot operate without.

### What is genuinely unverified

We create an unpaid order (`POST /v2/orders`, state `OPEN`, `PICKUP` fulfillment in
state `PROPOSED`). API-created orders reliably appear in **Dashboard → Orders**.
What is *not* certain is whether a cashier can pull that order onto the register to
take payment — that varies by Square product tier (Square for Restaurants vs. plain
POS) and settings, and **cannot be determined from Sandbox** (no physical terminal).

Relevant clue: the owner's current workflow is "hit save ticket, type the name, it
prints" — that is Square's **Open Tickets** feature. The crux is whether our API
order lands in *their* Open Tickets list.

### The 10-minute test (run on their live hardware, after OAuth connect)

Push one test order from the app, then check in this order:

- [ ] **Open Tickets** on the register — does it appear, named with the customer?
- [ ] **Orders** tab on the POS app — does it appear, and is there a
      "Take payment" / "Charge" action?
- [ ] **Dashboard → Orders** — it will be here regardless; this is the fallback record.
- [ ] Does the kitchen printer **auto-print** it (Star TSP100 / Square printer profile)?
- [ ] Does the ticket show the size/toppings note and the customer name legibly?
- [ ] Do the Square totals match the app totals exactly (food + $0.99 fee + 6% tax)?

### The two likely outcomes

| Outcome | What it means | Action |
|---|---|---|
| **Order appears in Open Tickets / Orders with a payment action** | Bonus achieved: staff tap the order and take payment against it | Consider dropping the app's backup ticket if Square also auto-prints |
| **Order only lands in Dashboard → Orders** | The register ignores it for live payment | Fallback workflow: kitchen works from our printed ticket, cashier rings it as a walk-in. Still removes the phone call and manual entry |

Only invest in a heavier integration (mapping line items to their Square catalog, or
a Terminal/Invoice flow) if the restaurant actually wants the register to pull the
order up and outcome 2 is what we get.

### Related known gap

Line items are sent **ad-hoc** (`item_type: ITEM`), not linked to the restaurant's
Square catalog. Orders print correctly, but they will not roll up into per-item sales
or inventory reporting. Fixing that needs their actual Square catalog — decide with
the owner whether item-level reporting matters to them.

---

## Related

- `docs/CLOUDFLARE-DEPLOY.md` — deploy/runbook
- `docs/OWNER-APPROVAL-CHECKLIST.md` — menu/prices/tax/fee sign-off
