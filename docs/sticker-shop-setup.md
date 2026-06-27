# Sticker Shop — credentials & service setup

This guide walks you through obtaining every value in `.env.local`. Fill them
in `.env.local` (already created for you, git-ignored). After editing, restart
`npm run dev`. For production, the same variables go into your Vercel project
(Settings → Environment Variables).

> **Security:** `.env.local` is git-ignored — never commit it. `SUPABASE_SERVICE_ROLE_KEY`
> and `AWS_SECRET_ACCESS_KEY` are like root passwords; they live only on the
> server and must never be shared or prefixed with `NEXT_PUBLIC_`.

There are three services to set up: **Resend** (email), **Supabase** (database +
login), and **AWS S3** (file storage). Do them in any order. You can fill values
in as you get them — the app builds even with some still set to `FILL_ME`.

---

## 1. Resend — email (≈5 min)

Used for the contact form and new-order notifications.

1. Sign up at <https://resend.com> (free tier is plenty to start).
2. **Verify a sending domain**: Dashboard → Domains → Add Domain → enter your
   domain (e.g. `linecut.co.il`) and add the DNS records it shows at your domain
   registrar. (You can test with their sandbox domain first, but real email to
   customers needs a verified domain.)
3. Dashboard → **API Keys** → Create API Key → copy it.
   - `RESEND_API_KEY` = that key (starts with `re_`).
4. `CONTACT_FROM` = a sender on the **verified** domain, e.g. `Line Cut <noreply@linecut.co.il>`.
5. `CONTACT_EMAIL` = the inbox where you want contact-form messages.
6. `OWNER_NOTIFY_EMAIL` = where new sticker orders are emailed (can equal `CONTACT_EMAIL`).

---

## 2. Supabase — database + login (≈15 min)

Holds orders/order-stickers and powers user accounts (Google + email/password).
**It does NOT store the image files — those go to S3 (step 3).**

### 2a. Create the project & get keys
1. Sign up at <https://supabase.com> → New Project. Pick a region close to your
   users (e.g. Frankfurt `eu-central-1`). Set a strong database password (save it).
2. Once provisioned: **Project Settings → Data API**:
   - `NEXT_PUBLIC_SUPABASE_URL` = the **Project URL** (`https://<ref>.supabase.co`).
3. **Project Settings → API Keys**:
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the **anon / public** key (safe for the browser).
   - `SUPABASE_SERVICE_ROLE_KEY` = the **service_role** key (server-only secret).

### 2b. Enable authentication methods
1. **Authentication → Providers → Email**: enable it. (You can turn off
   "Confirm email" during development for faster testing; turn it on for launch.)
2. **Authentication → Providers → Google**: enable, then supply a Google OAuth
   client:
   - Go to <https://console.cloud.google.com> → APIs & Services → Credentials →
     Create Credentials → OAuth client ID → **Web application**.
   - Under **Authorized redirect URIs** add (Supabase shows the exact one to use):
     `https://<your-ref>.supabase.co/auth/v1/callback`
   - Copy the Google **Client ID** and **Client secret** into Supabase's Google
     provider form.
3. **Authentication → URL Configuration**:
   - **Site URL**: `http://localhost:3000` for dev (change to your real domain for prod).
   - **Redirect URLs**: add `http://localhost:3000/**` (and your production
     `https://yourdomain.com/**`) so the post-login redirect back to
     `/he/...` and `/en/...` is allowed.

### 2c. Database schema
You do **not** create tables by hand. I apply the migration
(`supabase/migrations/0001_orders.sql`) once your keys are in place — either via
the Supabase SQL editor (paste & run) or the Supabase CLI. Just get me the keys.

---

## 3. AWS S3 — file storage (≈15 min)

The shop uses **two private buckets**:

- **Orders bucket** (`S3_STICKERS_BUCKET`) — every order. The browser uploads
  `.webp` stickers here via short-lived presigned PUT URLs. At checkout the files
  are re-keyed into a friendly per-order folder
  `<orderId>-<firstName>-<lastName>-<phone>/`, and a `metadata.pdf` (client
  details) is written alongside them.
- **Paid bucket** (`S3_STICKERS_PAID_BUCKET`) — when payment succeeds, the order
  folder is copied here and a `receipt.pdf` is written into it.

Both stay **private**; access is only ever via presigned URLs generated
server-side. The browser only ever touches the orders bucket (the paid copy +
receipt are written server-side), so **only the orders bucket needs CORS.**

### 3a. Create the buckets
1. AWS Console → **S3 → Create bucket**.
2. Orders bucket: name it (e.g. `linecut-order-stickers`) → `S3_STICKERS_BUCKET`.
3. Paid bucket: create a second bucket (e.g. `linecut-paid-orders`) →
   `S3_STICKERS_PAID_BUCKET`.
4. Region: pick one (e.g. `eu-central-1`) → `AWS_REGION` (use the **same** region
   for both buckets — copies are cross-bucket within one region).
5. **Block Public Access: leave ALL boxes checked (fully private)** on both.
   Access is only ever via presigned URLs we generate server-side.

### 3b. Add a CORS rule (orders bucket only)
The browser uploads directly only to the **orders** bucket, so only it needs
CORS. Orders bucket → **Permissions → Cross-origin resource sharing (CORS)** →
paste:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://YOURDOMAIN.com"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```
Replace `https://YOURDOMAIN.com` with your real production domain (keep
`http://localhost:3000` for local dev). Without this, browser uploads fail with
a CORS error.

