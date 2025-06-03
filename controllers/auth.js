const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');
const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const sendEmail = require('../utils/sendEmail');
const crypto = require('crypto');

// @desc    Register user
// @route   POST /api/v1/auth/register
// @access  Public
exports.register = asyncHandler(async (req, res, next) => {
  const { name, email, password, phone, role, company } = req.body;

  // Check if user exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new ErrorResponse('User already exists', 400));
  }

  // Create unverified user
  const user = await User.create({
    name,
    email,
    password,
    phone,
    role,
    isVerified: false,
    emailVerificationToken: crypto.randomBytes(3).toString('hex'),
    emailVerificationExpire: Date.now() + 30 * 60 * 1000, // 30 minutes
    company: {
      name: company?.name,
      address: company?.address,
      website: company?.website,
      industry: company?.industry,
      gstNumber: company?.gstNumber
    }
  });

  // Send verification email
  const verificationUrl = `${req.protocol}://${req.get('host')}/api/v1/auth/verify-email/${user.emailVerificationToken}`;
  
  const message = `
    <h1>Email Verification</h1>
    <p>Please verify your email by clicking the link below:</p>
    <a href=${verificationUrl} clicktracking=off>${verificationUrl}</a>
    <p>Or enter this OTP code: ${user.emailVerificationToken}</p>
    <p>This OTP will expire in 30 minutes</p>
  `;

  try {
    await sendEmail({
      email: user.email,
      subject: 'Email Verification',
      message: message
    });

    res.status(200).json({
      success: true,
      data: {
        email: user.email,
        message: 'Verification email sent'
      }
    });
  } catch (err) {
    await User.findByIdAndDelete(user._id);
    return next(new ErrorResponse('Email could not be sent', 500));
  }
});

// @desc    Verify email
// @route   GET /api/v1/auth/verify-email/:token
// @access  Public
exports.verifyEmail = asyncHandler(async (req, res, next) => {
  const { token } = req.params;

  const user = await User.findOne({
    emailVerificationToken: token,
    emailVerificationExpire: { $gt: Date.now() }
  });

  if (!user) {
    return next(new ErrorResponse('Invalid or expired token', 400));
  }

  // Mark user as verified
  user.isVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpire = undefined;
  await user.save();

  sendTokenResponse(user, 200, res);
});

// @desc    Resend verification email
// @route   POST /api/v1/auth/resend-verification
// @access  Public
exports.resendVerification = asyncHandler(async (req, res, next) => {
  const { email } = req.body;

  const user = await User.findOne({ email });

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  if (user.isVerified) {
    return next(new ErrorResponse('Email already verified', 400));
  }

  // Generate new token
  user.emailVerificationToken = crypto.randomBytes(3).toString('hex');
  user.emailVerificationExpire = Date.now() + 30 * 60 * 1000; // 30 minutes
  await user.save();

  // Send verification email
  const verificationUrl = `${req.protocol}://${req.get('host')}/api/v1/auth/verify-email/${user.emailVerificationToken}`;
  
  const message = `
    <h1>Email Verification</h1>
    <p>Please verify your email by clicking the link below:</p>
    <a href=${verificationUrl} clicktracking=off>${verificationUrl}</a>
    <p>Or enter this OTP code: ${user.emailVerificationToken}</p>
    <p>This OTP will expire in 30 minutes</p>
  `;

  try {
    await sendEmail({
      email: user.email,
      subject: 'Email Verification',
      message: message
    });

    res.status(200).json({
      success: true,
      data: {
        email: user.email,
        message: 'Verification email resent'
      }
    });
  } catch (err) {
    return next(new ErrorResponse('Email could not be sent', 500));
  }
});


// @desc    Login user
// @route   POST /api/v1/auth/login
// @access  Public
// controllers/auth.js
exports.login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new ErrorResponse('Please provide an email and password', 400));
  }

  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    return next(new ErrorResponse('Invalid credentials', 401));
  }

  if (!user.isVerified) {
    return next(new ErrorResponse('Please verify your email first', 401));
  }

  const isMatch = await user.matchPassword(password);

  if (!isMatch) {
    return next(new ErrorResponse('Invalid credentials', 401));
  }

  sendTokenResponse(user, 200, res);
});

// @desc    Get current logged in user
// @route   GET /api/v1/auth/me
// @access  Private
exports.getMe = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);

  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Update user details
// @route   PUT /api/v1/auth/updatedetails
// @access  Private
exports.updateDetails = asyncHandler(async (req, res, next) => {
  const { name, email, phone, company } = req.body;

  const fieldsToUpdate = {
    name,
    email,
    phone,
    company: {
      name: company?.name,
      address: company?.address,
      website: company?.website,
      industry: company?.industry,
      gstNumber: company?.gstNumber
    }
  };

  const user = await User.findByIdAndUpdate(req.user.id, fieldsToUpdate, {
    new: true,
    runValidators: true
  });

  res.status(200).json({
    success: true,
    data: user
  });
});


// @desc    Update password
// @route   PUT /api/v1/auth/updatepassword
// @access  Private
exports.updatePassword = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id).select('+password');

  // Check current password
  if (!(await user.matchPassword(req.body.currentPassword))) {
    return next(new ErrorResponse('Password is incorrect', 401));
  }

  user.password = req.body.newPassword;
  await user.save();

  sendTokenResponse(user, 200, res);
});

// @desc    Logout user / clear cookie
// @route   GET /api/v1/auth/logout
// @access  Private
exports.logout = asyncHandler(async (req, res, next) => {
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });

  res.status(200).json({
    success: true,
    data: {}
  });
});

// Get token from model, create cookie and send response
const sendTokenResponse = (user, statusCode, res) => {
  // Create token
  const token = generateToken(user._id, user.role);

  const options = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRE * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  };

  res
    .status(statusCode)
    .cookie('token', token, options)
    .json({
 success: true,
 user: {
 id: user._id,
 name: user.name,
 email: user.email,
 },
      token,
      role: user.role
    });
};