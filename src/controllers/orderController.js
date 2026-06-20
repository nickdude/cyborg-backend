const Order = require("../models/Order");
const OrderStatusHistory = require("../models/OrderStatusHistory");
const Payment = require("../models/Payment");
const { canTransition, USER_CANCELLABLE } = require("../utils/orderStatus");
const { notify, EVENTS, ORDER_STATUS_EVENT } = require("../services/notificationService");

const isPrivileged = (req) => ["admin", "doctor"].includes(req.user?.userType);

// GET /api/orders  (current user's orders)
const listOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.sendSuccess(orders, "Orders retrieved successfully");
  } catch (e) {
    next(e);
  }
};

// GET /api/orders/:id
const getOrder = async (req, res, next) => {
  try {
    const query = isPrivileged(req)
      ? { _id: req.params.id }
      : { _id: req.params.id, userId: req.user.id };
    const order = await Order.findOne(query);
    if (!order) return res.sendError("Order not found", 404);
    const payment = order.paymentId ? await Payment.findById(order.paymentId) : null;
    res.sendSuccess({ order, payment }, "Order retrieved successfully");
  } catch (e) {
    next(e);
  }
};

// GET /api/orders/:id/tracking
const getTracking = async (req, res, next) => {
  try {
    const query = isPrivileged(req)
      ? { _id: req.params.id }
      : { _id: req.params.id, userId: req.user.id };
    const order = await Order.findOne(query);
    if (!order) return res.sendError("Order not found", 404);

    const history = await OrderStatusHistory.find({ orderId: order._id }).sort({
      createdAt: 1,
    });

    res.sendSuccess(
      {
        orderNumber: order.orderNumber,
        currentStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        timeline: history,
      },
      "Tracking retrieved successfully"
    );
  } catch (e) {
    next(e);
  }
};

// PATCH /api/orders/:id/status  { status, note }  (privileged)
const updateStatus = async (req, res, next) => {
  try {
    const { status, note } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.sendError("Order not found", 404);

    if (!canTransition(order.orderStatus, status)) {
      return res.sendError(
        `Cannot change status from "${order.orderStatus}" to "${status}"`,
        400
      );
    }

    order.orderStatus = status;
    if (status === "Refunded") order.paymentStatus = "refunded";

    // Cash-on-Delivery payment is collected when the order is delivered.
    if (status === "Delivered" && order.paymentId) {
      const payment = await Payment.findById(order.paymentId);
      if (payment && payment.gateway === "cod" && payment.status === "pending") {
        payment.status = "success";
        payment.paidAt = new Date();
        await payment.save();
        order.paymentStatus = "success";
      }
    }
    await order.save();

    await OrderStatusHistory.create({
      orderId: order._id,
      status,
      note: note || "",
      changedBy: req.user.id,
    });

    const event = ORDER_STATUS_EVENT[status];
    if (event) await notify(order.userId, event, { orderId: order._id, orderNumber: order.orderNumber });

    res.sendSuccess(order, "Order status updated");
  } catch (e) {
    next(e);
  }
};

// POST /api/orders/:id/cancel  (user)
const cancelOrder = async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, userId: req.user.id });
    if (!order) return res.sendError("Order not found", 404);

    if (!USER_CANCELLABLE.includes(order.orderStatus)) {
      return res.sendError(`Order cannot be cancelled once it is "${order.orderStatus}"`, 400);
    }

    order.orderStatus = "Cancelled";
    await order.save();
    await OrderStatusHistory.create({
      orderId: order._id,
      status: "Cancelled",
      note: req.body?.reason || "Cancelled by customer",
      changedBy: req.user.id,
    });
    await notify(order.userId, EVENTS.ORDER_CANCELLED, {
      orderId: order._id,
      orderNumber: order.orderNumber,
    });

    res.sendSuccess(order, "Order cancelled");
  } catch (e) {
    next(e);
  }
};

module.exports = { listOrders, getOrder, getTracking, updateStatus, cancelOrder };