### 3c. Create a least-privilege IAM user for the app
1. AWS Console → **IAM → Users → Create user** (e.g. `linecut-s3-app`),
   **without** console access.
2. Attach an **inline policy** (Permissions → Add permissions → Create inline
   policy → JSON) scoped to just this bucket:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "LineCutStickerObjects",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": [
        "arn:aws:s3:::ORDERS_BUCKET_NAME/*",
        "arn:aws:s3:::PAID_BUCKET_NAME/*"
      ]
    },
    {
      "Sid": "LineCutStickerList",
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::ORDERS_BUCKET_NAME",
        "arn:aws:s3:::PAID_BUCKET_NAME"
      ]
    }
  ]
}
```
Replace `ORDERS_BUCKET_NAME` / `PAID_BUCKET_NAME` with your bucket names. The app
copies objects orders→paid, so it needs `GetObject` on the orders bucket and
`PutObject` on the paid bucket (both covered above).
3. After creating the user → **Security credentials → Create access key** →
   choose "Application running outside AWS" → copy:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY` (shown once — save it now).

---

## 4. Feature access — sticker shop + store (no env vars)

The sticker shop and store are gated by **DB-managed feature access** — there are no env vars to set. The system is controlled from **`/<lang>/admin/access`** in the running app (`lib/auth/feature-access.ts`, `feature_access` + `feature_allowlist` tables): per feature choose **Public** (open to everyone, guests included) or **Restricted**, and for restricted features add allowed users by email (they must have signed up first). Admins/owners always have access regardless of the setting.

The first admin is the **`OWNER_NOTIFY_EMAIL`** account (it becomes an admin automatically once that env var is set and the user signs up). Additional admins are granted in-app at `/<lang>/admin/admins`. No checklist item is needed here — this is configured in the running app, not via env vars.

---

## 5. Production (Vercel) — when you deploy

In the Vercel project → Settings → Environment Variables, add the **same**
variables (use your production values). Then:
- Update Supabase **Site URL** + **Redirect URLs** to your production domain.
- Add your production domain to the S3 **CORS** `AllowedOrigins`.
- Add your production domain to the Google OAuth client's authorized origins if needed.

---

## Checklist (hand these back to me once filled in `.env.local`)

- [ ] `RESEND_API_KEY`, `CONTACT_EMAIL`, `CONTACT_FROM`, `OWNER_NOTIFY_EMAIL`
- [ ] `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Supabase: Email + Google providers enabled; Site URL + Redirect URLs set
- [ ] `AWS_REGION`, `S3_STICKERS_BUCKET`, `S3_STICKERS_PAID_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- [ ] `S3_PRODUCTS_BUCKET` (public-read product images) + optional `S3_PRODUCTS_PUBLIC_URL` (CDN)
- [ ] S3: sticker buckets private; **products bucket public-read + CORS (PUT/GET)**; CORS on the **orders** bucket; IAM policy scoped to **all three** buckets
- [ ] Feature access: in the running app, go to `/<lang>/admin/access` and set sticker shop + store to **Public** or **Restricted** (add allowed emails for restricted features — users must have signed up first). The `OWNER_NOTIFY_EMAIL` account is the first admin; more can be added at `/<lang>/admin/admins`. (No env vars.)

Once these are in `.env.local`, tell me and I'll apply the database migration and
build + verify the backend end-to-end.

## Store catalog + admin (Phase 3)

The public store + owner admin reuse the Supabase/Resend/`OWNER_NOTIFY_EMAIL`
setup. The only new piece is a **third S3 bucket for product images**.

- [ ] `npm run db:push` — creates the `products` and `order_items` tables, the
      `order_kind`/`product_status` enums + the `seen` order status.
- [ ] **Create a public-read product-images bucket** → `S3_PRODUCTS_BUCKET`
      (separate from the two private sticker buckets):
      - **Block Public Access: OFF**, and add a bucket policy granting
        `s3:GetObject` to everyone (so the storefront can serve images):
        ```json
        {
          "Version": "2012-10-17",
          "Statement": [{
            "Sid": "PublicReadProductImages",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::PRODUCTS_BUCKET_NAME/*"
          }]
        }
        ```
      - add a **CORS** rule allowing `PUT`/`GET` from the site origin (same JSON
        as §3b — the owner uploads via presigned PUT from the browser);
      - extend the **existing IAM user's** policy (§3c) to add
        `"arn:aws:s3:::PRODUCTS_BUCKET_NAME/*"` to the `s3:PutObject` resources —
        no new credentials.
      - (Optional) put CloudFront/a custom domain in front and set
        `S3_PRODUCTS_PUBLIC_URL` to it; otherwise the direct S3 URL is used.
- [ ] Storefront `/[lang]/store` is **public** (guests can browse + order).
- [ ] Admin (`/[lang]/admin/products`, `/[lang]/admin/orders`) is gated by
      `OWNER_NOTIFY_EMAIL` (bootstrap admin) — the owner adds catalog products
      (prices in **agorot**) and manages order status + payment status there.
- [ ] More admins can be granted in-app at `/[lang]/admin/admins` (by email; the
      person must have signed up first). The `OWNER_NOTIFY_EMAIL` account is always
      an admin and can't be removed there.
