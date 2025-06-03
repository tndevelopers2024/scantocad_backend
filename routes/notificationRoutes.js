const express = require('express');
const { getUserNotifications, markAsRead, deleteNotification } = require('../controllers/notificationController');
const { protect } = require('../middleware/auth'); // assuming you have auth middleware
const router = express.Router();

// Get notifications for logged-in user
router.get('/', protect, getUserNotifications);

// Mark a notification as read
router.put('/:id/read', protect, markAsRead);

// Delete a notification
router.delete('/:id', protect, deleteNotification);

module.exports = router;
