# Printer and order-screen plan

## Two views, one order system

The finished system has two web views backed by the same online order database:

1. **Customer ordering:** the public menu where a customer builds and sends a
   pickup request.
2. **Jigsy's staff screen:** a password-protected page kept open on a tablet or
   computer at the restaurant. It receives new requests, lets staff pause
   ordering, and provides **Accept & Print** and **Reject** actions. Rejected
   requests remain in the daily record and do not incur the 99-cent fee.

The staff pickup estimate sets the earliest “ready in about…” option offered to
customers on new requests. It can be adjusted from 10 to 90 minutes; it is not
a countdown, expiration, or automatic cancellation. The separate menu
availability tab includes every item in the online ordering menu so staff can
turn ordering off for sold-out items. Category tabs keep the 52-item control
surface compact and mirror the customer ordering categories.

The current concept demo uses browser-local storage, so its two views only share
orders inside the same browser. A real pilot must replace that local storage
with a hosted database and add staff authentication.

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
waiting orders. Only accepted orders count toward the 99-cent WiSense fee.

## Real pilot work still required

- Hosted order database shared by customer and staff devices
- Password-protected staff access
- New-order notification and live queue updates
- Printer selection and test-ticket setup
- Monthly accepted-order report for `accepted orders × $0.99`
- Backup procedure if internet or the printer is unavailable
