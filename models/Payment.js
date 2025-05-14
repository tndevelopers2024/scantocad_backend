// models/Payment.js

const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  gateway: {
    type: String,
    enum: ['razorpay', 'paypal'],
    required: true
  },
  orderId: String,
  paymentId: String,
  signature: String, // Razorpay signature (optional)
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'INR'
  },
  hoursPurchased: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['success', 'failed', 'pending'],
    default: 'pending'
  },
  paymentDate: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Payment', paymentSchema);
