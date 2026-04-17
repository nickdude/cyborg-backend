#!/usr/bin/env node
// This script is a no-op after the R2 migration.
//
// Meal images now live in Cloudflare R2 under meals/pending/<userId>/...
// and meals/committed/<userId>/... . Configure an R2 bucket lifecycle rule
// targeting the `meals/pending/` prefix with an "expire objects N days
// after creation" policy — the bucket will sweep orphans for you.
//
// Kept as a stub so existing cron jobs pointing at this path don't 500.

console.log(
  "gcMealImages: no-op. Configure an R2 lifecycle rule on the " +
    "meals/pending/ prefix instead (expire objects after N days)."
);
process.exit(0);
