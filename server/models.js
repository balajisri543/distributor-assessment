import mongoose from 'mongoose';
const { Schema } = mongoose;
const options = { versionKey: false, autoCreate: false, autoIndex: false };
const ref = model => ({ type: Schema.Types.ObjectId, ref: model, required: true });
const integer = (min = 0) => ({ type: Number, required: true, min, validate: Number.isSafeInteger });
export const statuses = ['Placed', 'PendingApproval', 'Confirmed', 'Dispatched', 'Delivered', 'Cancelled', 'Rejected'];

export const User = mongoose.model('User', new Schema({
  name: { type: String, required: true },
  role: { type: String, enum: ['Distributor', 'SalesManager'], required: true },
  creditLimit: integer(), revision: { ...integer(), default: 0 }
}, options));

export const Product = mongoose.model('Product', new Schema({
  sku: { type: String, required: true, unique: true }, name: { type: String, required: true },
  price: integer(), stock: integer(), reserved: { ...integer(), default: 0 }
}, options));

const line = new Schema({
  product: ref('Product'), sku: { type: String, required: true }, name: { type: String, required: true },
  price: integer(), quantity: integer(1)
}, { _id: false });

const orderSchema = new Schema({
  distributor: ref('User'), idempotencyKey: { type: String, required: true },
  requestSignature: { type: String, required: true }, lines: { type: [line], required: true },
  status: { type: String, enum: statuses, required: true },
  discountPercent: integer(), subtotal: integer(), discount: integer(), total: integer(),
  createdAt: { type: Date, required: true }
}, options);
orderSchema.index({ distributor: 1, idempotencyKey: 1 }, { unique: true });
export const Order = mongoose.model('Order', orderSchema);

export const Award = mongoose.model('Award', new Schema({
  distributor: ref('User'), order: { ...ref('Order'), unique: true }, points: integer(),
  awardedAt: { type: Date, required: true }, reversedAt: { type: Date, default: null }
}, options));

const eventSchema = new Schema({
  order: ref('Order'), from: { type: String, default: null },
  to: { type: String, enum: statuses, required: true }, actor: ref('User'),
  actorName: { type: String, required: true }, occurredAt: { type: Date, required: true }
}, options);
// Application-level immutability. A database administrator can still bypass it.
eventSchema.pre('save', function () { if (!this.isNew) throw new Error('Events are append-only.'); });
for (const operation of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {
  eventSchema.pre(operation, function () { throw new Error('Events are append-only.'); });
}
export const Event = mongoose.model('Event', eventSchema);

export const Outbox = mongoose.model('Outbox', new Schema({
  event: { ...ref('Event'), unique: true }, attempts: { ...integer(), default: 0 },
  nextAttemptAt: { type: Date, required: true }, deliveredAt: { type: Date, default: null },
  failed: { type: Boolean, required: true, default: false }, lastError: { type: String, default: '' }
}, options));

export const models = [User, Product, Order, Award, Event, Outbox];
