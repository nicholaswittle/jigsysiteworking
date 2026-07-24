# Reusable restaurant ordering platform

This project is intentionally structured as a restaurant ordering core with
Jigsy's as its first configuration.

## Reusable core

- Public restaurant website and online ordering entry point
- Menu browsing, modifiers, cart, pickup time, customer details, and notes
- Shared restaurant open/paused state
- Shared menu availability controls
- Secure staff passcode and time-limited session
- Durable customer orders and private order-status token
- Waiting, accepted, rejected, completed, and cancelled order states
- Kitchen ticket and daily receipt-width report printing
- Manual pay-at-pickup mode
- Square-ready payment mode and payment-status fields
- Daily and monthly per-order fee reporting
- Foreground browser notifications and audible new-order alert

## Restaurant-specific configuration

The following must become setup data rather than new application code:

- Restaurant identity, logo, colors, website copy, address, and phone
- Hours and pickup timing
- Menu categories, items, sizes, modifiers, prices, and tax rules
- Online ordering fee and how it is taxed
- Staff passcode and notification recipients
- Printer model and print method
- Payment mode and Square location connection
- Refund, cancellation, outage, and billing rules

## Current safe launch state

- Online ordering starts paused.
- Payments default to manual collection at pickup.
- A completed/paid order, not merely an accepted order, earns the WiSense fee.
- Square connection is represented in the data model but cannot be turned on
  until the owner completes Square authorization.

## Next reusable-platform upgrades

1. Move the Jigsy's menu from the client file into a database-backed restaurant
   catalog.
2. Add an owner setup screen for branding, hours, fees, and menu import.
3. Add Square OAuth and location selection.
4. Validate all prices and taxes on the server from the connected Square
   catalog.
5. Add delayed payment capture: accept completes payment, reject cancels it.
6. Add a push-notification service worker and optional SMS confirmation.
7. Add multi-restaurant routing and separate staff authorization for each
   restaurant.
