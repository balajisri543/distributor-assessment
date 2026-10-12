# Distributor Orders and Rewards

This application helps a manufacturer receive distributor orders, manage warehouse availability and run a consistent rewards programme.

Distributors browse products, see available stock and place orders. They can track progress, view their recent rewards points and current discount tier, and cancel eligible orders before dispatch.

Sales Managers review orders that exceed available credit. They approve or reject those orders and record dispatch and delivery.

Stock is reserved when an order is placed, so available units cannot be promised twice. Rejection and cancellation release the reservation. Dispatch permanently reduces warehouse stock.

Rewards are earned when an order is confirmed. Cancelling a confirmed order reverses its reward. Bronze, Silver and Gold tiers use points earned during the previous 90 days. Each order retains the discount agreed when it was placed.

A dated history records who changed each order's status. Status events are sent to an ERP connection, with retries for temporary failures and delivery visibility for managers.

The application replaces scattered order spreadsheets, manual stock reservation notes and separate reward calculations with one shared workflow.

This is a local assessment prototype. Business rollout requires secure sign-in, verified opening data, an agreed ERP integration and operating controls.
