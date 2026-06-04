/**
 * Order lifecycle state machine.
 * Centralizes the allowed statuses and legal transitions so the order flow is
 * consistent and auditable across controllers and (future) admin tooling.
 */
const ORDER_STATUSES = [
  "Pending",
  "Confirmed",
  "Processing",
  "Packed",
  "Shipped",
  "Out For Delivery",
  "Delivered",
  "Cancelled",
  "Returned",
  "Refunded",
];

const PAYMENT_STATUSES = ["pending", "success", "failed", "refunded"];

// Allowed forward transitions. Cancellation/return/refund are handled via
// explicit rules below rather than the happy-path map.
const TRANSITIONS = {
  Pending: ["Confirmed", "Cancelled"],
  Confirmed: ["Processing", "Cancelled"],
  Processing: ["Packed", "Cancelled"],
  Packed: ["Shipped", "Cancelled"],
  Shipped: ["Out For Delivery", "Returned"],
  "Out For Delivery": ["Delivered", "Returned"],
  Delivered: ["Returned"],
  Cancelled: ["Refunded"],
  Returned: ["Refunded"],
  Refunded: [],
};

// Statuses a customer is allowed to cancel from.
const USER_CANCELLABLE = ["Pending", "Confirmed", "Processing"];

const canTransition = (from, to) =>
  Array.isArray(TRANSITIONS[from]) && TRANSITIONS[from].includes(to);

module.exports = {
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  TRANSITIONS,
  USER_CANCELLABLE,
  canTransition,
};
