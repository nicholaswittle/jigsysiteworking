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

### ANSWERED: unpaid API orders are invisible to the seller

This was researched in July 2026 and is **settled — no on-site test needed.**
Square's Orders API documentation states:

> "Orders with fulfillments appear on Square products (such as the Square Dashboard
> and Point of Sale application) **only after they're paid for**."
> — https://developer.squareup.com/docs/orders-api/fulfillments

A Square staff member confirmed the same on the developer forum on **7 May 2026**,
answering a developer describing this exact payload: *"we don't currently support
creating unpaid orders via the API that appear on the POS."*
(https://developer.squareup.com/forums/t/inquiry-creating-unpaid-orders-in-square-pos/26028)

Therefore the orders we push on Accept are **invisible to the restaurant**. They
exist and are retrievable through the API, but they do **not** appear on the
register, in Open Tickets, in Order Manager, or in the Dashboard order views. No
Square product tier or subscription changes this — the gate is payment, not plan.

Open Tickets specifically **cannot be created through the Orders API** at all
(Square forums, Apr 2025).

### What every competitor does instead

ChowNow, Owner.com, BentoBox, Popmenu and Slice all **take the card online first**,
which is what makes the Square push work as advertised. Owner.com's help material
calls online payment "a requirement of the Square API." Square's **own** online
ordering product does not offer pay-at-pickup either. Toast avoids the problem only
because Toast *is* the POS — no cross-vendor boundary.

So our architecture (own DB as source of truth, own staff console, own kitchen
ticket) is the correct answer for a pay-in-person product; we simply inherit the
limitation competitors bought their way out of by requiring online payment.

### Decision needed: what is the Square push for?

Given the restaurant cannot see these orders, the `POST /v2/orders` call currently
delivers little operational value. Options:

| Option | Tradeoff |
|---|---|
| **Drop the push** | Simplest. The app is the system; staff ring the sale at the counter as they do today |
| **Keep it as a silent API record** | Useful for reconciliation/reporting, but staff cannot see it — and watch for double counting when the cashier rings the sale separately |
| **Move it to settlement** | Create the Square order when payment actually happens, avoiding a growing pile of permanently-OPEN invisible orders |
| **Invoices API** | The only documented pay-in-person path (cashier: More → Invoices → Add payment). Clunkier UX and it will not auto-print a kitchen ticket |

### Still worth testing on-site (unchanged)

- [ ] Does the app's own kitchen ticket print correctly on the Star TSP100?
- [ ] Is the size/toppings note and customer name legible on that ticket?
- [ ] Does the real-account OAuth connect work (production has no sandbox test-seller gate)?
- [ ] Do the app's totals match what staff ring up (food + $0.99 fee + 6% tax)?

### Known bug to fix if the push is kept

We send `schedule_type: ASAP` together with `pickup_at`. Square's
`OrderFulfillmentPickupDetails` reference states that for ASAP fulfillments
`pickup_at` is set automatically, so our value is ignored. Send
`prep_time_duration` (e.g. `PT30M`) instead, or switch to `SCHEDULED` where
`pickup_at` is honored.

### Related known gap

Line items are sent **ad-hoc** (`item_type: ITEM`), not linked to the restaurant's
Square catalog. Orders print correctly, but they will not roll up into per-item sales
or inventory reporting. Fixing that needs their actual Square catalog — decide with
the owner whether item-level reporting matters to them.

---

## Related

- `docs/CLOUDFLARE-DEPLOY.md` — deploy/runbook
- `docs/OWNER-APPROVAL-CHECKLIST.md` — menu/prices/tax/fee sign-off
