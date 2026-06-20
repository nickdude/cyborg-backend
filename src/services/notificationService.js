const Notification = require("../models/Notification");

/**
 * Centralized notification creation. Persists an in-app Notification and leaves
 * a clear hook for email/push delivery (the `email` flag is where an email
 * template + sendEmail call will plug in once templates are added).
 *
 * Event types map 1:1 to the lifecycle events in the spec.
 */
const EVENTS = {
  ORDER_PLACED: "order_placed",
  PAYMENT_SUCCESS: "payment_successful",
  PAYMENT_FAILED: "payment_failed",
  ORDER_CONFIRMED: "order_confirmed",
  ORDER_PROCESSING: "order_processing",
  ORDER_PACKED: "order_packed",
  ORDER_SHIPPED: "order_shipped",
  ORDER_OUT_FOR_DELIVERY: "order_out_for_delivery",
  ORDER_DELIVERED: "order_delivered",
  ORDER_CANCELLED: "order_cancelled",
  ORDER_RETURNED: "order_returned",
  ORDER_REFUNDED: "order_refunded",
  SUBSCRIPTION_PURCHASED: "subscription_purchased",
  SUBSCRIPTION_EXPIRY_REMINDER: "subscription_expiry_reminder",
};

// Maps an order status to its notification event (for lifecycle transitions).
const ORDER_STATUS_EVENT = {
  Confirmed: EVENTS.ORDER_CONFIRMED,
  Processing: EVENTS.ORDER_PROCESSING,
  Packed: EVENTS.ORDER_PACKED,
  Shipped: EVENTS.ORDER_SHIPPED,
  "Out For Delivery": EVENTS.ORDER_OUT_FOR_DELIVERY,
  Delivered: EVENTS.ORDER_DELIVERED,
  Cancelled: EVENTS.ORDER_CANCELLED,
  Returned: EVENTS.ORDER_RETURNED,
  Refunded: EVENTS.ORDER_REFUNDED,
};

async function notify(userId, type, metadata = {}) {
  try {
    await Notification.create({ userId, type, metadata });
    // Email hook: when templates exist, send here based on `type`.
    // if (shouldEmail(type)) await sendEmail(...);
  } catch (err) {
    // Notifications must never break the main flow.
    console.error("[notificationService] failed to notify:", err.message);
  }
}

module.exports = { notify, EVENTS, ORDER_STATUS_EVENT };
