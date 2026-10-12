# Distributor Orders — MERN assessment

A readable React, Express, Node.js and MongoDB application for distributor ordering, warehouse stock and loyalty rewards.

## Run locally (three commands)

Install Node.js 22 or newer. No Docker or separately installed MongoDB is required for the default local setup.

```powershell
cd D:\project
npm install
npm start
```

Open http://localhost:3000. First startup downloads a MongoDB binary and starts a single-node replica set. Opening stock and historical orders are seeded automatically only if there are no users. Data persists under `.data/mongo`. Stop with Ctrl+C. The checked-in `.env.example` documents configuration; the supplied local `.env` has the same values. When cloning elsewhere, `.env` is optional: defaults work without it. Copy `.env.example` to `.env` if you want to customize settings.

To use your own MongoDB, set MONGO_URL in `.env` to a replica-set connection string. Transactions require a replica set. The automatic database is for local assessment use only.

## Starting twice

If the app is already running, another `npm start` prints the existing address and exits without starting another database. To restart, press Ctrl+C in the original app terminal, then run `npm start` again. If another service occupies the app port, startup reports that conflict clearly. If port 27018 is occupied, stop the earlier local database/app process before restarting; do not erase `.data/mongo` or its lock files.

## Verify

```powershell
npm test
```

Tests use a separate temporary database and do not change demo data. They cover the worked example, stock rollback, zero stock, quantity validation, authorization, approvals, dispatch, delivery, reversal, idempotency, concurrent last-unit requests, serialized credit checks, event history, the 90-day window and ERP retries.

`npm run test:browser` checks the actual UI using installed Microsoft Edge, captures pitch screenshots, and places then cancels demonstration orders. It requires the app running separately. It expects the original seed balances and no existing pending orders. The supplied demo includes cancelled orders from this check; points and stock were restored.

## Demo walkthrough

1. Select Silver Distributors (starts with 4,900 points and ₹20,000 credit).
2. In Catalogue, order 10 units of Premium Rice.
3. Inspect the ₹12,500 subtotal, 3% / ₹375 discount and ₹12,125 total.
4. Verify 5,021 points and Gold tier. Next orders use 6%.
5. Cancel the confirmed order: reservation and points are reversed.
6. Select Bronze Distributors and order 5 rice units, exceeding ₹5,000 credit.
7. Select Sales Manager, open Approval queue, View, then Approve or Reject.
8. Approve an order, Dispatch, then Mark delivered. Inspect history.
9. Inspect ERP events. Refresh updates delivery results.

P007 is out of stock; P008 has one unit. The automated last-unit test verifies exactly one successful concurrent placement.

## Read the code

- `client/src/main.jsx`: user switcher, catalogue, order forms and lists, approval queue, history.
- `server/app.js`: API routes and acting-user checks.
- `server/orders.js`: transactions and business rules.
- `server/models.js`: MongoDB collection shapes and indexes.
- `server/seed.js`: products, actors and historical delivered orders.
- `server/erp.js`: persistent outbound queue and retry worker.
- `server/database.js`: local database launcher or external connection.
- `tests/workflows.test.js`: integration checks.

All currency values in storage and API responses are integer paise. Product prices are snapshots on order lines. The browser converts currency for display; the server calculates authoritative totals.

## API examples

GET /api/users returns the demo actors. All other business routes require `x-user-id`.

- GET /api/products, /api/me, /api/orders, /api/orders/:id
- POST /api/orders with `{ "lines": [{ "product": "ObjectId", "quantity": 1 }] }` and `Idempotency-Key`.
- POST /api/orders/:id/status with `{ "status": "Confirmed" }` (or another allowed target).
- GET /api/erp (manager only).

There is no order edit endpoint. User switching is intentionally not authentication.

## ERP

ERP_URL defaults to the local `/mock-erp` receiver. The supplied paper contained no real endpoint URL or contract. Replace this setting once those are provided. Outbound events include eventId, orderId, distributorId, previousStatus, status, actorId, actorName, occurredAt and totalPaise. Use eventId to deduplicate. Network errors, timeouts and HTTP 5xx retry with exponential delays from 1 second to a 5-minute cap. Other unsuccessful responses stop and are visible as failed in ERP events. Delivery is at least once. Run one application/worker process.

## Assessment compliance

The user selected MongoDB after being informed of the conflict. Q6 requires a relational database with primary keys and enforced foreign keys. MongoDB does not satisfy that compulsory requirement, which can prevent evaluation of the entire submission. schema.dbml is an explicit collection mapping, not a claim of relational compliance. No deployment is required. Authentication is out of scope.

## Documents and submission

Root documents: schema.dbml, NOTES.md, pitch.md and onepager.md. Pitch images are in screenshots/.

A new local Git repository may be initialized for this project. Commit regularly during an actual timed assessment. Only tag the final verified commit as `submission`. Configure your own remote, push and post its URL yourself; no remote URL was supplied. No claim is made that this work was completed within a proctored assessment time window.
