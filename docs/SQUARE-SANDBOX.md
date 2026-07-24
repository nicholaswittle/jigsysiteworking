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
- Customer payment remains **manual / pay at pickup**. Connecting Square alone
  does not activate card checkout.

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
6. Use **Disconnect test account** when the practice connection is no longer
   needed.

## Next payment milestone

After this connection is verified, the separate checkout milestone is:

1. Load Square's Web Payments SDK on the customer checkout page.
2. Use a Square Sandbox test card to create a one-time payment token.
3. Send that token to the server.
4. Create a Square order and payment for the verified server-side total.
5. Keep rejected orders at a $0.00 WiSense fee and count only completed, paid
   orders.

No production Square credentials, real cards, or live money should be used
until the Sandbox flow has passed end-to-end testing and the owners explicitly
approve production activation.
