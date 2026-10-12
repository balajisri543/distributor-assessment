import mongoose from 'mongoose';
import { User, Product, Order, Award, Event } from './models.js';

export async function seedIfEmpty() {
  if (await User.exists({})) return;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const [bronze, silver, gold, manager] = await User.create([
        { name: 'Bronze Distributors', role: 'Distributor', creditLimit: 500000 },
        { name: 'Silver Distributors', role: 'Distributor', creditLimit: 2000000 },
        { name: 'Gold Distributors', role: 'Distributor', creditLimit: 10000000 },
        { name: 'Sales Manager', role: 'SalesManager', creditLimit: 0 }
      ], { session, ordered: true });
      const products = await Product.create([
        { sku: 'P001', name: 'Premium Rice', price: 125000, stock: 100 },
        { sku: 'P002', name: 'Cooking Oil', price: 18000, stock: 80 },
        { sku: 'P003', name: 'Wheat Flour', price: 45000, stock: 60 },
        { sku: 'P004', name: 'Sugar', price: 5000, stock: 200 },
        { sku: 'P005', name: 'Tea', price: 25000, stock: 50 },
        { sku: 'P006', name: 'Coffee', price: 35000, stock: 40 },
        { sku: 'P007', name: 'Soap', price: 5000, stock: 0 },
        { sku: 'P008', name: 'Limited Gift Pack', price: 10000, stock: 1 }
      ], { session, ordered: true });
      for (const [user, points] of [[silver, 4900], [gold, 6000]]) {
        const date = new Date(Date.now() - 30 * 86400000);
        const total = points * 10000;
        const [order] = await Order.create([{
          distributor: user._id, idempotencyKey: `history-${user._id}`, requestSignature: 'historical-import',
          lines: [{ product: products[0]._id, sku: 'P001', name: products[0].name, price: products[0].price, quantity: total / products[0].price }],
          status: 'Delivered', discountPercent: 0, subtotal: total, discount: 0, total, createdAt: date
        }], { session });
        await Award.create([{ distributor: user._id, order: order._id, points, awardedAt: date }], { session });
        const states = ['Placed', 'Confirmed', 'Dispatched', 'Delivered'];
        for (let index = 0; index < states.length; index++) {
          await Event.create([{ order: order._id, from: states[index - 1] || null, to: states[index], actor: manager._id, actorName: manager.name, occurredAt: new Date(date.getTime() + index * 1000) }], { session });
        }
      }
      console.log('Created eight products, three distributors and one manager.');
    });
  } finally { await session.endSession(); }
}
