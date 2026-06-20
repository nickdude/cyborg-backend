const crypto = require("crypto");
const Cart = require("../models/Cart");
const Address = require("../models/Address");
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const OrderStatusHistory = require("../models/OrderStatusHistory");
const { serializeCart, getOrCreateCart } = require("./cartController");
const { getPaymentGateway } = require("../services/payments");
const { notify, EVENTS } = require("../services/notificationService");

function generateOrderNumber() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate()
  ).padStart(2, "0")}`;
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `ORD-${ymd}-${rand}`;
}

// POST /api/checkout   { addressId, discount? }
const createCheckout = async (req, res, next) => {
  try {
    const { addressId } = req.body;
    if (!addressId) return res.sendError("addressId is required", 400);

    // 1. Validate address ownership
    const address = await Address.findOne({
      _id: addressId,
      userId: req.user.id,
      isDeleted: false,
    });
    if (!address) return res.sendError("Delivery address not found", 404);

    // 2. Resolve cart with live pricing
    const cart = await getOrCreateCart(req.user.id);
    const serialized = await serializeCart(cart);
    if (!serialized.items.length) return res.sendError("Your cart is empty", 400);

    // 3. Build immutable order snapshot
    const orderItems = serialized.items.map((it) => ({
      productId: it.productId,
      productName: it.name,
      image: it.image,
      type: it.type,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      totalPrice: it.totalPrice,
    }));

    const order = await Order.create({
      orderNumber: generateOrderNumber(),
      userId: req.user.id,
      addressId: address._id,
      shippingAddress: {
        fullName: address.fullName,
        phoneNumber: address.phoneNumber,
        addressLine1: address.addressLine1,
        addressLine2: address.addressLine2,
        landmark: address.landmark,
        city: address.city,
        state: address.state,
        country: address.country,
        pincode: address.pincode,
      },
      items: orderItems,
      subtotal: serialized.subtotal,
      discount: serialized.discount,
      tax: serialized.tax,
      shipping: serialized.shipping,
      totalAmount: serialized.total,
      currency: serialized.currency,
      paymentStatus: "pending",
      orderStatus: "Pending",
    });

    const paymentMethod = req.body.paymentMethod === "cod" ? "cod" : "online";

    // ===== Cash on Delivery: place the order immediately, collect on delivery =====
    if (paymentMethod === "cod") {
      const payment = await Payment.create({
        userId: req.user.id,
        orderId: order._id,
        amount: order.totalAmount,
        currency: order.currency,
        gateway: "cod",
        paymentMethod: "cod",
        status: "pending", // collected at delivery
        attempts: 0,
      });

      order.paymentId = payment._id;
      order.orderStatus = "Confirmed";
      await order.save();

      await OrderStatusHistory.create({
        orderId: order._id,
        status: "Pending",
        note: "Order created (Cash on Delivery)",
      });
      await OrderStatusHistory.create({
        orderId: order._id,
        status: "Confirmed",
        note: "Order confirmed — payment due on delivery",
      });

      await Cart.updateOne({ userId: req.user.id }, { $set: { items: [], discount: 0 } });

      await notify(req.user.id, EVENTS.ORDER_PLACED, {
        orderId: order._id,
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
      });
      await notify(req.user.id, EVENTS.ORDER_CONFIRMED, {
        orderId: order._id,
        orderNumber: order.orderNumber,
      });

      return res.sendSuccess(
        { order, payment: { paymentId: payment._id, method: "cod" } },
        "Order placed with Cash on Delivery",
        201
      );
    }

    // ===== Online: create gateway order + pending Payment =====
    await OrderStatusHistory.create({
      orderId: order._id,
      status: "Pending",
      note: "Order created, awaiting payment",
    });

    const gateway = getPaymentGateway();
    const gatewayOrder = await gateway.createOrder({
      amount: order.totalAmount,
      currency: order.currency,
      receipt: order.orderNumber,
      notes: { orderId: String(order._id), userId: String(req.user.id) },
    });

    const payment = await Payment.create({
      userId: req.user.id,
      orderId: order._id,
      amount: order.totalAmount,
      currency: order.currency,
      gateway: gateway.name,
      gatewayOrderId: gatewayOrder.gatewayOrderId,
      status: "pending",
      attempts: 1,
    });

    order.paymentId = payment._id;
    await order.save();

    await notify(req.user.id, EVENTS.ORDER_PLACED, {
      orderId: order._id,
      orderNumber: order.orderNumber,
      totalAmount: order.totalAmount,
    });

    res.sendSuccess(
      {
        order,
        payment: {
          paymentId: payment._id,
          gateway: gateway.name,
          gatewayOrderId: gatewayOrder.gatewayOrderId,
          amount: order.totalAmount,
          currency: order.currency,
          key_id: gateway.publishableKey,
          method: "online",
        },
      },
      "Checkout created. Proceed to payment.",
      201
    );
  } catch (e) {
    next(e);
  }
};

// POST /api/checkout/verify   { orderId, transactionId, signature }
const verifyPayment = async (req, res, next) => {
  try {
    const { orderId, transactionId, signature } = req.body;
    const order = await Order.findOne({ _id: orderId, userId: req.user.id });
    if (!order) return res.sendError("Order not found", 404);
    const payment = await Payment.findById(order.paymentId);
    if (!payment) return res.sendError("Payment record not found", 404);

    const gateway = getPaymentGateway(payment.gateway);
    const valid = gateway.verifySignature({
      gatewayOrderId: payment.gatewayOrderId,
      transactionId,
      signature,
    });

    if (!valid) {
      payment.status = "failed";
      payment.failureReason = "Signature verification failed";
      await payment.save();
      order.paymentStatus = "failed";
      await order.save();
      await notify(req.user.id, EVENTS.PAYMENT_FAILED, {
        orderId: order._id,
        orderNumber: order.orderNumber,
      });
      return res.sendError("Payment verification failed", 400);
    }

    // Confirm capture with the gateway (defense against forged client calls).
    let method = "";
    try {
      const gp = await gateway.fetchPayment(transactionId);
      if (gp && gp.status && !["captured", "authorized"].includes(gp.status)) {
        payment.status = "failed";
        payment.failureReason = `Gateway status: ${gp.status}`;
        await payment.save();
        order.paymentStatus = "failed";
        await order.save();
        await notify(req.user.id, EVENTS.PAYMENT_FAILED, { orderId: order._id });
        return res.sendError("Payment not captured", 400);
      }
      method = gp?.method || "";
    } catch (_) {
      /* fetch is best-effort; signature already verified */
    }

    payment.status = "success";
    payment.transactionId = transactionId;
    payment.signature = signature;
    payment.paymentMethod = method;
    payment.paidAt = new Date();
    await payment.save();

    order.paymentStatus = "success";
    order.orderStatus = "Confirmed";
    await order.save();
    await OrderStatusHistory.create({
      orderId: order._id,
      status: "Confirmed",
      note: "Payment successful",
    });

    // Empty the cart now that the purchase is complete.
    await Cart.updateOne({ userId: req.user.id }, { $set: { items: [], discount: 0 } });

    await notify(req.user.id, EVENTS.PAYMENT_SUCCESS, {
      orderId: order._id,
      orderNumber: order.orderNumber,
    });
    await notify(req.user.id, EVENTS.ORDER_CONFIRMED, {
      orderId: order._id,
      orderNumber: order.orderNumber,
    });

    res.sendSuccess({ order, payment }, "Payment verified and order confirmed");
  } catch (e) {
    next(e);
  }
};

// POST /api/checkout/:orderId/retry  (re-attempt payment for a pending/failed order)
const retryPayment = async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.orderId, userId: req.user.id });
    if (!order) return res.sendError("Order not found", 404);
    if (order.paymentStatus === "success") {
      return res.sendError("Order is already paid", 400);
    }

    const payment = await Payment.findById(order.paymentId);
    if (!payment) return res.sendError("Payment record not found", 404);

    const gateway = getPaymentGateway(payment.gateway);
    const gatewayOrder = await gateway.createOrder({
      amount: order.totalAmount,
      currency: order.currency,
      receipt: `${order.orderNumber}-R${payment.attempts + 1}`,
      notes: { orderId: String(order._id), userId: String(req.user.id), retry: true },
    });

    payment.gatewayOrderId = gatewayOrder.gatewayOrderId;
    payment.status = "pending";
    payment.attempts += 1;
    payment.failureReason = "";
    await payment.save();
    order.paymentStatus = "pending";
    await order.save();

    res.sendSuccess(
      {
        order,
        payment: {
          paymentId: payment._id,
          gateway: gateway.name,
          gatewayOrderId: gatewayOrder.gatewayOrderId,
          amount: order.totalAmount,
          currency: order.currency,
          key_id: gateway.publishableKey,
        },
      },
      "Retry payment initiated"
    );
  } catch (e) {
    next(e);
  }
};

module.exports = { createCheckout, verifyPayment, retryPayment };
