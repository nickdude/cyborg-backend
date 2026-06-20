const Product = require("../models/Product");

const escapeRegex = (s = "") => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const ALLOWED_TYPES = ["supplement", "test", "prescription"];

// ============== LIST (public) ==============
/**
 * GET /api/products
 * Query: type, section, category, q (search), onSale, page, limit, includeInactive(admin)
 * Returns a paginated envelope: { items, total, page, limit, totalPages }
 */
const getProducts = async (req, res, next) => {
  try {
    const { type, section, category, q, onSale, page, limit, includeInactive } = req.query;

    const filter = {};
    // Public callers only ever see active products.
    if (!includeInactive) filter.isActive = true;
    if (type && ALLOWED_TYPES.includes(type)) filter.type = type;
    if (section) filter.section = section;
    if (category) filter.category = new RegExp(`^${escapeRegex(category)}$`, "i");
    if (onSale === "true") filter.onSale = true;
    if (q) {
      const rx = new RegExp(escapeRegex(q), "i");
      filter.$or = [{ name: rx }, { brand: rx }, { category: rx }, { description: rx }];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 100));
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      Product.countDocuments(filter),
    ]);

    res.sendSuccess(
      {
        items,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 0,
      },
      "Products retrieved successfully"
    );
  } catch (error) {
    next(error);
  }
};

// ============== GET ONE (public) ==============
const getProductById = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product || !product.isActive) {
      return res.sendError("Product not found", 404);
    }
    res.sendSuccess(product, "Product retrieved successfully");
  } catch (error) {
    next(error);
  }
};

// ============== CREATE (admin) ==============
const createProduct = async (req, res, next) => {
  try {
    const { name, type, price } = req.body;
    if (!name || !type || price === undefined || price === null) {
      return res.sendError("name, type and price are required", 400);
    }
    if (!ALLOWED_TYPES.includes(type)) {
      return res.sendError(`type must be one of: ${ALLOWED_TYPES.join(", ")}`, 400);
    }

    const product = await Product.create({
      name,
      brand: req.body.brand,
      description: req.body.description,
      category: req.body.category,
      type,
      price,
      originalPrice: req.body.originalPrice ?? null,
      image: req.body.image,
      onSale: !!req.body.onSale,
      section: req.body.section,
      link: req.body.link ?? null,
      isActive: req.body.isActive !== undefined ? !!req.body.isActive : true,
    });

    res.sendSuccess(product, "Product created successfully", 201);
  } catch (error) {
    next(error);
  }
};

// ============== UPDATE (admin) ==============
const updateProduct = async (req, res, next) => {
  try {
    if (req.body.type && !ALLOWED_TYPES.includes(req.body.type)) {
      return res.sendError(`type must be one of: ${ALLOWED_TYPES.join(", ")}`, 400);
    }

    const updatable = [
      "name", "brand", "description", "category", "type", "price",
      "originalPrice", "image", "onSale", "section", "link", "isActive",
    ];
    const updates = {};
    updatable.forEach((k) => {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    });

    const product = await Product.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!product) return res.sendError("Product not found", 404);

    res.sendSuccess(product, "Product updated successfully");
  } catch (error) {
    next(error);
  }
};

// ============== DELETE (admin) ==============
/**
 * Soft-delete by default (isActive=false) so historical orders keep their
 * reference. Pass ?hard=true to remove the document entirely.
 */
const deleteProduct = async (req, res, next) => {
  try {
    if (req.query.hard === "true") {
      const removed = await Product.findByIdAndDelete(req.params.id);
      if (!removed) return res.sendError("Product not found", 404);
      return res.sendSuccess(null, "Product permanently deleted");
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!product) return res.sendError("Product not found", 404);

    res.sendSuccess(product, "Product deactivated successfully");
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
};
