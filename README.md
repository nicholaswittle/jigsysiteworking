# WiSense restaurant ordering platform — Jigsy's pilot

This directory contains the reusable WiSense restaurant ordering foundation,
with Jigsy's as the first restaurant configuration.

## Ordering routes

- `index.html` — restaurant website with ordering links controlled by staff
- `order-demo.html` — customer pickup menu, modifiers, and shared order status
- `staff-demo.html` — protected accept, reject, complete, and print queue; automatic daily rollover;
  printable daily reports; pickup-estimate, pause, and categorized full-menu
  availability controls

Orders and restaurant settings use a hosted shared database. Customer and staff
devices see the same order queue, pause state, pickup estimate, and item
availability. Manual-mode payments are collected at pickup. Print actions open
the normal system print dialog with either a kitchen ticket or a full-day order
report.

The ordering and availability screens share the full priced menu represented on
the concept board: 52 items across house trays, specialty trays, gourmet trays,
wings, stromboli and flatbreads, starters, salads, and subs and platters.
Peanut Butter Pie remains on the website board but is not offered online until
an owner-confirmed price is available.

The customer page mirrors the staff-set pickup estimate and uses a private
status token to show Waiting, Accepted, Rejected, or Completed across devices.
SMS remains a future optional notification channel.

The public experience is designed as **one website with optional ordering**.
When staff pauses online orders, every customer-facing ordering link disappears
and the site continues as a normal menu, hours, phone, directions, and
restaurant-information website. Reopening orders restores those links. The
setting is shared through the hosted database so every customer sees the same
state.

The current payment mode is deliberately **manual / pay at pickup**. Only
orders staff marks paid and completed count toward the $0.99 WiSense fee.
Square fields are present in the backend, but live Square payments remain
disabled until an owner completes OAuth authorization and the payment flow is
tested.

See `docs/PRINTER-AND-ORDER-FLOW.md` for the proposed two-screen production
architecture and receipt-printer options. See
`docs/REUSABLE-RESTAURANT-PLATFORM.md` for the reusable product direction.

A redesign concept / practice template for **Jigsy's Brewpub & Restaurant**
(Old Forge–style pizza, Enola, PA). Single self-contained `index.html` plus a
small `images/` folder — no build step, no npm deps.

```
cd C:/development/projects/jigsys_site
python -m http.server 8080   # then visit http://localhost:8080
```

Live: https://jigsysite.vercel.app  
Repo: https://github.com/nicholaswittle/jigsysite

## What's in it

- **Call It In** — phone-order and dine-in only (no online cart). Big tap-to-call
  number, three steps, live open/closed status.
- **Full-bleed photo hero** — venue collage from Jigsy's public graphics; Call
  is the primary CTA.
- **Real Nov 2025 menu** — Old Forge / Specialty / Gourmet / Wings / Stromboli /
  Starters / Salads / Subs, transcribed from published menu images.
- **Live Open/Closed** — Summer 2026 hours; hours table marks "today."
- Old Forge explainer (Red or White · By the Tray · Cut in Squares), story band,
  visit/location, sticky order bar, light/dark theme toggle.
- Document head + Open Graph + `Restaurant` JSON-LD.
- Motion respects `prefers-reduced-motion`; content visible with JS off.

## Photos

`images/` holds assets pulled from `jigsyspizza.com/graphics` for this concept:

| File | Use |
|------|-----|
| `banner_collage.png` | Hero + photo band (building / signage) |
| `img_2956.jpg` | Photo band + story (catering food) |
| `square-logo-full.png` | Favicon |

Tray / wings close-ups are still thin in the public graphics folder — swap in
fresher phone photos when available.

## Design tokens

Inline CSS custom properties in `index.html`: sauce red `#B23A2B`, golden-crust
`#CF9438`, charred anthracite `#17110D`, warm paper `#F7F0E3`.

## Deploy note

Vercel deploy under **wi-sense-llc** is currently CLI-based (not Git-integrated).
After changes: `vercel --cwd . deploy --prod --yes --scope wi-sense-llc`

This is a **concept**, not the official Jigsy's site.
