const Razorpay = require('razorpay');
const crypto = require('crypto');
const paypal = require('@paypal/checkout-server-sdk');
const Payment = require('../models/Payment');
const User = require('../models/User');
const Quotation = require('../models/Quotation');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_SECRET
});

// Initialize PayPal client
const paypalClient = new paypal.core.PayPalHttpClient(
  new paypal.core.SandboxEnvironment(
    process.env.PAYPAL_CLIENT_ID,
    process.env.PAYPAL_CLIENT_SECRET
  )
  // For production: new paypal.core.LiveEnvironment(...)
);

// Create Payment Order
// Create Payment Order - CORRECTED VERSION
exports.createOrder = async (req, res) => {
  try {
    const { amount, hours, gateway = 'razorpay' } = req.body;

    if (!amount || !hours) {
      return res.status(400).json({ success: false, message: "Amount and hours are required" });
    }

    if (gateway === 'razorpay') {
      const options = {
        amount: amount, // Frontend already sent amount in paise
        currency: "INR",
        receipt: `receipt_${Date.now()}`
      };

      const order = await razorpay.orders.create(options);
      return res.status(200).json({ 
        success: true, 
        order,
        gateway: 'razorpay'
      });
    }
    else if (gateway === 'paypal') {
      const request = new paypal.orders.OrdersCreateRequest();
      request.prefer("return=representation");
      request.requestBody({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: 'USD',
            value: (amount / 100).toString(), // Convert paise to rupees for PayPal
          },
          description: `Purchase of ${hours} hours`
        }]
      });

      const order = await paypalClient.execute(request);
      return res.status(200).json({ 
        success: true, 
        order: order.result,
        gateway: 'paypal'
      });
    } else {
      return res.status(400).json({ success: false, message: "Invalid payment gateway" });
    }
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to create order" });
  }
};

// Verify Payment
exports.verifyPayment = async (req, res) => {
  try {
    const { 
      gateway,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      paypal_order_id,
      amount,
      hours
    } = req.body;

    console.log('🔍 Verifying Payment:', { gateway, ...req.body });

    if (gateway === 'razorpay') {
      const body = razorpay_order_id + '|' + razorpay_payment_id;
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_SECRET)
        .update(body.toString())
        .digest('hex');

      if (expectedSignature !== razorpay_signature) {
        return res.status(400).json({ success: false, message: 'Invalid signature' });
      }
    }
    else if (gateway === 'paypal') {
      // For PayPal, we just capture the order to verify
      const request = new paypal.orders.OrdersCaptureRequest(paypal_order_id);
      request.requestBody({});
      
      const response = await paypalClient.execute(request);
      if (response.result.status !== 'COMPLETED') {
        return res.status(400).json({ success: false, message: 'Payment not completed' });
      }
    } else {
      return res.status(400).json({ success: false, message: 'Invalid payment gateway' });
    }

    // Save payment in DB
    const payment = await Payment.create({
      ...(gateway === 'razorpay' && {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      }),
      ...(gateway === 'paypal' && {
        paypal_order_id
      }),
      amount,
      hoursPurchased: hours,
      gateway,
      user: req.user.id
    });

    // Add purchased hours to the user
    await User.findByIdAndUpdate(req.user.id, {
      $inc: { Hours: hours }
    });

    res.status(200).json({ success: true, payment });

  } catch (error) {
    console.error('❌ Payment verification failed:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || "Payment verification failed" 
    });
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


// Configure file upload settings for purchase orders
const maxFileSize = 10 * 1024 * 1024; // 10MB limit for purchase orders
const allowedFileTypes = ['application/pdf', 'image/jpeg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const allowedExtensions = ['.pdf', '.doc', '.docx', '.jpeg', '.jpg', '.png'];

exports.createPurchaseOrder = asyncHandler(async (req, res, next) => {
  let file;
  let filePath;
  let relativePath;

  try {
    const { amount, hours, quotationId } = req.body;

    if (!amount || !hours) {
      return next(new ErrorResponse('Amount and hours are required', 400));
    }

    if (!quotationId) {
      return next(new ErrorResponse('Quotation ID is required', 400));
    }

    // Validate quotation
    const quotation = await Quotation.findById(quotationId);
    if (!quotation) {
      return next(new ErrorResponse('Quotation not found', 404));
    }

    // Check for uploaded file
    if (!req.files || !req.files.file) {
      return next(new ErrorResponse('No purchase order file was uploaded', 400));
    }

    file = req.files.file;

    // Validate file size
    if (file.size > maxFileSize) {
      return next(new ErrorResponse(`Purchase order file exceeds ${maxFileSize / 1024 / 1024}MB limit`, 400));
    }

    // Validate file type
    const fileExtension = path.extname(file.name).toLowerCase();
    if (!allowedExtensions.includes(fileExtension) || !allowedFileTypes.includes(file.mimetype)) {
      return next(new ErrorResponse(
        'Invalid file type. Only PDF, DOC, DOCX, JPEG, JPG, and PNG files are accepted',
        400
      ));
    }

    // Directory structure
    const now = new Date();
    const uploadDir = path.join(
      __dirname,
      '../uploads/purchase_orders',
      `${now.getFullYear()}`,
      `${now.getMonth() + 1}`,
      `${now.getDate()}`
    );

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const originalName = path.parse(file.name).name;
    const sanitizedName = originalName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const fileName = `${sanitizedName}_${Date.now()}${fileExtension}`;
    filePath = path.join(uploadDir, fileName);
    relativePath = `/uploads/purchase_orders/${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}/${fileName}`;

    // Move file
    await file.mv(filePath);

    // Create Payment
    const payment = await Payment.create({
      amount,
      hoursPurchased: hours,
      gateway: 'purchase_order',
      user: req.user.id,
      purchaseOrderFile: relativePath,
      fileType: fileExtension.substring(1).toUpperCase(),
      fileSize: file.size,
      status: 'pending',
      quotation: quotationId
    });

    // Update Quotation with payment ID (if needed)
    quotation.payment = payment._id;
    quotation.poStatus = 'requested'; // optional status update
    await quotation.save();

    res.status(201).json({
      success: true,
      data: payment,
      message: "Purchase order submitted for approval and linked to quotation"
    });

  } catch (err) {
    console.error('Error in createPurchaseOrder:', err);

    if (file && filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    return next(new ErrorResponse('Failed to process purchase order request', 500));
  }
});
