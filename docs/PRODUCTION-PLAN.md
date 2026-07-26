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

### DECIDED: the Square push was removed

The `POST /v2/orders` call was deleted. It created records the restaurant could
not see, could not charge against, and that accumulated permanently OPEN in their
account — dead weight with a double-counting risk once the cashier rang the sale
separately. The OAuth connection and token handling remain in the code, dormant,
so a future iteration can revisit without rebuilding.

Options that were considered and rejected for this pilot:

| Option | Why not |
|---|---|
| **Take payment online** | Solves everything — order arrives paid, appears on POS, auto-prints, and app fees become possible. Rejected: this is the owner's workplace and we will not put our software in the path of their money |
| **Terminal API** (`CreateTerminalCheckout` with `order_id`) | Itemized, in-person, card-present, and `app_fee_money` works. Rejected: needs a dedicated Square Terminal/Handheld (~$299, mode-exclusive) and still means we drive their payments |
| **Invoices API** | Verified working: order → customer record → draft invoice → publish → cashier settles via POS More → Invoices → Add payment, with no item re-entry. Rejected for now: it writes a customer record per order into their directory and leaves unpaid invoices to manage |
| **Point of Sale API deep link** | Passes a total only, so Square logs a "Custom Amount" with no itemization; deep links are also brittle on iOS Safari |
| **Cash recording** (`source_id: CASH` + `order_id`) | Genuinely low risk and itemizes in Square, but only covers cash |

### Still worth testing on-site (unchanged)

- [ ] Does the app's own kitchen ticket print correctly on the Star TSP100?
- [ ] Is the size/toppings note and customer name legible on that ticket?
- [ ] Does the real-account OAuth connect work (production has no sandbox test-seller gate)?
- [ ] Do the app's totals match what staff ring up (food + $0.99 fee + 6% tax)?

### If the push is ever restored

Fix this first: we sent `schedule_type: ASAP` together with `pickup_at`. Square's
`OrderFulfillmentPickupDetails` reference states that for ASAP fulfillments
`pickup_at` is set automatically, so our value was ignored. Send
`prep_time_duration` (e.g. `PT30M`) instead, or switch to `SCHEDULED` where
`pickup_at` is honored.

Also note line items were sent ad-hoc (`item_type: ITEM`), not linked to the
restaurant's Square catalog, so they would not roll up into per-item sales or
inventory reporting. Linking needs their catalog and does **not** affect POS
visibility — the gate is payment, not catalog linkage.

---

## 4. Commercial model

**Jigsy's pilot is free.** No customer-facing fee, no invoice to the restaurant.
Cash tips are at their discretion. In exchange we ask for social proof: a
testimonial, permission to use their name as a reference, a post when it goes
live, and ideally a short video of staff using it during a shift.

Why free: automatic per-order fee collection is only possible if payments run
through the Payments or Terminal API (`app_fee_money`), which we ruled out. That
left invoicing the restaurant, and for the owner's own workplace a paid
arrangement was not worth the friction. The reference customer is worth more than
the first hundred dollars.

**The next restaurant pays.** Quote the two parts separately:

- **Setup / build** — one-time, covers menu entry and configuration
- **Monthly maintenance** — hosting, support, updates

A flat monthly rate is a better fit than per-order: it guarantees a revenue floor
regardless of a slow month, and it is easier for an owner to say yes to a
predictable number than a meter. Pitch against commission — DoorDash takes 15–30%
of every ticket; at ~20 orders a day that is thousands a month.

`feeCents` remains a per-restaurant setting, so a customer-facing fee can be
switched back on for a client who wants that model instead.

### Costs

Cloudflare Workers and D1 free tiers comfortably cover a single restaurant's
volume, so infrastructure is effectively $0. The real cost is development and
support time.

### Related known gap

Line items are sent **ad-hoc** (`item_type: ITEM`), not linked to the restaurant's
Square catalog. Orders print correctly, but they will not roll up into per-item sales
or inventory reporting. Fixing that needs their actual Square catalog — decide with
the owner whether item-level reporting matters to them.

---

## Related

- `docs/CLOUDFLARE-DEPLOY.md` — deploy/runbook
- `docs/OWNER-APPROVAL-CHECKLIST.md` — menu/prices/tax/fee sign-off
