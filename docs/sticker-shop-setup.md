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

Stores the uploaded `.webp` stickers, organized **per client, per order**
(`{clientKey}/{orderId}/{stickerId}.webp`). The bucket stays **private**; the
browser uploads via short-lived presigned URLs.

### 3a. Create the bucket
1. AWS Console → **S3 → Create bucket**.
2. Name it (e.g. `linecut-order-stickers`) → `S3_STICKERS_BUCKET`.
3. Region: pick one (e.g. `eu-central-1`) → `AWS_REGION`.
4. **Block Public Access: leave ALL boxes checked (fully private).** Access is
   only ever via presigned URLs we generate server-side.

### 3b. Add a CORS rule (so the browser can PUT directly to the bucket)
Bucket → **Permissions → Cross-origin resource sharing (CORS)** → paste:

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
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
    },
    {
      "Sid": "LineCutStickerList",
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME"
    }
  ]
}
```
Replace `YOUR_BUCKET_NAME` with your bucket name (both lines).
3. After creating the user → **Security credentials → Create access key** →
   choose "Application running outside AWS" → copy:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY` (shown once — save it now).

---

## 4. Production (Vercel) — when you deploy

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
- [ ] `AWS_REGION`, `S3_STICKERS_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- [ ] S3: bucket is private, CORS rule added, IAM user policy scoped to the bucket

Once these are in `.env.local`, tell me and I'll apply the database migration and
build + verify the backend end-to-end.
