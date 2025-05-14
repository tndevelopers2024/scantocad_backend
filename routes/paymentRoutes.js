const express = require('express');
const router = express.Router();
const { createOrder, verifyPayment, getUserPayments } = require('../controllers/paymentController');
const { protect } = require('../middleware/auth');

// @route   POST /api/payment/order
router.post('/order', protect, createOrder);

// @route   POST /api/payment/verify
router.post('/verify', protect, verifyPayment);
router.get('/history', protect, getUserPayments);

module.exports = router;
