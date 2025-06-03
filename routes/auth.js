const express = require('express');
const {
  register,
  login,
  getMe,
  logout,
  verifyEmail,
  resendVerification,
  updateDetails,
  updatePassword,

} = require('../controllers/auth');

const router = express.Router();

const { protect, authorize, requireVerifiedEmail } = require('../middleware/auth');

// Public routes
router.post('/register', register);
router.post('/login', login);
router.get('/verify-email/:token', verifyEmail);
router.post('/resend-verification', resendVerification);

// Protected routes (require authentication)
router.get('/me', protect, getMe);
router.get('/logout', protect, logout);
router.put('/updatedetails', protect, requireVerifiedEmail, updateDetails);
router.put('/updatepassword', protect, requireVerifiedEmail, updatePassword);

module.exports = router;