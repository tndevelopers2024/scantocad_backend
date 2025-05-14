const Razorpay = require('razorpay');
const crypto = require('crypto');
const Payment = require('../models/Payment');
const User = require('../models/User');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_SECRET
});

// Create Razorpay Order
exports.createOrder = async (req, res) => {
  try {
    const { amount, hours } = req.body;

    if (!amount || !hours) {
      return res.status(400).json({ success: false, message: "Amount and hours are required" });
    }

    const options = {
      amount: amount * 100, // Amount in paise
      currency: "INR",
      receipt: `receipt_${Date.now()}`
    };

    const order = await razorpay.orders.create(options);
    res.status(200).json({ success: true, order });
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({ success: false, message: "Failed to create order" });
  }
};

// GET /api/payment/history
exports.getUserPayments = async (req, res) => {
  try {
    const userId = req.user.id;
    const payments = await Payment.find({ user: userId }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, payments });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch payments" });
  }
};


exports.verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      amount,
      hours
    } = req.body;

    console.log('🔍 Verifying Payment:', req.body);

    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_SECRET)
      .update(body.toString())
      .digest('hex');

    console.log('🧾 Expected:', expectedSignature);
    console.log('🧾 Received:', razorpay_signature);

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }

    // Save payment in DB
    const payment = await Payment.create({
  razorpay_order_id,
  razorpay_payment_id,
  razorpay_signature,
  amount,
  hoursPurchased: hours,
  gateway: 'razorpay',
  user: req.user.id
});


    // Add purchased hours to the user
    await User.findByIdAndUpdate(req.user.id, {
      $inc: { Hours: hours }
    });

    res.status(200).json({ success: true, payment });

  } catch (error) {
    console.error('❌ Payment verification failed:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

