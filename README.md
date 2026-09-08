# Biszone — Authentication Foundation

This version adds working Customer, Vendor/Service Provider and Admin login roles.

## Run
1. Install Node.js 20+.
2. Open a terminal in this folder.
3. Run `npm install`
4. Run `npm start`
5. Open http://localhost:3000

## Test accounts
Public registration:
- Customer: choose Customer in the registration form.
- Vendor: choose Vendor / Service Provider.

Demo admin:
- Email: admin@biszone.com
- Password: ChangeMe123!

Change the admin credentials before production:
- BISZONE_ADMIN_EMAIL
- BISZONE_ADMIN_PASSWORD

## Important
This foundation uses in-memory users/sessions for development, so restarting the server clears newly registered accounts and sessions. Before launch, move users/sessions to a real database and use secure HTTP-only cookies, HTTPS, rate limiting, CSRF protection where applicable, email verification/password reset, and production secrets.

The payment system should remain separate and use official PayPal/Binance/crypto provider APIs with server-side verification and webhooks.


## Payment account configuration
The development build is configured with:
- PayPal receiving email: `edwinpkopus8246@gmail.com`
- Binance Pay ID: `1198424506`
- Crypto payments: **Coming Soon / disabled**

These are account identifiers, not API credentials. Actual PayPal/Binance payment processing still requires the respective provider APIs/merchant setup, server-side payment verification, and webhooks. Do not place private API secrets in `index.html` or commit them to GitHub.

For production, set:
- `BISZONE_PAYPAL_EMAIL`
- `BISZONE_BINANCE_PAY_ID`

Crypto should be enabled only after a supported provider/wallet and server-side confirmation flow are implemented.
