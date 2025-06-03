const Notification = require('../models/Notification');
const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');

// @desc Get all notifications for the logged-in user
exports.getUserNotifications = asyncHandler(async (req, res) => {
  const notifications = await Notification.find({ user: req.user.id }).sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: notifications.length,
    data: notifications
  });
});

// @desc Mark notification as read
exports.markAsRead = asyncHandler(async (req, res, next) => {
  const notification = await Notification.findById(req.params.id);
  if (!notification) return next(new ErrorResponse('Notification not found', 404));

  if (notification.user.toString() !== req.user.id) {
    return next(new ErrorResponse('Not authorized to mark this notification', 403));
  }

  notification.isRead = true;
  await notification.save();

  // Emit real-time update
  const io = req.app.get('io');
  io.to(req.user.id).emit('notification:read', {
    id: notification._id,
    message: 'Notification marked as read'
  });

  res.status(200).json({ success: true, data: notification });
});

// @desc Delete notification
exports.deleteNotification = asyncHandler(async (req, res, next) => {
  const notification = await Notification.findById(req.params.id);
  if (!notification) return next(new ErrorResponse('Notification not found', 404));

  if (notification.user.toString() !== req.user.id) {
    return next(new ErrorResponse('Not authorized to delete this notification', 403));
  }

  await notification.deleteOne();

  // Emit real-time update
  const io = req.app.get('io');
  io.to(req.user.id).emit('notification:deleted', {
    id: notification._id,
    message: 'Notification deleted'
  });

  res.status(200).json({ success: true, data: {} });
});