const Address = require("../models/Address");

const REQUIRED = ["fullName", "phoneNumber", "addressLine1", "city", "state", "pincode"];

function validateAddress(body) {
  const missing = REQUIRED.filter((f) => !body[f] || !String(body[f]).trim());
  if (missing.length) return `Missing required fields: ${missing.join(", ")}`;
  if (!/^\d{6}$/.test(String(body.pincode).trim())) return "Pincode must be 6 digits";
  if (!/^[\d+\-\s()]{7,15}$/.test(String(body.phoneNumber).trim()))
    return "Invalid phone number";
  return null;
}

// GET /api/addresses
const listAddresses = async (req, res, next) => {
  try {
    const addresses = await Address.find({ userId: req.user.id, isDeleted: false }).sort({
      isDefault: -1,
      updatedAt: -1,
    });
    res.sendSuccess(addresses, "Addresses retrieved successfully");
  } catch (e) {
    next(e);
  }
};

// POST /api/addresses
const createAddress = async (req, res, next) => {
  try {
    const error = validateAddress(req.body);
    if (error) return res.sendError(error, 400);

    const count = await Address.countDocuments({ userId: req.user.id, isDeleted: false });
    // First address (or explicitly requested) becomes default.
    const makeDefault = count === 0 || !!req.body.isDefault;
    if (makeDefault) {
      await Address.updateMany({ userId: req.user.id }, { isDefault: false });
    }

    const address = await Address.create({
      userId: req.user.id,
      fullName: req.body.fullName,
      phoneNumber: req.body.phoneNumber,
      addressLine1: req.body.addressLine1,
      addressLine2: req.body.addressLine2 || "",
      landmark: req.body.landmark || "",
      city: req.body.city,
      state: req.body.state,
      country: req.body.country || "India",
      pincode: req.body.pincode,
      isDefault: makeDefault,
    });

    res.sendSuccess(address, "Address added successfully", 201);
  } catch (e) {
    next(e);
  }
};

// PUT /api/addresses/:id
const updateAddress = async (req, res, next) => {
  try {
    const address = await Address.findOne({
      _id: req.params.id,
      userId: req.user.id,
      isDeleted: false,
    });
    if (!address) return res.sendError("Address not found", 404);

    const merged = { ...address.toObject(), ...req.body };
    const error = validateAddress(merged);
    if (error) return res.sendError(error, 400);

    const fields = [
      "fullName", "phoneNumber", "addressLine1", "addressLine2",
      "landmark", "city", "state", "country", "pincode",
    ];
    fields.forEach((f) => {
      if (req.body[f] !== undefined) address[f] = req.body[f];
    });

    if (req.body.isDefault === true) {
      await Address.updateMany({ userId: req.user.id }, { isDefault: false });
      address.isDefault = true;
    }

    await address.save();
    res.sendSuccess(address, "Address updated successfully");
  } catch (e) {
    next(e);
  }
};

// PATCH /api/addresses/:id/default
const setDefaultAddress = async (req, res, next) => {
  try {
    const address = await Address.findOne({
      _id: req.params.id,
      userId: req.user.id,
      isDeleted: false,
    });
    if (!address) return res.sendError("Address not found", 404);

    await Address.updateMany({ userId: req.user.id }, { isDefault: false });
    address.isDefault = true;
    await address.save();
    res.sendSuccess(address, "Default address updated");
  } catch (e) {
    next(e);
  }
};

// DELETE /api/addresses/:id  (soft delete; promotes another address to default)
const deleteAddress = async (req, res, next) => {
  try {
    const address = await Address.findOne({
      _id: req.params.id,
      userId: req.user.id,
      isDeleted: false,
    });
    if (!address) return res.sendError("Address not found", 404);

    address.isDeleted = true;
    address.isDefault = false;
    await address.save();

    // If we removed the default, promote the most recent remaining address.
    const remaining = await Address.findOne({
      userId: req.user.id,
      isDeleted: false,
    }).sort({ updatedAt: -1 });
    if (remaining && !(await Address.exists({ userId: req.user.id, isDeleted: false, isDefault: true }))) {
      remaining.isDefault = true;
      await remaining.save();
    }

    res.sendSuccess(null, "Address deleted successfully");
  } catch (e) {
    next(e);
  }
};

module.exports = {
  listAddresses,
  createAddress,
  updateAddress,
  setDefaultAddress,
  deleteAddress,
};
