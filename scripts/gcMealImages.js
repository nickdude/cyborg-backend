#!/usr/bin/env node
// Deletes pending/ meal images that are older than the TTL AND not
// referenced by any Meal document. Safe to run repeatedly. Once we swap
// to Cloudflare R2, this script is obsolete — R2 lifecycle rules handle
// the cleanup inside the bucket itself.

require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const Meal = require("../src/models/Meal");
const mealStorage = require("../src/utils/mealStorage");

const TTL_MS = Number(process.env.MEAL_PENDING_TTL_MS) || 24 * 60 * 60 * 1000;

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  const pendingDir = path.join(mealStorage.BASE_DIR, "pending");
  if (!fs.existsSync(pendingDir)) {
    console.log(`Nothing to do — ${pendingDir} does not exist.`);
    await mongoose.disconnect();
    return;
  }

  // Read DB references so we don't delete keys that snuck into a Meal doc
  // (shouldn't happen — meals store committed keys — but defensive).
  const referenced = new Set();
  const docs = await Meal.find({}, { imageKeys: 1 }).lean();
  for (const d of docs) {
    for (const k of d.imageKeys || []) referenced.add(k);
  }

  const files = fs.readdirSync(pendingDir);
  const now = Date.now();
  let removed = 0;
  let kept = 0;

  for (const name of files) {
    const abs = path.join(pendingDir, name);
    const stat = fs.statSync(abs);
    const ageMs = now - stat.mtimeMs;
    const key = `meal-images/pending/${name}`;

    if (referenced.has(key)) {
      kept++;
      continue;
    }
    if (ageMs < TTL_MS) {
      kept++;
      continue;
    }
    fs.unlinkSync(abs);
    removed++;
    console.log(`removed ${name} (age ${Math.round(ageMs / 1000)}s)`);
  }

  console.log(`Done. removed=${removed} kept=${kept}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("gcMealImages failed:", err);
  process.exit(1);
});
