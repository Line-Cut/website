# Sticker Shop → iCredit Charging — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes.

**Goal:** Make the sticker upload-shop checkout (`/[lang]/stickers`) charge via the iCredit hosted page + IPN webhook, exactly like the store cart — instead of the deferred mock — so `ICREDIT_MODE=test|prod` charges both carts and no longer breaks the sticker checkout.

**Architecture:** Generalize finalization: `finalizePaidOrder` becomes payment-kind-agnostic (idempotent paid state-transition) and calls an injected `onPaid(order)` side-effect callback. Store `onPaid` = owner email (today's behavior). Sticker `onPaid` = `markOrderPaid` (paid-bucket copy + receipt) + sticker owner email. The sticker `confirmOrder` adopts the store's redirect model (re-key → `createCheckout` → return `redirectUrl`); the IPN webhook loads `order_kind` and dispatches `onPaid` accordingly. The Verify + amount-check security core is unchanged.

**Tech Stack:** Next.js 16 App Router, TS, Vitest, Supabase. Money agorot internally; shekels only at the iCredit edge.

## Global Constraints

- **Store flow behavior must stay byte-for-byte identical** (its tests must keep passing). The refactor only moves the store owner-email into a `storeOnPaid` callback; the email content/recipients/timing are unchanged.
- **Idempotency unchanged:** `finalizePaidOrder` keeps the conditional `UPDATE ... WHERE id=? AND payment_status <> 'paid'` + `provider_sale_id` partial-unique; webhook already-paid → 200. `onPaid` runs ONLY on a real transition (rows>0), best-effort (a throw is caught/logged, never fails the result).
- **Money/security core untouched:** `handle-ipn.ts` branch order (bad_token→malformed→not_found→already_paid 200→not_verified→amount_mismatch→finalize), `Verify` called with `agorotToShekels(order.price_total)`, `amountMatches` — none of this changes.
- **Sticker re-key/metadata stays at confirm** (before redirect). `confirmed_at` moves to finalize (set by `finalizePaidOrder`), matching the store; the sticker `confirmOrder` idempotency guard changes from "confirmed_at != null" to "payment_status == 'paid'" so an awaiting-payment order resumes payment (re-issues a checkout) instead of being treated as done.
- **Commits:** prefix git with `GIT_CONFIG_GLOBAL=/dev/null`. Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>.
- **Pattern:** DI cores + thin wrappers; `server-only` cores; tests start with `vi.mock("server-only", () => ({}))`. TDD. Test files colocated.
- Test cmd `npm test`; typecheck `npx tsc --noEmit` (must stay 0 errors); lint must add no NEW errors over the pre-existing baseline.

## File Structure

| File | Responsibility |
|---|---|
| `lib/orders/finalize-paid-order.ts` | Generic idempotent paid transition + injected `onPaid(order)`; store-email block removed. |
| `lib/orders/store-paid-side-effects.ts` | `runStorePaidSideEffects(order, deps)` — owner email (extracted verbatim from finalize). |
| `lib/orders/sticker-paid-side-effects.ts` | `runStickerPaidSideEffects(order, deps)` — `markOrderPaid` (copy + receipt) + sticker owner email. |
| `lib/orders/confirm-order.ts` | Sticker confirm → redirect model (createCheckout → redirect/paid/failed); inject finalizePaidOrder + redirectUrlFor + ipnUrl. |
| `app/actions/store.ts` | Bind finalizePaidOrder with `onPaid: storeOnPaid`. |
| `app/actions/stickers.ts` | Bind finalizePaidOrder with `onPaid: stickerOnPaid`; add redirectUrlFor + ipnUrl; pass `locale`. |
| `app/api/payments/icredit/ipn/route.ts` | Load `order_kind`; `onPaid` dispatches store vs sticker side-effects (wire both). |
| `components/stickers/checkout-form.tsx` | Follow `redirectUrl` (keep REQUEST_KEY on redirect). |
| `.claude/skills/rivhit-icredit/SKILL.md` | Both carts now charge via iCredit. |

---

### Task 1: finalizePaidOrder → onPaid callback (+ extract storeOnPaid); keep store identical

**Files:** Modify `lib/orders/finalize-paid-order.ts`, `lib/orders/finalize-paid-order.test.ts`; Create `lib/orders/store-paid-side-effects.ts`, `lib/orders/store-paid-side-effects.test.ts`; Modify `app/actions/store.ts`, `app/api/payments/icredit/ipn/route.ts`.

**Interfaces:**
- `finalizePaidOrder` deps become `{ admin; onPaid?: (order: Record<string,unknown>) => Promise<void>; now? }`. Returns `{ok:true, alreadyPaid:boolean} | {ok:false, message}` (unchanged result type). On a real transition it `await`s `deps.onPaid?.(order)` inside try/catch (best-effort).
- `runStorePaidSideEffects(order: Record<string,unknown>, deps: { admin; sendOwnerEmail; ownerOrderUrlFor }): Promise<void>` — the order_items load + `buildOwnerStoreEmail` + send, moved verbatim from finalize (drop the `order.order_kind === "store"` guard — the caller only wires this for store orders). Keep `deliveryFromOrder` with it.

- [ ] **Step 1:** Update `finalize-paid-order.test.ts` — the existing tests pass `sendOwnerEmail`/`ownerOrderUrlFor`; change them to pass an `onPaid` spy. The "marks paid + email" test becomes "marks paid + calls onPaid once with the order"; the already-paid test asserts onPaid NOT called; the throw test makes `onPaid` throw and asserts `{ok:true, alreadyPaid:false}`. Keep the db-error test. Run → RED.
- [ ] **Step 2:** Refactor `finalize-paid-order.ts`: deps `{admin, onPaid?, now?}`; after the conditional update, on `rows.length>0` do `try { await deps.onPaid?.(order) } catch (err) { console.error("[finalizePaidOrder] onPaid failed:", err) }`; return as before. Delete the store-email block + the `buildOwnerStoreEmail`/`PricedLine`/`deliveryFromOrder` imports (they move to the new module).
- [ ] **Step 3:** Create `store-paid-side-effects.ts` with `runStorePaidSideEffects` (the moved email logic) + `deliveryFromOrder`. TDD a test that asserts it builds + sends an email for a store order (reuse the finalize test's fixture/fake-admin pattern).
- [ ] **Step 4:** Update `app/actions/store.ts`: where it binds `finalizePaidOrderCore(fpInput, { admin, sendOwnerEmail, ownerOrderUrlFor })`, change to `{ admin, onPaid: (order) => runStorePaidSideEffects(order, { admin, sendOwnerEmail, ownerOrderUrlFor: (id)=>`${siteConfig.url}/he/admin/orders/${id}` }) }`.
- [ ] **Step 5:** Update `app/api/payments/icredit/ipn/route.ts`: the `finalize` closure passes `{ admin, onPaid: (order) => runStorePaidSideEffects(order, { admin, sendOwnerEmail, ownerOrderUrlFor }) }` (store-only for now — Task 5 adds sticker dispatch).
- [ ] **Step 6:** `npm test` (store + finalize suites green, full suite green) + `npx tsc --noEmit` 0 errors. Commit.

### Task 2: runStickerPaidSideEffects

**Files:** Create `lib/orders/sticker-paid-side-effects.ts` + test.

**Interfaces:**
- `runStickerPaidSideEffects(order: Record<string,unknown>, deps: { markOrderPaid: (mp:{orderId;storagePrefix;receipt:{orderId;amount;currency;reference;paidAtISO}})=>Promise<{ok:boolean}>; sendOwnerEmail; ownerFilesUrlFor:(id:string)=>string }): Promise<void>`.
- Behavior: build the receipt context from the order row (`price_total`, `price_currency`, `payment_reference`, `paid_at`, `storage_prefix`), call `markOrderPaid({ orderId, storagePrefix: order.storage_prefix, receipt })` (best-effort — log, never throw), then build + send the sticker owner email via `buildOwnerOrderEmail` (read `lib/emails/order-notification.ts` for its exact input shape; reconstruct breakdown/delivery from the order row + a stickers count loaded from `order_stickers`), best-effort.

- [ ] TDD: a test asserting `markOrderPaid` is called with the order's storage_prefix + receipt, and `sendOwnerEmail` is called; a test asserting a `markOrderPaid` throw does NOT propagate. Implement. Commit.

### Task 3: Sticker confirmOrder → redirect model

**Files:** Modify `lib/orders/confirm-order.ts` + `lib/orders/confirm-order.test.ts`; Modify `app/actions/stickers.ts`.

**Interfaces (confirm-order.ts):**
- `ConfirmOrderInput` gains `locale: "he"|"en"`. `ConfirmOrderResult` ok variant gains `redirectUrl?: string`.
- Deps: remove `markOrderPaid`, `sendOwnerEmail`, `ownerFilesUrlFor`; add `finalizePaidOrder: (input)=>Promise<{ok:boolean; alreadyPaid?:boolean}>` (bound with sticker onPaid), `redirectUrlFor: (guestToken,locale)=>string`, `ipnUrl: string`. Keep `objectExists`/`copyObject`/`putObject`/`deletePrefix`/`buildMetadataPdf`/`paymentProvider`/`now`.
- Behavior: keep validate → load → verify S3 → re-key + metadata + delete temp. Change the idempotency guard to `if (order.payment_status === "paid") return success`. Update the order with contact fields + `storage_prefix` (NOT confirmed_at, NOT paid fields). Then `createCheckout({ orderId, amount: price_total, currency: price_currency, locale, items:[{description:`Stickers order (${copies} copies)`, catalogNumber: orderId, unitPrice: price_total, quantity:1}], customer:{firstName,lastName,email,phone}, redirectUrl: deps.redirectUrlFor(guestToken, locale), ipnUrl: deps.ipnUrl })`:
  - `failed` → `{ok:false, message:"payment_failed"}` (no rollback — the order is a draft; recoverable).
  - `redirect` → update order `payment_provider:"icredit"` + `payment_reference: result.reference`; return `{ok:true, orderId, guestToken, redirectUrl: result.url}`.
  - `paid` (mock) → `await deps.finalizePaidOrder({ orderId, paidAtISO: now, provider:"mock", saleId: result.reference, reference: result.reference, receiptDocumentUrl:null, receiptDocumentNumber:null })`; return `{ok:true, orderId, guestToken}`.

- [ ] **Step 1:** Update `confirm-order.test.ts` — its fake deps currently inject `markOrderPaid`/`sendOwnerEmail`; switch to a `finalizePaidOrder` spy + `redirectUrlFor`/`ipnUrl`. Add tests: redirect branch returns `redirectUrl`, does NOT call finalize; paid branch calls finalize, returns no redirectUrl; failed returns payment_failed. Keep the re-key/metadata/verify assertions. Run → RED.
- [ ] **Step 2:** Implement the confirm-order.ts changes.
- [ ] **Step 3:** Update `app/actions/stickers.ts`: the action input gains `locale: Locale`; bind `finalizePaidOrder` = `(fp) => finalizePaidOrderCore(fp, { admin, onPaid: (order) => runStickerPaidSideEffects(order, { markOrderPaid: <the existing markOrderPaid binding>, sendOwnerEmail, ownerFilesUrlFor: (id)=>`${siteConfig.url}/he/admin/orders/${id}/files` }) })`; add `redirectUrlFor: (gt, locale) => `${siteConfig.url}/${locale}/stickers/track/${gt}``, `ipnUrl: `${siteConfig.url}/api/payments/icredit/ipn``. Remove the now-unused direct markOrderPaid/sendOwnerEmail wiring on confirmOrderCore (they move into the onPaid binding).
- [ ] **Step 4:** `npm test` + `npx tsc --noEmit`. Commit.

### Task 4: Sticker checkout-form follows the redirect

**Files:** Modify `components/stickers/checkout-form.tsx`. Reuse `nextNavigation` from `lib/store/checkout-navigation.ts` if its shape fits (it takes `{ok:true; guestToken; redirectUrl?}` + lang → redirect|track); otherwise the track href differs (`/stickers/track/` vs `/store/track/`), so add a small `stickerNextNavigation` or pass the base. Pass `locale: lang` into the `confirmOrder` action call. On redirect: clear local state as appropriate but KEEP the request/draft id semantics (a sticker order is identified by orderId+guestToken in sessionStorage — keep them so a back-button retry resumes). Use `window.location.assign(url)`.

- [ ] Read the current checkout-form success handling; wire the redirect (mirror store-checkout). Add/adjust a focused nav test if a pure helper is introduced. `npx tsc --noEmit`. Commit.

### Task 5: Webhook dispatches onPaid by order_kind

**Files:** Modify `app/api/payments/icredit/ipn/route.ts`; Modify `lib/payments/icredit/handle-ipn.ts` (+ test) ONLY if `IpnOrder` needs `order_kind`.

- [ ] **Step 1:** Add `order_kind` to the webhook `loadOrder` select (`id, price_total, payment_status, order_kind`) and to the `IpnOrder` type in `handle-ipn.ts` (additive optional field; existing handle-ipn tests unaffected — confirm they still pass).
- [ ] **Step 2:** In the route's `finalize` closure, build `onPaid` that dispatches: `order.order_kind === "stickers"` → `runStickerPaidSideEffects(order, {markOrderPaid: <route binding>, sendOwnerEmail, ownerFilesUrlFor})`; else → `runStorePaidSideEffects(order, {admin, sendOwnerEmail, ownerOrderUrlFor})`. Wire the sticker `markOrderPaid` binding in the route (same S3 deps as `app/actions/stickers.ts` — `copyPrefix` orders→paid + `buildPlaceholderReceiptPdf` + `putObject` to paid). NOTE: `finalizePaidOrder`'s `onPaid` receives the full order row (it `.select("*")`), so `order.order_kind`/`order.storage_prefix` are available there even though the webhook's `loadOrder` only selected a few columns.
- [ ] **Step 3:** `npm test` (handle-ipn + full suite) + `npx tsc --noEmit`. Commit.

### Task 6: Update the rivhit-icredit skill

**Files:** Modify `.claude/skills/rivhit-icredit/SKILL.md` (+ references if needed).
- [ ] Update: BOTH the store cart AND the sticker shop now charge via iCredit (redirect + IPN). Document the kind-dispatched `onPaid` (store email vs sticker paid-pipeline+email) and `finalizePaidOrder`'s generalized shape. Update the "sticker flow stays on mock" claims (now both use the provider switch; mock still the default). Frontmatter/description updated accordingly. Commit.

## Final verification
- [ ] `npm test` full suite green; `npx tsc --noEmit` 0 errors; lint adds no new errors.
- [ ] Manual (preview deploy, `ICREDIT_MODE=test`): a sticker order → redirect to iCredit → pay test card → IPN flips it to paid, paid-bucket copy + receipt written, owner email sent. And a store order still works.

## Self-review notes
- Store behavior preserved via the unchanged store tests + the `runStorePaidSideEffects` extraction being verbatim.
- The security/idempotency core (`handle-ipn.ts`, the conditional update, partial-unique index) is untouched except an additive `order_kind` field on loadOrder.
- `confirmed_at` now set at finalize for stickers (matching store); the sticker idempotency guard moves to `payment_status == 'paid'` so awaiting orders resume payment.
