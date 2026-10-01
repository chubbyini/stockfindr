# TillTrail

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

## Push to GitHub

No remote is configured yet. To publish:

```bash
# web: create an empty repo, then
git remote add origin https://github.com/<you>/tilltrail.git
git branch -M main
git push -u origin main
```

## Regenerate brand assets

```bash
node scripts/brand-render.mjs  # re-renders public/logo.svg + app/icon.svg
```
