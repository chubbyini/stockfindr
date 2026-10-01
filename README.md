# Stockfindr

Inventory, sales capture and reorder alerts for small retail shops.

**Core promise:** selling is the only thing staff have to do. Everything the
owner needs — what was sold, what's left, what to reorder — falls out of the
sale. Offline-first: the network never blocks a sale.

## Stack

- **Next.js App Router PWA** (installable, service-worker shell)
- **Firebase**: Auth (owner email-link), Firestore (ledger + catalog, offline
  persistence), Storage (product photos)
- **Dexie (IndexedDB)**: held-outbox for the 10-second undo window + cached
  catalog/PIN hashes for offline login
- **Zustand**: cart + session state
- **ZXing**: continuous barcode scanning (camera), tap-grid fallback for
  unbarcoded goods
- **Brand**: `@sojournerbuilds/mark` — waymark token for logo, favicon and
  all loading screens (`SojournerLoader` + route veil)

## Routes

| Route | Who | What |
|---|---|---|
| `/pin` | attendant | 4-digit PIN login (works offline, rate-limited) |
| `/sell` | attendant | scanner + pinned tap grid + basket + confirm/undo |
| `/products` | owner (+ seller quick-add) | manual entry, spreadsheet import, scan-to-add, review queue |
| `/dashboard` | owner | today's sales, top items, low stock, recent sales |
| `/counts`, `/reorders` | owner | blind counts, reorder drafts (planned) |

## Data model (Firestore, under `shops/{shopId}`)

- `products/{id}` — incl. `cost_price`, `current_stock` (cached counter),
  `status: active | pending_review` (`created_by` tracks seller quick-adds)
- `sales/{saleId}` — **doc ID = client UUID** so retries are idempotent
- `sales/{id}/items`, `ledger/{id}` — append-only; stock = sum of ledger
- `counts/.../lines` (attendant-writable) vs `.../results` (owner-only:
  expected quantities stay hidden)
- Full rules in `firestore.rules`. Copy `.env.example` to `.env.local`.

## Commit map (read in this order)

1. `chore: scaffold Next.js PWA shell` — app router, tailwind, manifest
2. `feat: offline core (types, firebase client, dexie)` — shared model
3. `feat: PIN auth + POS stores` — bcrypt PIN, cart/session
4. `feat: sell screen + idempotent sync` — scanner, basket, outbox engine
5. `feat: catalog setup (manual, import, quick-add)` — products page
6. `feat: owner dashboard + pin + security rules`
7. `feat: Sojourner brand (loader, logo, favicon, loading screens)`
8. `chore: rename project to stockfindr` — user-facing strings only
9. `feat: trigger.dev nightly summary cron` — 18:00 Lagos, Telegram + InApp

## Nightly jobs (Trigger.dev)

`trigger/nightly-summary.ts` runs **18:00 Africa/Lagos daily**: today's totals,
top sellers, low stock → `summaries/{YYYY-MM-DD}` (InApp) + Telegram (once per
date key — retries recompute but never resend).

```bash
npm run trigger:dev   # sync tasks + schedules (needs TRIGGER_SECRET_KEY)
```

First time: `npx trigger.dev@latest init` to link your project (fills the
`project:` ref in `trigger.config.ts`), then paste the dev key into `.env.local`.
Deploy with `npx trigger.dev@latest deploy`. Test from the dashboard's
"Test schedule" button.

Status: linked to `stockfindr` (`proj_ixyvognhczqulijstdgs`), prod env vars set,
v20261001.1 deployed. Test runs:
`https://cloud.trigger.dev/projects/v3/proj_ixyvognhczqulijstdgs/test?environment=prod`

## Self-serve shops (no seeding)

Owners sign in with Google (email-link fallback) at `/`, create shops at
`/onboarding` (multi-shop switcher in the dashboard header), and invite
attendants with single-use 8-char codes from `/staff`. Attendants join at
`/join`, set their own PIN, and burn the code. Rules enforce it all:
`firestore.rules` + redeploy:

```bash
npx firebase-tools deploy --only firestore:rules --project stocfindr
```

Redeploy after EVERY rules change — the app silently depends on the live
rules. Testing sign-in on a phone/LAN URL? Add the domain under Firebase
console → Authentication → Settings → Authorized domains first.

## Seed the first shop (local-dev fallback)

Rules are deployed. Firebase console → Authentication → enable **Email link**.
Then seed (PINs are bcrypt-hashed, safe to re-run to add staff/link Telegram):

```bash
node scripts/seed-shop.mjs --shop "Mama Tunde Store" --owner-uid UID123 \
  --staff "Emeka:1234:attendant,Ada:5678:attendant" --telegram 123456789
```

Set the shop id it prints as `tilltrail-shop` in the app (PIN screen).

## Push to GitHub

Live at `github.com/chubbyini/stockfindr` (`main`).

```bash
git push   # remote + upstream already configured
```

## Regenerate brand assets

```bash
node scripts/brand-render.mjs  # re-renders public/logo.svg + app/icon.svg
```
