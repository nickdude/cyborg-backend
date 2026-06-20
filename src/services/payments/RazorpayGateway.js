const Razorpay = require("razorpay");
const crypto = require("crypto");

/**
 * Razorpay implementation of the PaymentGateway interface.
 * All amounts are in paise.
 */
class RazorpayGateway {
  constructor() {
    this.name = "razorpay";
    this.keyId = process.env.RAZORPAY_KEY_ID;
    this.keySecret = process.env.RAZORPAY_KEY_SECRET;
    this.client = new Razorpay({ key_id: this.keyId, key_secret: this.keySecret });
  }

  get publishableKey() {
    return this.keyId;
  }

  // Create a gateway order. Returns { gatewayOrderId, amount, currency }.
  async createOrder({ amount, currency = "INR", receipt, notes = {} }) {
    const order = await this.client.orders.create({ amount, currency, receipt, notes });
    return { gatewayOrderId: order.id, amount: order.amount, currency: order.currency };
  }

  // Verify the HMAC signature returned by Razorpay checkout.
  verifySignature({ gatewayOrderId, transactionId, signature }) {
    const expected = crypto
      .createHmac("sha256", this.keySecret)
      .update(`${gatewayOrderId}|${transactionId}`)
      .digest("hex");
    return expected === signature;
  }

  // Verify a webhook payload signature.
  verifyWebhook(rawBody, signature) {
    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET || "")
      .update(rawBody)
      .digest("hex");
    return expected === signature;
  }

  async fetchPayment(transactionId) {
    return this.client.payments.fetch(transactionId);
  }

  async refund(transactionId, amount) {
    return this.client.payments.refund(transactionId, amount ? { amount } : {});
  }
}

module.exports = RazorpayGateway;
