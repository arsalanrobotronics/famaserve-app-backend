const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const stripePaymentSchema = new Schema({
  customerId: {
    type: Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  email: {
    type: String,
    required: true
  },
  stripeCustomerId: {
    type: String,
    required: true
  },
  subscriptionId: {
    type: String,
    required: true
  },
  stripeSessionId: {
    type: String,
    required: false
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'aud'
  },
  status: {
    type: String,
    enum: ['active', 'canceled', 'incomplete', 'past_due', 'trialing', 'unpaid'],
    required: true
  },
  periodStart: Date,
  periodEnd: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('StripePayment', stripePaymentSchema);