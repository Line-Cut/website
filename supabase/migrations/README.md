# Supabase Migrations

## 0001_orders.sql

Defines the `orders` and `order_stickers` tables, supporting enums, indexes,
an `updated_at` trigger, and Row-Level Security for the Line Cut sticker shop.

---

## How to apply

### Option A — Supabase Dashboard (SQL Editor)

1. Open your Supabase project → **SQL Editor**.
2. Copy the full contents of `supabase/migrations/0001_orders.sql`.
3. Paste into a new query and click **Run**.
4. Confirm success in the **Table Editor** — you should see `orders` and `order_stickers`.

### Option B — psql (CLI)

```bash
psql "$DATABASE_URL" -f supabase/migrations/0001_orders.sql
```

`DATABASE_URL` is the connection string from your Supabase project settings
(**Project Settings → Database → Connection String → URI**).

The migration is idempotent-safe: it guards enum creation with
`DO $$ BEGIN … EXCEPTION WHEN duplicate_object THEN NULL; END $$;`, uses
`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and drops policies/
triggers before recreating them.

---

## Verify after applying

### 1. Check RLS policies are in place

```sql
select
  tablename,
  policyname,
  cmd,
  roles,
  qual
from pg_policies
where tablename in ('orders', 'order_stickers')
order by tablename, policyname;
```

Expected output: **exactly two rows** —

| tablename      | policyname              | cmd    | roles           |
|----------------|-------------------------|--------|-----------------|
| order_stickers | own order stickers read | SELECT | {authenticated} |
| orders         | own orders read         | SELECT | {authenticated} |

No anon policies and no write policies should appear.

### 2. Confirm anon access is denied (critical security check)

Connect with an anon-key client (or use the Supabase Dashboard's **API** tab
with the `anon` role) and run:

```sql
select * from orders;
select * from order_stickers;
```

Both queries **must return 0 rows** (not an error — RLS silently filters all
rows for roles without a matching policy). An empty result set confirms that
the default-deny posture is working.

### 3. Confirm the trigger is registered

```sql
select trigger_name, event_manipulation, event_object_table, action_timing
from information_schema.triggers
where event_object_table = 'orders';
```

Expected: `orders_set_updated_at | UPDATE | orders | BEFORE`

### 4. Confirm the shipping CHECK constraint

Insert a row with `delivery_method = 'shipping'` and `ship_city = NULL`
— the insert should fail with a check-constraint violation. Then insert with
all required address fields non-null — it should succeed.

---

## Security summary

| Role          | orders         | order_stickers       |
|---------------|----------------|----------------------|
| anon          | no access      | no access            |
| authenticated | SELECT own rows | SELECT own order rows |
| service_role  | full access (bypasses RLS) | full access |

All application writes go through Server Actions that use the
`SUPABASE_SERVICE_ROLE_KEY` (admin client), which bypasses RLS. Guest-token
reads are also performed via the admin client with an explicit `WHERE
guest_token = $1` filter — no anon read policy is granted so a server-side
bug that omits the filter cannot leak other users' orders.
