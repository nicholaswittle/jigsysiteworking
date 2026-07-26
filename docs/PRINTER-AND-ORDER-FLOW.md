# Printer and order-screen plan

## Two views, one order system

The finished system has two web views backed by the same online order database:

1. **Customer ordering:** the public menu where a customer builds and sends a
   pickup request.
2. **Jigsy's staff screen:** a passcode-protected page kept open on a tablet or
   computer at the restaurant. It receives new requests, lets staff pause
   ordering, and provides **Accept & Print** and **Reject** actions. Rejected
   requests remain in the daily record and do not incur the 99-cent fee.

The staff pickup estimate sets the earliest “ready in about…” option offered to
customers on new requests. It can be adjusted from 10 to 90 minutes; it is not
a countdown, expiration, or automatic cancellation. The separate menu
availability tab includes every item in the online ordering menu so staff can
turn ordering off for sold-out items. Category tabs keep the 52-item control
surface compact and mirror the customer ordering categories.

The customer ordering page displays that estimate prominently. After a request
is sent, a persistent status card shows Waiting, Accepted, or Not accepted. A
production pilot should update that card through the shared database and send
the same accepted/rejected result to the supplied phone number by SMS so the
customer does not need to keep the page open.

The pilot build uses a hosted shared database. Orders, status changes, pause
state, pickup estimates, and menu availability update across customer and staff
devices. The staff console uses a server-validated passcode and a time-limited
secure session cookie.

## Pilot printing

For an inexpensive pilot, connect an 80 mm receipt printer to the computer or
tablet running the staff screen. **Accept & Print** opens the device's normal
print dialog with a receipt-sized kitchen ticket. Staff chooses the receipt
printer and prints.

This requires no payment integration. Jigsy's collects the food total, tax, and
the 99-cent online-ordering fee at pickup.

## Reliable production printing

For one-click or automatic printing, install a small print bridge on an
always-on restaurant computer:

- **PrintNode:** a hosted print service with a local client. The application can
  submit PDF or RAW print jobs through its API.
- **QZ Tray:** a local browser-to-printer bridge that supports common receipt
  printer formats including ESC/POS. Silent printing requires signed requests.

The practical pilot sequence is:

1. Identify the printer model and whether it is USB, Ethernet, or Wi-Fi.
2. Install it normally on the staff computer and confirm a test page prints.
3. Test the browser print-dialog version.
4. Add PrintNode or QZ Tray only if Jigsy's wants one-click or automatic
   printing with no dialog.

## Daily reporting

The active queue rolls over automatically at local midnight instead of deleting
orders. Staff can choose a date in **Daily report** and print a receipt-width
record of every request received, including accepted, rejected, and still
waiting orders. Only orders marked **Paid / Completed** count toward the
99-cent WiSense fee. Accepted orders remain in progress until staff confirms
payment at pickup.

## Implemented pilot foundation

- Hosted order database shared by customer and staff devices
- Passcode-protected staff access
- New-order polling, audible alert, and browser notification support
- Accept, reject, print, reprint, and mark-paid/completed actions
- Shared pause, pickup estimate, and full-menu availability settings
- Permanent daily reports with `completed paid orders × $0.99`
- Manual pay-at-pickup mode with a Square-ready payment status field

## Work still required before a live restaurant launch

- Owner confirmation of every menu price, modifier, tax rule, and operating hour
- Production staff passcode and owner-controlled recovery procedure
- Receipt-printer model selection and a physical test-ticket session
- Background push notifications if alerts must work while the iPad web app is
  closed
- Customer SMS provider and approved message wording, if SMS is required
- Square OAuth approval and delayed-capture payment integration
- Server-side Square catalog price validation before online card payments are
  enabled
- Written refund, cancellation, outage, and monthly billing procedures

The system launches safely with online ordering paused and manual payments
enabled. Square mode must not be switched on until an owner authorizes the
connection and live payment tests pass.
