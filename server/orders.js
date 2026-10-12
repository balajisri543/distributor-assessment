import mongoose from 'mongoose';
import { User, Product, Order, Award, Event, Outbox } from './models.js';

export function fail(message, status = 400) {
  const error = new Error(message); error.status = status; throw error;
}

async function transaction(callback) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => { result = await callback(session); });
    return result;
  } finally { await session.endSession(); }
}

export async function loyalty(distributor, session = null) {
  const since = new Date(Date.now() - 90 * 86400000);
  const awards = await Award.find({ distributor, awardedAt: { $gte: since, $lte: new Date() }, reversedAt: null }).session(session);
  const points = awards.reduce((sum, item) => sum + item.points, 0);
  const tier = points >= 5000 ? 'Gold' : points >= 1000 ? 'Silver' : 'Bronze';
  return { points, tier, discountPercent: tier === 'Gold' ? 6 : tier === 'Silver' ? 3 : 0 };
}

export async function credit(distributor, session = null) {
  const user = await User.findById(distributor).session(session);
  const orders = await Order.find({ distributor, status: { $nin: ['Delivered', 'Cancelled', 'Rejected'] } }).session(session);
  const outstanding = orders.reduce((sum, order) => sum + order.total, 0);
  return { creditLimit: user.creditLimit, outstanding, availableCredit: user.creditLimit - outstanding };
}

export function checkAccess(actor, order) {
  if (actor.role === 'Distributor' && String(order.distributor) !== String(actor._id)) fail('This order belongs to another distributor.', 403);
}

async function record(order, from, to, actor, session) {
  const [event] = await Event.create([{ order: order._id, from, to, actor: actor._id, actorName: actor.name, occurredAt: new Date() }], { session });
  await Outbox.create([{ event: event._id, nextAttemptAt: new Date() }], { session });
}

async function award(order, session) {
  await Award.create([{ distributor: order.distributor, order: order._id, points: Math.floor(order.total / 10000), awardedAt: new Date() }], { session });
}

function normalize(lines) {
  if (!Array.isArray(lines) || !lines.length || lines.length > 100) fail('Add between 1 and 100 products.');
  const seen = new Set();
  return lines.map(line => {
    if (!mongoose.isValidObjectId(line.product)) fail('Invalid product.');
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) fail('Quantity must be a positive whole number.');
    const product = String(line.product);
    if (seen.has(product)) fail('Each product may appear only once.');
    seen.add(product);
    return { product, quantity: line.quantity };
  }).sort((a, b) => a.product.localeCompare(b.product));
}

export async function placeOrder(actor, lines, key) {
  if (actor.role !== 'Distributor') fail('Distributor access required.', 403);
  if (typeof key !== 'string' || !key.trim() || key.length > 200) fail('Provide an idempotency key.');
  const requested = normalize(lines);
  const signature = JSON.stringify(requested);
  try {
    return await transaction(async session => {
      const existing = await Order.findOne({ distributor: actor._id, idempotencyKey: key }).session(session);
      if (existing) {
        if (existing.requestSignature !== signature) fail('Key already used for a different order.', 409);
        return existing;
      }
      // Serializes this distributor's credit and loyalty changes.
      await User.updateOne({ _id: actor._id }, { $inc: { revision: 1 } }, { session });
      const rewards = await loyalty(actor._id, session);
      const balance = await credit(actor._id, session);
      const snapshots = [];
      for (const item of requested) {
        const product = await Product.findById(item.product).session(session);
        if (!product) fail('Product not found.', 404);
        const available = product.stock - product.reserved;
        if (item.quantity > available) fail(`${product.sku}: only ${available} units available.`, 409);
        const reserved = await Product.updateOne({
          _id: product._id,
          $expr: { $gte: [{ $subtract: ['$stock', '$reserved'] }, item.quantity] }
        }, { $inc: { reserved: item.quantity } }, { session });
        if (reserved.modifiedCount !== 1) fail(`${product.sku}: stock changed; retry.`, 409);
        snapshots.push({ product: product._id, sku: product.sku, name: product.name, price: product.price, quantity: item.quantity });
      }
      const subtotal = snapshots.reduce((sum, line) => sum + line.price * line.quantity, 0);
      if (!Number.isSafeInteger(subtotal)) fail('Order total is too large.');
      const discount = Math.round(subtotal * rewards.discountPercent / 100);
      const total = subtotal - discount;
      const [order] = await Order.create([{
        distributor: actor._id, idempotencyKey: key, requestSignature: signature, lines: snapshots,
        status: 'Placed', discountPercent: rewards.discountPercent, subtotal, discount, total, createdAt: new Date()
      }], { session });
      await record(order, null, 'Placed', actor, session);
      order.status = total > balance.availableCredit ? 'PendingApproval' : 'Confirmed';
      await order.save({ session });
      await record(order, 'Placed', order.status, actor, session);
      if (order.status === 'Confirmed') await award(order, session);
      return order;
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const existing = await Order.findOne({ distributor: actor._id, idempotencyKey: key });
    if (!existing || existing.requestSignature !== signature) fail('Idempotency conflict.', 409);
    return existing;
  }
}

const transitions = {
  Placed: ['Cancelled'], PendingApproval: ['Confirmed', 'Rejected', 'Cancelled'],
  Confirmed: ['Dispatched', 'Cancelled'], Dispatched: ['Delivered'], Delivered: [], Cancelled: [], Rejected: []
};

export async function changeStatus(actor, id, target) {
  if (!mongoose.isValidObjectId(id)) fail('Invalid order ID.');
  return transaction(async session => {
    const order = await Order.findById(id).session(session);
    if (!order) fail('Order not found.', 404);
    checkAccess(actor, order);
    if (!transitions[order.status].includes(target)) fail(`Cannot change ${order.status} to ${target}.`, 409);
    if (target === 'Cancelled') {
      if (actor.role !== 'Distributor') fail('Only the owning distributor can cancel.', 403);
    } else if (actor.role !== 'SalesManager') fail('Sales Manager access required.', 403);
    await User.updateOne({ _id: order.distributor }, { $inc: { revision: 1 } }, { session });
    const previous = order.status;
    if (['Cancelled', 'Rejected', 'Dispatched'].includes(target)) {
      for (const line of order.lines) {
        const dispatch = target === 'Dispatched';
        const filter = { _id: line.product, reserved: { $gte: line.quantity } };
        if (dispatch) filter.stock = { $gte: line.quantity };
        const increment = { reserved: -line.quantity };
        if (dispatch) increment.stock = -line.quantity;
        const changed = await Product.updateOne(filter, { $inc: increment }, { session });
        if (changed.modifiedCount !== 1) fail('Inventory reservation is inconsistent.', 409);
      }
    }
    if (target === 'Cancelled' && previous === 'Confirmed') {
      await Award.updateOne({ order: order._id, reversedAt: null }, { $set: { reversedAt: new Date() } }, { session });
    }
    order.status = target;
    await order.save({ session });
    if (target === 'Confirmed') await award(order, session);
    await record(order, previous, target, actor, session);
    return order;
  });
}
