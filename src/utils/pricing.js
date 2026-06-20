/**
 * Centralized order pricing. All amounts are in PAISE (integers) to match the
 * existing Subscription/Razorpay convention and avoid floating-point errors.
 *
 * Defaults are zero so totals == subtotal until business rules are configured.
 * Override via env to roll out tax / shipping without code changes.
 */
const TAX_RATE = Number(process.env.ORDER_TAX_RATE || 0); // e.g. 0.18 for 18% GST
const FLAT_SHIPPING_PAISE = Number(process.env.ORDER_SHIPPING_PAISE || 0);
const FREE_SHIPPING_THRESHOLD_PAISE = Number(
  process.env.ORDER_FREE_SHIPPING_THRESHOLD_PAISE || 0
); // 0 disables the threshold (flat shipping always applies)

const rupeesToPaise = (rupees) => Math.round(Number(rupees || 0) * 100);

/**
 * @param {Array<{ unitPrice:number, quantity:number }>} items - unitPrice in paise
 * @param {{ discount?:number }} opts - discount in paise
 * @returns {{ subtotal:number, discount:number, tax:number, shipping:number, total:number, currency:string }}
 */
function computeTotals(items = [], { discount = 0 } = {}) {
  const subtotal = items.reduce(
    (sum, it) => sum + Number(it.unitPrice || 0) * Number(it.quantity || 0),
    0
  );

  const discounted = Math.max(0, subtotal - Math.max(0, discount));
  const tax = Math.round(discounted * TAX_RATE);

  let shipping = FLAT_SHIPPING_PAISE;
  if (
    FREE_SHIPPING_THRESHOLD_PAISE > 0 &&
    discounted >= FREE_SHIPPING_THRESHOLD_PAISE
  ) {
    shipping = 0;
  }
  if (subtotal === 0) shipping = 0;

  const total = discounted + tax + shipping;

  return {
    subtotal,
    discount: Math.min(discount, subtotal),
    tax,
    shipping,
    total,
    currency: "INR",
  };
}

module.exports = { computeTotals, rupeesToPaise, TAX_RATE };
