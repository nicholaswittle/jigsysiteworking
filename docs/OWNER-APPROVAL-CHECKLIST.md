# Jigsy's Online Ordering — Owner Approval Checklist

Purpose: capture the owner's written sign-off on everything a real (real-card)
pilot depends on. Nothing here should be assumed — the current menu, prices, tax
treatment, and fee wording in the demo are **placeholders pulled from public info
and must be confirmed by an authorized Jigsy's owner.**

Fill in the "Owner confirms" column and have the owner initial/date the sign-off
section at the bottom before any real-card pilot.

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

## 4. The $0.99 online ordering fee

- Demo adds a **$0.99 fee** (`feeCents: 99`) to each order total, shown as a
  separate "Online ordering fee" line. Fee is reported only on **completed** paid
  orders; rejected, cancelled, and **refunded** orders earn no fee.

| Question | Owner answer |
|---|---|
| Is $0.99 the agreed customer-facing fee? | |
| Approve customer-facing wording "Online ordering fee"? | |
| Approve receipt wording "$0.99 per completed and paid online order"? | |
| Who keeps the fee, and how/when is it reconciled? | |

## 5. Payment model

| Question | Owner answer |
|---|---|
| Pilot starts as **pay-at-pickup** (no card)? | |
| Or **card at checkout** via Square (needs steps below)? | |
| For card mode: refunds are now supported (full refund from the staff console) — approved? | |

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

## 8. Square (only for a real-card pilot — after the above)

- [ ] Rotate the Sandbox application secret out of any past chat, into the Sites env only
- [ ] Refunds tested end-to-end in Sandbox (authorize → capture → refund)
- [ ] Production Square credentials created/approved
- [ ] An **authorized Jigsy's owner** connects the correct Square **location** via OAuth
- [ ] Written approval to run a tightly controlled live pilot

## Sign-off

- Owner name: ______________________
- Signature / initials: ______________________
- Date: ______________________
- Approved scope (circle): Sandbox practice only  /  Pay-at-pickup pilot  /  Real-card pilot
