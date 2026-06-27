# Database migrations (Supabase CLI)

This project uses the **Supabase CLI** for versioned, repeatable migrations —
the Prisma-Migrate equivalent for this stack. Migration files live in
`supabase/migrations/<timestamp>_name.sql` and apply in timestamp order. The CLI
records what's applied in the project's `supabase_migrations.schema_migrations`
table, so each migration runs **exactly once** per database — locally and on deploy.

Current migrations:
- `<ts>_orders.sql` — `orders` + `order_stickers` tables, enums, indexes,
  `updated_at` trigger, and Row-Level Security for the sticker shop.
- `<ts>_add_ship_notes.sql` — adds `orders.ship_notes`.
- `<ts>_phone_friendly_storage_payment.sql` — splits the contact name
  (`contact_first_name`/`contact_last_name`), records the friendly S3 folder
  (`storage_prefix`), adds payment/receipt columns (`payment_reference`,
  `paid_at`, `receipt_storage_key`, `payment_meta`), and a CHECK requiring
  `contact_phone` on confirmed orders.
- `<ts>_store_products.sql` — store catalog + generic order line items: adds the
  `products` table (PUBLIC read of `status='active'` via RLS) and `order_items`
  (same RLS as `order_stickers`); `product_status` + `order_kind` enums; a `seen`
  value on `order_status`; relaxes the sticker-only price columns on `orders`
  (`copies`/`price_sheets`/`price_rate` → nullable) behind a kind-gated CHECK; an
  `order_kind` discriminator (default `stickers`) + `client_request_id`. (Product
  images are NOT stored here — they live in a public-read AWS S3 bucket,
  `S3_PRODUCTS_BUCKET`.)
- `<ts>_admins.sql` — `admins` table (DB-managed admin grants layered on top of
  the `OWNER_NOTIFY_EMAIL` env bootstrap). RLS default-deny, no policies
  (service-role access only behind the admin guard).
- `<ts>_feature_access.sql` — `feature_access` + `feature_allowlist` tables
  (DB-managed, admin-controlled access to the sticker shop + store; replaces the
  `STICKER_SHOP_*` env vars). RLS default-deny, no policies — service-role only.

## One-time setup

1. **Access token** (non-interactive CLI auth):
   <https://supabase.com/dashboard/account/tokens> → create →
   `export SUPABASE_ACCESS_TOKEN=...` (or `npx supabase login` for the browser flow).
2. **Link the repo to the project** (needs the DB password — Dashboard →
   Project Settings → Database). The project ref is already in `supabase/config.toml`:
   ```bash
   npx supabase link --project-ref ugojysmluyjujloblnsf
   ```

## Apply pending migrations

```bash
npm run db:push          # supabase db push — applies only not-yet-applied migrations
```
Or without linking, straight at the DB (URI from Dashboard → Project Settings →
Database → Connection string):
```bash
npx supabase db push --db-url "postgresql://postgres:<password>@<host>:5432/postgres"
```
Both are safe to re-run — already-applied files are skipped.

## Create a new migration

```bash
npm run db:new add_something   # creates supabase/migrations/<ts>_add_something.sql
# edit it, then:
npm run db:push
```

## Deploy / CI (automatic — like Prisma in CI)

Vercel builds only the frontend; it does **not** run DB migrations. Apply them
from CI. Example GitHub Action (repo secrets: `SUPABASE_ACCESS_TOKEN`,
`SUPABASE_DB_PASSWORD`):

```yaml
# .github/workflows/db-migrate.yml
name: DB migrate
on:
  push:
    branches: [main]
    paths: ["supabase/migrations/**"]
jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with: { version: latest }
      - run: supabase db push
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
          SUPABASE_PROJECT_ID: ugojysmluyjujloblnsf
```

## Alternatives for a one-off apply (no CLI)

- **SQL Editor:** Dashboard → SQL Editor → paste the migration file → Run.
- **psql:** `psql "$DATABASE_URL" -f supabase/migrations/<ts>_orders.sql`

(These don't record into `schema_migrations`, so prefer `db push` so the history
stays consistent for future migrations.)

---

## Verify after applying

### 1. RLS policies in place
```sql
select tablename, policyname, cmd, roles
from pg_policies where tablename in ('orders','order_stickers','order_items','products')
order by tablename, policyname;
```
Expected: **four rows** —
`orders → own orders read` (SELECT, `{authenticated}`),
`order_stickers → own order stickers read` (SELECT, `{authenticated}`),
`order_items → own order items read` (SELECT, `{authenticated}`), and
`products → active products are public` (SELECT, `{anon,authenticated}`).
`products` is deliberately public (catalog, no PII); the three order tables have
no anon and no write policies.

### 2. RLS is enabled on all tables
```sql
select relname, relrowsecurity from pg_class
where relname in ('orders','order_stickers','order_items','products');
```
All four `relrowsecurity` must be `true`.

### 3. Anon access denied for orders (critical)
With an **anon-key** client, `select * from orders;`, `select * from order_stickers;`
and `select * from order_items;` must return **0 rows** (not an error).
`select * from products;` returns only `status='active'` rows (the public catalog).

### 4. updated_at trigger
```sql
select trigger_name, event_manipulation, action_timing
from information_schema.triggers where event_object_table = 'orders';
```
Expected: `orders_set_updated_at | UPDATE | BEFORE`.

### 5. shipping CHECK
Insert `delivery_method='shipping'` with `ship_city = NULL` → must fail; with all
required address fields set → succeeds.

---

## Security summary

| Role          | orders                     | order_stickers / order_items | products                      |
|---------------|----------------------------|------------------------------|-------------------------------|
| anon          | no access                  | no access                    | SELECT `status='active'` only |
| authenticated | SELECT own rows            | SELECT own order rows        | SELECT `status='active'` only |
| service_role  | full access (bypasses RLS) | full access                  | full access (bypasses RLS)    |

All application writes go through Server Actions using `SUPABASE_SERVICE_ROLE_KEY`
(admin client, bypasses RLS). Guest-token reads also go through the admin client
with an explicit `WHERE guest_token = $1` — no anon read policy is granted, so a
server bug that omits the filter still can't leak other users' orders.
