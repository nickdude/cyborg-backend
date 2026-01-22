const Notification = require("../models/Notification");

// GET /api/notifications
const listNotifications = async (req, res, next) => {
  try {
    const userId = req.user.id || req.user._id;
    const notifications = await Notification.find({ userId })
      .sort({ createdAt: -1 })
      .limit(50);
    res.sendSuccess(notifications);
  } catch (error) {
    next(error);
  }
};

// PATCH /api/notifications/:id/read
const markRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user._id;
    const notification = await Notification.findOneAndUpdate(
      { _id: id, userId },
      { $set: { read: true } },
      { new: true }
    );

    if (!notification) {
      return res.sendError("Notification not found", 404);
    }

    res.sendSuccess(notification, "Notification marked as read");
  } catch (error) {
    next(error);
  }
};

module.exports = { listNotifications, markRead };
