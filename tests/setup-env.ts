// Point the app's Prisma client at shop_test before any test module loads.
// The pure helpers under test here never touch the database, but this keeps the
// same environment contract as the integration suites.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres@localhost:5433/shop_test?schema=public";

// Deterministic Stripe webhook secret so integration tests can sign their own
// deliveries with the SDK's test-header helper. Stripe itself is never called:
// checkout tests inject a PaymentIntent creator.
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_payments_webhook_secret";
