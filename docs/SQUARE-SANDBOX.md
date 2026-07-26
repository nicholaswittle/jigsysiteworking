# Square Sandbox practice connection

The staff console can authorize a Square Sandbox test business through OAuth.
Sandbox uses fake businesses, fake cards, and test payments. It does not move
real money.

## What is implemented

- Protected Square application values are stored in the hosting environment,
  not in GitHub or browser code.
- Staff can open **Payments → Connect Square Sandbox**.
- Square handles the sign-in and authorization screen.
- The server exchanges the one-time authorization code for Square tokens.
- Tokens are encrypted with AES-GCM before they are written to the database.
- The staff screen shows the connected Square test location without exposing
  tokens.
- Staff can disconnect the test account.
- Staff can separately turn **Square Sandbox card checkout** on or off.
- When checkout is on, a customer test card is authorized when the order is
  submitted. Square captures it only after staff accepts the order, and voids
  it if staff rejects the order.
- OAuth access tokens are refreshed server-side when needed. Square credentials
  and payment tokens never enter the browser or repository.

## One Square Developer Console setting

Add this exact Sandbox redirect URL to the application's OAuth settings:

`https://jigsys-ordering-demo.nicholaswittle.chatgpt.site/api/square/oauth/callback`

Square requires an exact match. A different hostname, path, or trailing slash
will cause authorization to fail.

## Practice test

1. Open the private staff console and sign in with the staff passcode.
2. Open the **Payments** tab.
3. Select **Connect Square Sandbox**.
4. On Square's page, sign into a Sandbox test account and approve the requested
   permissions.
5. Confirm the staff screen says **Connected** and displays the test location.
6. Turn on **Sandbox card checkout**.
7. Open the customer order page and submit a test order with Square's Sandbox
   Visa number `4111 1111 1111 1111`, CVV `111`, any future expiration date,
   and a valid ZIP code such as `17025`.
8. Accept the order in the staff console to capture the test authorization, or
   reject it to void the authorization.
9. Use **Disconnect test account** when the practice connection is no longer
   needed.

No production Square credentials, real cards, or live money should be used
until the Sandbox flow has passed end-to-end testing and the owners explicitly
approve production activation.
