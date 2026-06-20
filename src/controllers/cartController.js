const Cart = require("../models/Cart");
const Product = require("../models/Product");
const { computeTotals, rupeesToPaise } = require("../utils/pricing");

const MAX_QTY = 99;

async function getOrCreateCart(userId) {
  let cart = await Cart.findOne({ userId });
  if (!cart) cart = await Cart.create({ userId, items: [] });
  return cart;
}

/**
 * Build the API cart payload: resolves each line against the live Product,
 * drops items whose product is gone/inactive, and computes the pricing
 * breakdown. Prices are converted from the catalog (rupees) to paise.
 */
async function serializeCart(cart) {
  const productIds = cart.items.map((i) => i.productId);
  const products = await Product.find({ _id: { $in: productIds }, isActive: true });
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const items = [];
  for (const line of cart.items) {
    const product = byId.get(String(line.productId));
    if (!product) continue; // skip removed/inactive products
    const unitPrice = rupeesToPaise(product.price);
    items.push({
      productId: product._id,
      name: product.name,
      brand: product.brand,
      image: product.image,
      type: product.type,
      quantity: line.quantity,
      unitPrice,
      totalPrice: unitPrice * line.quantity,
    });
  }

  const totals = computeTotals(items, { discount: cart.discount || 0 });

  return {
    id: cart._id,
    items,
    itemCount: items.reduce((n, i) => n + i.quantity, 0),
    ...totals,
  };
}

// GET /api/cart
const getCart = async (req, res, next) => {
  try {
    const cart = await getOrCreateCart(req.user.id);
    res.sendSuccess(await serializeCart(cart), "Cart retrieved successfully");
  } catch (e) {
    next(e);
  }
};

// POST /api/cart/items   { productId, quantity }
const addItem = async (req, res, next) => {
  try {
    const { productId, quantity = 1 } = req.body;
    if (!productId) return res.sendError("productId is required", 400);
    const qty = Math.min(MAX_QTY, Math.max(1, parseInt(quantity, 10) || 1));

    const product = await Product.findOne({ _id: productId, isActive: true });
    if (!product) return res.sendError("Product not found or unavailable", 404);

    const cart = await getOrCreateCart(req.user.id);
    const existing = cart.items.find((i) => String(i.productId) === String(productId));
    if (existing) {
      existing.quantity = Math.min(MAX_QTY, existing.quantity + qty);
    } else {
      cart.items.push({ productId, quantity: qty });
    }
    await cart.save();

    res.sendSuccess(await serializeCart(cart), "Added to cart", 201);
  } catch (e) {
    next(e);
  }
};

// PUT /api/cart/items/:productId   { quantity }
const updateItem = async (req, res, next) => {
  try {
    const { quantity } = req.body;
    const qty = parseInt(quantity, 10);
    if (Number.isNaN(qty)) return res.sendError("quantity is required", 400);

    const cart = await getOrCreateCart(req.user.id);
    const line = cart.items.find((i) => String(i.productId) === String(req.params.productId));
    if (!line) return res.sendError("Item not in cart", 404);

    if (qty <= 0) {
      cart.items = cart.items.filter(
        (i) => String(i.productId) !== String(req.params.productId)
      );
    } else {
      line.quantity = Math.min(MAX_QTY, qty);
    }
    await cart.save();

    res.sendSuccess(await serializeCart(cart), "Cart updated");
  } catch (e) {
    next(e);
  }
};

// DELETE /api/cart/items/:productId
const removeItem = async (req, res, next) => {
  try {
    const cart = await getOrCreateCart(req.user.id);
    cart.items = cart.items.filter(
      (i) => String(i.productId) !== String(req.params.productId)
    );
    await cart.save();
    res.sendSuccess(await serializeCart(cart), "Item removed from cart");
  } catch (e) {
    next(e);
  }
};

// DELETE /api/cart  (empty the cart)
const clearCart = async (req, res, next) => {
  try {
    const cart = await getOrCreateCart(req.user.id);
    cart.items = [];
    cart.discount = 0;
    await cart.save();
    res.sendSuccess(await serializeCart(cart), "Cart cleared");
  } catch (e) {
    next(e);
  }
};

module.exports = { getCart, addItem, updateItem, removeItem, clearCart, serializeCart, getOrCreateCart };
