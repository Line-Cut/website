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
from pg_policies where tablename in ('orders','order_stickers')
order by tablename, policyname;
```
Expected: **exactly two rows**, both `SELECT` for `{authenticated}` —
`orders → own orders read`, `order_stickers → own order stickers read`. No anon
policies, no write policies.

### 2. RLS is enabled on both tables
```sql
select relname, relrowsecurity from pg_class
where relname in ('orders','order_stickers');
```
Both `relrowsecurity` must be `true`.

### 3. Anon access denied (critical)
With an **anon-key** client, `select * from orders;` and
`select * from order_stickers;` must return **0 rows** (not an error). The
controller verifies this automatically via the REST clients.

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

| Role          | orders                     | order_stickers        |
|---------------|----------------------------|-----------------------|
| anon          | no access                  | no access             |
| authenticated | SELECT own rows            | SELECT own order rows |
| service_role  | full access (bypasses RLS) | full access           |

All application writes go through Server Actions using `SUPABASE_SERVICE_ROLE_KEY`
(admin client, bypasses RLS). Guest-token reads also go through the admin client
with an explicit `WHERE guest_token = $1` — no anon read policy is granted, so a
server bug that omits the filter still can't leak other users' orders.
