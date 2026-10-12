import { Outbox, Event, Order } from './models.js';

// Run only one worker per application. ERP must deduplicate eventId.
export function createERPWorker(url, send = fetch) {
  let running = false;
  return async function tick() {
    if (running) return;
    running = true;
    try {
      const jobs = await Outbox.find({ deliveredAt: null, failed: false, nextAttemptAt: { $lte: new Date() } }).sort({ nextAttemptAt: 1 }).limit(20);
      for (const job of jobs) {
        const event = await Event.findById(job.event);
        const order = await Order.findById(event.order);
        const attempts = job.attempts + 1;
        try {
          const response = await send(url, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': String(event._id) },
            body: JSON.stringify({ eventId: event._id, orderId: event.order, distributorId: order.distributor, previousStatus: event.from, status: event.to, actorId: event.actor, actorName: event.actorName, occurredAt: event.occurredAt, totalPaise: order.total }),
            signal: AbortSignal.timeout(5000)
          });
          if (response.status >= 500) throw new Error(`ERP returned ${response.status}`);
          const result = response.ok ? { deliveredAt: new Date(), lastError: '' } : { failed: true, lastError: `ERP returned ${response.status}` };
          await Outbox.updateOne({ _id: job._id }, { $set: { attempts, ...result } });
        } catch (error) {
          const delay = Math.min(1000 * 2 ** Math.min(attempts - 1, 9), 300000);
          await Outbox.updateOne({ _id: job._id }, { $set: { attempts, nextAttemptAt: new Date(Date.now() + delay), lastError: error.message } });
        }
      }
    } finally { running = false; }
  };
}
