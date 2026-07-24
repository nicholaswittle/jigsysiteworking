# Jigsy's Old Forge Pizza — isolated ordering demo

This directory is a separate clone used to prototype direct pickup ordering
without changing the original Jigsy website concept or its live deployment.

## Demo routes

- `index.html` — existing concept site with links into the isolated demo
- `order-demo.html` — customer pickup menu, modifiers, and a pay-at-pickup request
- `staff-demo.html` — accept, reject, and print queue; automatic daily rollover;
  printable daily reports; pickup-estimate, pause, and categorized full-menu
  availability controls

All orders and settings use browser-local storage. No payment information is
requested, no backend is connected, and nothing reaches the restaurant. The
demo print actions open the normal system print dialog with either a kitchen
ticket or a full-day order report. Orders are retained by date for reporting,
while the active queue shows only the current day.

The ordering and availability screens share the full priced menu represented on
the concept board: 52 items across house trays, specialty trays, gourmet trays,
wings, stromboli and flatbreads, starters, salads, and subs and platters.
Peanut Butter Pie remains on the website board but is not offered online until
an owner-confirmed price is available.

The customer page prominently mirrors the staff-set pickup estimate and keeps a
persistent status card for the latest request. In the browser-local demo it
changes from Waiting to Accepted or Not accepted when staff responds in the
same browser. A production pilot must use the shared database and send the same
outcome by SMS.

The public experience is designed as **one website with optional ordering**.
When staff pauses online orders, every customer-facing ordering link disappears
and the site continues as a normal menu, hours, phone, directions, and
restaurant-information website. Reopening orders restores those links. In the
current demo this setting is browser-local; production must store it in the
shared database so every customer sees the same state.

See `docs/PRINTER-AND-ORDER-FLOW.md` for the proposed two-screen production
architecture and receipt-printer options.

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
