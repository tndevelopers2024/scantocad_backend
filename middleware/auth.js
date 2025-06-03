const jwt = require('jsonwebtoken');
const ErrorResponse = require('../utils/errorResponse');
const User = require('../models/User');

// Protect routes
exports.protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return next(new ErrorResponse('Not authorized to access this route', 401));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return next(new ErrorResponse('No user found with this ID', 404));
    }

    // Check if email is verified (except for certain routes)
    const allowedUnverifiedRoutes = [
      '/api/v1/auth/resend-verification',
      '/api/v1/auth/verify-email',
      '/api/v1/auth/logout'
    ];

    if (!user.isVerified && !allowedUnverifiedRoutes.includes(req.path)) {
      return next(
        new ErrorResponse('Please verify your email to access this route', 403)
      );
    }

    req.user = user;
    next();
  } catch (err) {
    return next(new ErrorResponse('Not authorized to access this route', 401));
  }
};

// Grant access to specific roles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new ErrorResponse(
          `User role ${req.user.role} is not authorized to access this route`,
          403
        )
      );
    }
    next();
  };
};

// Middleware to check if email is verified
exports.requireVerifiedEmail = async (req, res, next) => {
  if (!req.user.isVerified) {
    return next(
      new ErrorResponse('Please verify your email to access this route', 403)
    );
  }
  next();
};