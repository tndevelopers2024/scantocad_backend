const express = require('express');
const router = express.Router();
const {
  createOrder,
  verifyPayment,
  getUserPayments,
  createPurchaseOrder,
} = require('../controllers/paymentController');
const { protect } = require('../middleware/auth');

// @route   POST /api/payment/order
router.post('/order', protect, createOrder);

// @route   POST /api/payment/verify
router.post('/verify', protect, verifyPayment);

// @route   GET /api/payment/history
router.get('/history', protect, getUserPayments);

router.post('/purchase-order', protect, createPurchaseOrder);

module.exports = router;
