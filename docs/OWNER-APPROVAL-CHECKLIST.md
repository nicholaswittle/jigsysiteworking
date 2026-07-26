# Jigsy's Online Ordering — Owner Approval Checklist

Purpose: capture the owner's sign-off before the pilot goes live. Nothing here
should be assumed — the menu, prices and tax treatment in the app are
**placeholders pulled from public info and must be confirmed by an authorized
Jigsy's owner.**

Scope note: there is **no customer fee and no card handling**. Customers order
online and pay at the counter on Jigsy's own Square, exactly as with a phone
order. The app is order intake, staff console and kitchen ticket only.

Fill in the "Owner confirms" column and have the owner initial/date the sign-off
section at the bottom before going live.

## 1. Menu accuracy

The demo menu lives in `demo-data.js`. Confirm each of the following against
Jigsy's current offering:

| Item to confirm | Owner confirms (✓ / correction) |
|---|---|
| All tray types and names are current | |
| All specialty trays are current | |
| Wings / Chick Fil J / sides are current | |
| Any items that should be **removed** | |
| Any items that should be **added** | |
| Modifiers / toppings list and per-topping price | |
| Items not available for online pickup | |

## 2. Prices

| Price point | Owner confirms |
|---|---|
| Tray prices (3 / 6 / 12 cuts) match in-store | |
| Specialty tray prices match in-store | |
| Wings / sides prices match in-store | |
| Topping price (currently modeled per topping) | |
| Any online-only price differences intended? | |

## 3. Tax treatment

- Demo currently applies a **6% tax rate** (`taxRate: 0.06`) to the food subtotal.

| Question | Owner answer |
|---|---|
| Is 6% the correct PA sales-tax rate for these items? | |
| Are any items tax-exempt? | |
| Is tax shown as a separate line (current behavior) OK? | |

## 4. Customer fee — RESOLVED, none charged

There is **no customer-facing service fee**. Customers pay food + tax exactly.
The earlier $0.99 online ordering fee was removed (`feeCents` now defaults to 0)
because the Jigsy's pilot is free — charging customers a fee that funded nothing
would only have made their prices less competitive.

`feeCents` remains a per-restaurant setting, so a future paying client can have a
fee switched on without code changes. Nothing to confirm with the owner here.

## 5. Payment model — RESOLVED, pay at the restaurant

Customers pay **at the counter on Jigsy's own Square**, exactly as with a phone
order. The app never touches money, never handles card data, and no longer pushes
anything into their Square account.

This is a deliberate limit, not an oversight: Square does not surface unpaid
API-created orders to the seller (see `PRODUCTION-PLAN.md` section 3), so the
options were to take payment online or stay out of the payment flow entirely. We
chose the latter — this is the owner's workplace and breaking their payments is
not an acceptable risk.

| Question | Owner answer |
|---|---|
| Confirm staff ring up online orders at the counter as they do phone orders | |
| Is ringing the total as one amount acceptable, or do items need entering individually in Square? | |

## 6. Operational wording & policy

| Item | Owner confirms |
|---|---|
| Pickup-time estimate range is reasonable | |
| Reject/cancel customer messaging is acceptable | |
| Refund customer messaging is acceptable | |
| Outage / "we can't take orders right now" policy | |
| Customer support phone/procedure for order problems | |
| Privacy language for customer name/phone handling | |

## 7. Hardware (separate hands-on test required)

- [ ] Star Micronics **TSP100** tested with a real accepted order ticket
- [ ] Square printer profile confirmed (do **not** promise silent printing until tested)
- [ ] iPad staff console installed to Home Screen (PWA) and confirmed on shop Wi-Fi

## 8. Square — not required for this pilot

The app does not connect to, write to, or take payment through Jigsy's Square.
Nothing needs to be authorized, and no Square credentials are needed to go live.

Outstanding hygiene on our side only:

- [ ] Regenerate the exposed **sandbox** Square secrets/tokens (they appeared in a
      working chat). Sandbox only — no access to any real account.

## 9. Commercial terms

- [ ] Confirm in writing that the pilot is **free**, with an end/review date
- [ ] Confirm WiSense owns the software; Jigsy's has a licence to use it
- [ ] Confirm support is best-effort, not 24/7
- [ ] Agree the social proof exchange: a testimonial, permission to use the
      Jigsy's name as a reference, and a post when it goes live

## Sign-off

- Owner name: ______________________
- Signature / initials: ______________________
- Date: ______________________
- Approved scope (circle): Practice only  /  Live pay-at-counter pilot
