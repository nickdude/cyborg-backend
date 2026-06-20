const Order = require("../models/Order");
const Subscription = require("../models/Subscription");

// Derive a display status for a subscription from its stored status + expiry.
function planStatus(sub) {
  if (sub.status === "cancelled") return "Cancelled";
  if (sub.status === "pending") return "Pending";
  if (sub.status === "active") {
    if (sub.expiryDate && new Date(sub.expiryDate) < new Date()) return "Expired";
    return "Active";
  }
  if (sub.status === "expired") return "Expired";
  return sub.status;
}

// GET /api/purchase-history  → unified { plans, orders }
const getPurchaseHistory = async (req, res, next) => {
  try {
    const [subs, orders] = await Promise.all([
      Subscription.find({ userId: req.user.id }).sort({ createdAt: -1 }),
      Order.find({ userId: req.user.id }).sort({ createdAt: -1 }),
    ]);

    const plans = subs.map((s) => ({
      id: s._id,
      planName: s.planName,
      planType: s.planType,
      amount: s.amount,
      currency: s.currency,
      status: planStatus(s),
      purchaseDate: s.purchaseDate || s.createdAt,
      startDate: s.purchaseDate || s.createdAt,
      endDate: s.expiryDate || null,
    }));

    const productOrders = orders.map((o) => ({
      id: o._id,
      orderNumber: o.orderNumber,
      items: o.items.map((i) => ({
        productName: i.productName,
        quantity: i.quantity,
        totalPrice: i.totalPrice,
      })),
      itemCount: o.items.reduce((n, i) => n + i.quantity, 0),
      totalAmount: o.totalAmount,
      currency: o.currency,
      orderStatus: o.orderStatus,
      paymentStatus: o.paymentStatus,
      trackingStatus: o.orderStatus,
      createdAt: o.createdAt,
    }));

    res.sendSuccess(
      { plans, orders: productOrders },
      "Purchase history retrieved successfully"
    );
  } catch (e) {
    next(e);
  }
};

module.exports = { getPurchaseHistory };
