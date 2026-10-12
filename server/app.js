import express from 'express';
import mongoose from 'mongoose';
import path from 'node:path';
import { User, Product, Order, Event, Outbox } from './models.js';
import { fail, loyalty, credit, checkAccess, placeOrder, changeStatus } from './orders.js';

const route = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '64kb' }));
  app.get('/api/health', (req, res) => res.json({ ready: mongoose.connection.readyState === 1 }));
  app.get('/api/users', route(async (req, res) => res.json(await User.find().sort({ name: 1 }))));
  app.use('/api', route(async (req, res, next) => {
    const id = req.header('x-user-id');
    if (!mongoose.isValidObjectId(id)) fail('Select a valid user.', 401);
    req.actor = await User.findById(id);
    if (!req.actor) fail('User not found.', 401);
    next();
  }));
  app.get('/api/me', route(async (req, res) => {
    const profile = req.actor.toObject();
    if (profile.role === 'Distributor') Object.assign(profile, await loyalty(profile._id), await credit(profile._id));
    res.json(profile);
  }));
  app.get('/api/products', route(async (req, res) => {
    const products = await Product.find().sort({ sku: 1 }).lean();
    res.json(products.map(product => ({ ...product, available: product.stock - product.reserved })));
  }));
  app.get('/api/orders', route(async (req, res) => {
    const filter = req.actor.role === 'Distributor' ? { distributor: req.actor._id } : {};
    res.json(await Order.find(filter).populate('distributor', 'name').sort({ createdAt: -1 }));
  }));
  app.get('/api/orders/:id', route(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) fail('Invalid order ID.');
    const order = await Order.findById(req.params.id);
    if (!order) fail('Order not found.', 404);
    checkAccess(req.actor, order);
    res.json({ order, events: await Event.find({ order: order._id }).sort({ occurredAt: 1, _id: 1 }) });
  }));
  app.post('/api/orders', route(async (req, res) => res.json(await placeOrder(req.actor, req.body.lines, req.header('idempotency-key')))));
  app.post('/api/orders/:id/status', route(async (req, res) => res.json(await changeStatus(req.actor, req.params.id, req.body.status))));
  app.get('/api/erp', route(async (req, res) => {
    if (req.actor.role !== 'SalesManager') fail('Sales Manager access required.', 403);
    const jobs = await Outbox.find().populate('event').sort({ _id: -1 }).limit(50);
    res.json(jobs);
  }));
  app.post('/mock-erp', (req, res) => {
    console.log(`ERP accepted ${req.body.eventId}: ${req.body.status}`);
    res.json({ accepted: true });
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));
  app.use(express.static(path.resolve('dist')));
  app.get('*', (req, res) => res.sendFile(path.resolve('dist/index.html')));
  app.use((error, req, res, next) => {
    const status = error.status || (['ValidationError', 'CastError', 'SyntaxError'].includes(error.name) ? 400 : 500);
    if (status === 500) console.error(error);
    res.status(status).json({ error: status === 500 ? 'Unexpected server error.' : error.message });
  });
  return app;
}
