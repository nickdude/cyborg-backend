const RazorpayGateway = require("./RazorpayGateway");

/**
 * Payment gateway factory. Returns the configured gateway adapter so the rest
 * of the app never talks to a specific provider directly. Add a StripeGateway
 * adapter and a case here to support Stripe with no controller changes.
 *
 * All adapters implement: createOrder, verifySignature, verifyWebhook,
 * fetchPayment, refund, and expose `name` + `publishableKey`.
 */
let cached = null;

function getPaymentGateway(name = process.env.PAYMENT_GATEWAY || "razorpay") {
  if (cached && cached.name === name) return cached;

  switch (name) {
    case "razorpay":
      cached = new RazorpayGateway();
      return cached;
    // case "stripe":
    //   cached = new StripeGateway();
    //   return cached;
    default:
      throw new Error(`Unsupported payment gateway: ${name}`);
  }
}

module.exports = { getPaymentGateway };
