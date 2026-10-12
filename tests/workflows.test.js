import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { connectDatabase } from '../server/database.js';
import { seedIfEmpty } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { User, Product, Order, Award, Event, Outbox } from '../server/models.js';
import { loyalty } from '../server/orders.js';
import { createERPWorker } from '../server/erp.js';

let closeDatabase, server, base, users, products;
before(async () => {
  closeDatabase = await connectDatabase({ temporary: true });
  await seedIfEmpty();
  users = await User.find(); products = await Product.find();
  server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (closeDatabase) await closeDatabase();
});

const user = name => users.find(item => item.name.startsWith(name));
const product = sku => products.find(item => item.sku === sku);
async function request(actor, endpoint, { method = 'GET', body, key } = {}) {
  const response = await fetch(`${base}${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(actor ? { 'x-user-id': String(actor._id) } : {}), ...(key ? { 'Idempotency-Key': key } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  return { status: response.status, body: await response.json() };
}
const place = (actor, lines, key = crypto.randomUUID()) => request(actor, '/orders', { method: 'POST', body: { lines }, key });
const line = (sku, quantity) => ({ product: String(product(sku)._id), quantity });
const change = (actor, id, status) => request(actor, `/orders/${id}/status`, { method: 'POST', body: { status } });

test('seed, catalogue, user access and historical tiers', async () => {
  assert.equal(users.length, 4); assert.equal(products.length, 8);
  assert.equal((await request(null, '/products')).status, 401);
  const result = await request(user('Silver'), '/products');
  assert.equal(result.body.find(item => item.sku === 'P007').available, 0);
  assert.equal(result.body.find(item => item.sku === 'P008').available, 1);
  assert.deepEqual(await loyalty(user('Silver')._id), { points: 4900, tier: 'Silver', discountPercent: 3 });
  assert.equal((await loyalty(user('Gold')._id)).tier, 'Gold');
});

test('worked example, fixed discount, tier upgrade and cancellation reversal', async () => {
  const placed = await place(user('Silver'), [line('P001', 10)]);
  assert.equal(placed.status, 200);
  assert.equal(placed.body.status, 'Confirmed');
  assert.equal(placed.body.subtotal, 1250000);
  assert.equal(placed.body.discount, 37500);
  assert.equal(placed.body.total, 1212500);
  assert.equal((await loyalty(user('Silver')._id)).points, 5021);
  const next = await place(user('Silver'), [line('P002', 1)]);
  assert.equal(next.body.discountPercent, 6);
  assert.equal((await Order.findById(placed.body._id)).discountPercent, 3);
  assert.equal((await change(user('Silver'), next.body._id, 'Cancelled')).status, 200);
  const cancelled = await change(user('Silver'), placed.body._id, 'Cancelled');
  assert.equal(cancelled.status, 200);
  assert.equal((await loyalty(user('Silver')._id)).points, 4900);
  assert.equal((await Product.findById(product('P001')._id)).reserved, 0);
  assert.equal((await change(user('Silver'), placed.body._id, 'Cancelled')).status, 409);
  assert.equal((await Product.findById(product('P001')._id)).reserved, 0);
});

test('invalid quantities, duplicate products, zero stock and missing key', async () => {
  for (const quantity of [0, -1, 1.5, '1']) assert.equal((await place(user('Bronze'), [line('P002', quantity)])).status, 400);
  assert.equal((await place(user('Bronze'), [])).status, 400);
  assert.equal((await place(user('Bronze'), [line('P002', 1), line('P002', 1)])).status, 400);
  const zero = await place(user('Bronze'), [line('P007', 1)]);
  assert.equal(zero.status, 409); assert.match(zero.body.error, /P007.*0/);
  assert.equal((await request(user('Bronze'), '/orders', { method: 'POST', body: { lines: [line('P002', 1)] } })).status, 400);
});

test('multi-line failure rolls back every reservation, order and event', async () => {
  const count = await Order.countDocuments(); const events = await Event.countDocuments();
  const beforeProduct = await Product.findById(product('P002')._id);
  const result = await place(user('Bronze'), [line('P002', 2), line('P007', 1)]);
  assert.equal(result.status, 409);
  assert.equal((await Product.findById(product('P002')._id)).reserved, beforeProduct.reserved);
  assert.equal(await Order.countDocuments(), count); assert.equal(await Event.countDocuments(), events);
});

test('credit pending approval, rejection and no points before confirmation', async () => {
  const placed = await place(user('Bronze'), [line('P001', 5)]);
  assert.equal(placed.body.status, 'PendingApproval');
  assert.equal((await loyalty(user('Bronze')._id)).points, 0);
  assert.equal((await change(user('Bronze'), placed.body._id, 'Confirmed')).status, 403);
  assert.equal((await change(user('Sales'), placed.body._id, 'Rejected')).status, 200);
  assert.equal((await Product.findById(product('P001')._id)).reserved, 0);
  assert.equal((await loyalty(user('Bronze')._id)).points, 0);
  assert.equal((await change(user('Sales'), placed.body._id, 'Rejected')).status, 409);
});

test('approval awards once, dispatch deducts physical stock, delivery releases credit', async () => {
  const stock = (await Product.findById(product('P001')._id)).stock;
  const placed = await place(user('Bronze'), [line('P001', 5)]);
  assert.equal((await change(user('Sales'), placed.body._id, 'Confirmed')).status, 200);
  assert.equal((await loyalty(user('Bronze')._id)).points, 62);
  assert.equal((await change(user('Sales'), placed.body._id, 'Confirmed')).status, 409);
  assert.equal((await change(user('Sales'), placed.body._id, 'Delivered')).status, 409);
  assert.equal((await change(user('Gold'), placed.body._id, 'Cancelled')).status, 403);
  assert.equal((await change(user('Sales'), placed.body._id, 'Dispatched')).status, 200);
  const dispatched = await Product.findById(product('P001')._id);
  assert.equal(dispatched.stock, stock - 5); assert.equal(dispatched.reserved, 0);
  assert.equal((await change(user('Bronze'), placed.body._id, 'Cancelled')).status, 409);
  assert.equal((await change(user('Sales'), placed.body._id, 'Delivered')).status, 200);
  assert.equal((await request(user('Bronze'), '/me')).body.availableCredit, 500000);
  const history = (await request(user('Bronze'), `/orders/${placed.body._id}`)).body.events;
  assert.deepEqual(history.map(event => event.to), ['Placed', 'PendingApproval', 'Confirmed', 'Dispatched', 'Delivered']);
  assert.ok(history.every(event => event.actorName && event.occurredAt));
});

test('sequential and concurrent idempotent placement do not duplicate', async () => {
  const key = crypto.randomUUID(); const lines = [line('P004', 1)];
  const results = await Promise.all([place(user('Gold'), lines, key), place(user('Gold'), lines, key)]);
  assert.ok(results.every(result => result.status === 200));
  assert.equal(results[0].body._id, results[1].body._id);
  const repeated = await place(user('Gold'), lines, key);
  assert.equal(repeated.body._id, results[0].body._id);
  assert.equal((await place(user('Gold'), [line('P004', 2)], key)).status, 409);
  assert.equal(await Order.countDocuments({ idempotencyKey: key }), 1);
});

test('two simultaneous orders for the last unit yield exactly one success', async () => {
  const results = await Promise.all([place(user('Bronze'), [line('P008', 1)]), place(user('Gold'), [line('P008', 1)])]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  const last = await Product.findById(product('P008')._id);
  assert.equal(last.stock, 1); assert.equal(last.reserved, 1);
});

test('simultaneous credit checks serialize correctly at an exact credit limit', async () => {
  const actor = await User.create({ name: 'Credit Test', role: 'Distributor', creditLimit: 10000 });
  const item = await Product.create({ sku: 'CREDIT-TEST', name: 'Test', price: 10000, stock: 2 });
  const lines = [{ product: String(item._id), quantity: 1 }];
  const results = await Promise.all([place(actor, lines), place(actor, lines)]);
  assert.ok(results.every(result => result.status === 200));
  assert.deepEqual(results.map(result => result.body.status).sort(), ['Confirmed', 'PendingApproval']);
});

test('trailing window excludes expired and reversed awards', async () => {
  const actor = await User.create({ name: 'Window Test', role: 'Distributor', creditLimit: 0 });
  const order = await Order.findOne();
  const expiredOrder = new Order({ ...order.toObject(), _id: undefined, distributor: actor._id, idempotencyKey: crypto.randomUUID() });
  await expiredOrder.save();
  await Award.create({ distributor: actor._id, order: expiredOrder._id, points: 6000, awardedAt: new Date(Date.now() - 91 * 86400000) });
  assert.equal((await loyalty(actor._id)).points, 0);
  const recentOrder = new Order({ ...order.toObject(), _id: undefined, distributor: actor._id, idempotencyKey: crypto.randomUUID() });
  await recentOrder.save();
  await Award.create({ distributor: actor._id, order: recentOrder._id, points: 1000, awardedAt: new Date(), reversedAt: new Date() });
  assert.equal((await loyalty(actor._id)).tier, 'Bronze');
});

test('event history is append-only through model operations', async () => {
  const event = await Event.findOne();
  await assert.rejects(Event.updateOne({ _id: event._id }, { $set: { actorName: 'Changed' } }), /append-only/);
  await assert.rejects(Event.deleteOne({ _id: event._id }), /append-only/);
});

test('ERP retries 5xx and timeouts with backoff, succeeds, and stops on 4xx', async () => {
  await Outbox.updateMany({}, { $set: { deliveredAt: new Date() } });
  const placed = await place(user('Gold'), [line('P006', 1)]);
  const event = await Event.findOne({ order: placed.body._id });
  await Outbox.updateMany({}, { $set: { deliveredAt: new Date() } });
  const job = await Outbox.findOne({ event: event._id });
  await Outbox.updateOne({ _id: job._id }, { $set: { deliveredAt: null } });
  let mode = '500'; const payloads = [];
  const tick = createERPWorker('http://example.test', async (url, options) => {
    payloads.push(JSON.parse(options.body));
    if (mode === 'timeout') throw new Error('Timeout');
    return new Response('', { status: Number(mode) });
  });
  await tick(); let updated = await Outbox.findById(job._id);
  assert.equal(updated.attempts, 1); assert.equal(updated.deliveredAt, null);
  const firstDelay = updated.nextAttemptAt.getTime() - Date.now(); assert.ok(firstDelay > 500);
  mode = 'timeout'; await Outbox.updateOne({ _id: job._id }, { $set: { nextAttemptAt: new Date(0) } });
  await tick(); updated = await Outbox.findById(job._id);
  assert.equal(updated.attempts, 2); assert.ok(updated.nextAttemptAt.getTime() - Date.now() > firstDelay);
  mode = '200'; await Outbox.updateOne({ _id: job._id }, { $set: { nextAttemptAt: new Date(0) } });
  await tick(); updated = await Outbox.findById(job._id);
  assert.ok(updated.deliveredAt); assert.equal(new Set(payloads.map(payload => payload.eventId)).size, 1);
  mode = '400'; await Outbox.updateOne({ _id: job._id }, { $set: { deliveredAt: null, nextAttemptAt: new Date(0) } });
  await tick(); assert.equal((await Outbox.findById(job._id)).failed, true);
});
