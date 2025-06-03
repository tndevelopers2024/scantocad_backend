// models/Payment.js

const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  quotation: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'Quotation'
},
  gateway: {
    type: String,
    enum: ['razorpay', 'paypal','purchase_order'],
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
  },
   // 👇 Add these for purchase_order support
   purchaseOrderFile: {
    type: String
  },
  fileType: {
    type: String
  },
  fileSize: {
    type: Number
  }
});

module.exports = mongoose.model('Payment', paymentSchema);
