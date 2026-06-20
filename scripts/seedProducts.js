/**
 * Seed script: populates the Marketplace with the initial Supplements only.
 *
 * Per business requirements:
 *  - Only Supplements are seeded.
 *  - Tests and Prescriptions are NOT seeded (they stay empty until an admin
 *    adds them via the API).
 *
 * Usage: node scripts/seedProducts.js
 */
require("dotenv").config();
const mongoose = require("mongoose");

const SUPPLEMENTS = [
  {
    name: "AMINO 9",
    brand: "Lean mass insurance.",
    category: "Vitamins",
    type: "supplement",
    price: 28.0,
    originalPrice: 35,
    image: "/assets/preview/product-1.png",
    onSale: true,
    section: "recommended",
  },
  {
    name: "MITO HEART",
    brand: "Cellular cardiovascular vitality.",
    category: "Omega",
    type: "supplement",
    price: 34.4,
    originalPrice: 43,
    image: "/assets/preview/product-2.png",
    onSale: true,
    section: "recommended",
  },
  {
    name: "OZEMPIC",
    brand: "Triple-organ protection in T2D.",
    category: "Energy",
    type: "supplement",
    price: 43.2,
    originalPrice: 54,
    image: "/assets/preview/product-3.png",
    onSale: true,
    section: "brain",
  },
  {
    name: "MOUNJARO",
    brand: "The deepest metabolic reset.",
    category: "Minerals",
    type: "supplement",
    price: 35.48,
    originalPrice: 44.4,
    image: "/assets/preview/product-4.png",
    onSale: true,
    section: "brain",
  },
];

async function seed() {
  console.log("[Seed] Connecting to MongoDB...");
  await mongoose.connect(process.env.MONGO_URI);
  console.log("[Seed] Connected to:", mongoose.connection.name);

  const Product = require("../src/models/Product");

  // Replace existing supplements only — leaves any admin-added tests/prescriptions intact.
  const removed = await Product.deleteMany({ type: "supplement" });
  console.log(`[Seed] Removed ${removed.deletedCount} existing supplement(s).`);

  const inserted = await Product.insertMany(
    SUPPLEMENTS.map((p) => ({ ...p, isActive: true }))
  );
  console.log(`[Seed] Inserted ${inserted.length} supplement(s).`);

  const counts = {
    supplement: await Product.countDocuments({ type: "supplement" }),
    test: await Product.countDocuments({ type: "test" }),
    prescription: await Product.countDocuments({ type: "prescription" }),
  };
  console.log("[Seed] Product counts:", counts);
  console.log("[Seed] Done. (Tests & Prescriptions intentionally left empty.)");

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("[Seed] Failed:", err);
  process.exit(1);
});
