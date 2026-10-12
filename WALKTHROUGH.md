# Explain the project in simple terms

## What happens when Place order is clicked?

1. React sends product IDs, quantities and a unique request key.
2. Express checks that the actor is a distributor.
3. The server starts a transaction: either all changes commit, or none do.
4. It checks the request key. A repeated request returns its previous order.
5. It reads the current 90-day points and selects the discount.
6. It calculates available credit from outstanding orders.
7. It reserves every product using a conditional update.
8. It saves line prices and the discount as snapshots.
9. It records Placed, then Confirmed or PendingApproval.
10. Confirmed earns floor(total rupees / 100) points.
11. It queues ERP events in the same transaction.
12. React refreshes the displayed stock, orders and points.

## Why reserve instead of immediately reducing stock?

Physical stock is still in the warehouse until dispatch. Available quantity is physical stock minus reserved stock. Dispatch reduces both, while cancellation reduces only the reservation.

## Why can the last unit not be sold twice?

The product update requires available quantity to be at least the requested quantity. Concurrent conflicting transactions retry against committed data. The test sends two requests together and expects one success and one stock error.

## Why change the distributor revision?

Two different-product orders could otherwise read the same available credit. Writing the same distributor document forces conflicting transactions to retry, so the second transaction sees the first order's total.

## How do points expire?

The server sums unreversed awards dated within the last 90 days each time it calculates loyalty. No scheduled expiry job is needed. Cancelling marks the original award reversed. Bronze is below 1,000; Silver is below 5,000; Gold starts at 5,000.

## Why keep the discount on the order?

The customer's tier can change later. Storing the percentage and product prices ensures the old order still has the original total.

## What if ERP is unavailable?

The order remains valid. The saved outbound job retries temporary failures. A stable event ID allows ERP to reject duplicate delivery. Permanent HTTP errors are shown to managers.

## What must you acknowledge in the assessment?

MongoDB is not a relational database and does not meet Q6. Authentication is omitted as allowed. The actual ERP endpoint was not supplied, so this demo uses a mock. The event log is protected through application middleware, not privileged database access controls.
