// Tests always talk to shop_test. Overriding DATABASE_URL here — before any
// test module imports @/lib/db — makes it impossible for a test run to seed or
// truncate the development database.
const localTestUrl = "postgresql://postgres@localhost:5433/shop_test?schema=public";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? localTestUrl;
