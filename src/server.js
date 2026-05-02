require("dotenv").config();
const crypto = require("crypto");
const app = require("./app");
const connectDB = require("./config/db");
const seedQuestionnaire = require("../scripts/seedQuestionnaire");
const { buildDatabaseSchema } = require("./utils/schemaBuilder");

/**
 * Backfill referral codes for existing doctors who don't have one
 */
const backfillDoctorReferralCodes = async () => {
  const User = require("./models/User");
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const doctors = await User.find({ userType: "doctor", referralCode: { $exists: false } });
  const doctorsNull = await User.find({ userType: "doctor", referralCode: null });
  const all = [...doctors, ...doctorsNull.filter((d) => !doctors.find((x) => x._id.equals(d._id)))];

  if (all.length === 0) return;

  for (const doc of all) {
    let code;
    let exists = true;
    while (exists) {
      const random = crypto.randomBytes(4).toString("hex").slice(0, 6);
      code = "DR-" + Array.from(random).map((c) => chars[parseInt(c, 16) % chars.length]).join("");
      exists = await User.findOne({ referralCode: code });
    }
    doc.referralCode = code;
    await doc.save();
    console.log(`[Backfill] Doctor ${doc.email || doc.phone} → referralCode: ${code}`);
  }
  console.log(`[Backfill] Assigned referral codes to ${all.length} doctor(s)`);
};

/**
 * Backfill whereYouHeardAboutUs from a user's ReferralSource doc for anyone
 * whose field was wiped by the old onboarding controller bug. Idempotent —
 * only touches docs where whereYouHeardAboutUs is falsy but a ReferralSource
 * exists. Re-uses the same derivation logic as saveReferralSource.
 */
const backfillWhereYouHeardAboutUs = async () => {
  const User = require("./models/User");
  const ReferralSource = require("./models/ReferralSource");

  const affected = await User.find({
    $or: [
      { whereYouHeardAboutUs: { $exists: false } },
      { whereYouHeardAboutUs: null },
      { whereYouHeardAboutUs: "" },
    ],
  }).select("_id");

  if (affected.length === 0) return;

  let fixed = 0;
  for (const u of affected) {
    const referral = await ReferralSource.findOne({ userId: u._id });
    if (!referral) continue;

    const { socialMediaOrAd, wordOfMouth, podcast, creator, webSearch, email } =
      referral;
    let value = "Other";
    if (socialMediaOrAd?.platforms?.length > 0 || socialMediaOrAd?.otherText) {
      value = "Social Media";
    } else if (wordOfMouth?.sources?.length > 0 || wordOfMouth?.otherText) {
      value = "Friend Recommendation";
    } else if (webSearch?.engines?.length > 0 || webSearch?.otherText) {
      value = "Search Engine";
    } else if (
      podcast?.note ||
      creator?.note ||
      email?.sources?.length > 0 ||
      email?.otherText
    ) {
      value = "Advertisement";
    }
    await User.updateOne(
      { _id: u._id },
      { $set: { whereYouHeardAboutUs: value } }
    );
    fixed++;
  }
  if (fixed > 0) {
    console.log(
      `[Backfill] whereYouHeardAboutUs rehydrated for ${fixed} user(s) from ReferralSource`
    );
  }
};

/**
 * Backfill latestReportReady=true for users who already have blood reports
 * but predate the flag. Idempotent — only touches docs where the flag is
 * currently falsy and the user has ≥ 1 entry in bloodReports.
 */
const backfillLatestReportReady = async () => {
  const User = require("./models/User");
  const result = await User.updateMany(
    {
      bloodReports: { $exists: true, $not: { $size: 0 } },
      $or: [
        { latestReportReady: { $exists: false } },
        { latestReportReady: false },
        { latestReportReady: null },
      ],
    },
    { $set: { latestReportReady: true } }
  );
  if (result.modifiedCount > 0) {
    console.log(
      `[Backfill] latestReportReady=true for ${result.modifiedCount} existing user(s) with reports`
    );
  }
};

// Validate required environment variables
const REQUIRED_ENV = ["MONGO_URI", "JWT_SECRET"];
const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`[Startup] Missing required env vars: ${missing.join(", ")}`);
  process.exit(1);
}

// Warn about optional but important env vars
if (!process.env.ANTHROPIC_API_KEY) {
  console.warn("[Startup] ANTHROPIC_API_KEY not set — AI chat features will fail");
}
if (!process.env.VECTOR_DB_URI) {
  console.warn("[Startup] VECTOR_DB_URI not set — memory/chat summary features will fail");
}
if (!process.env.PERPLEXITY_API_KEY) {
  console.warn("[Startup] PERPLEXITY_API_KEY not set — web search tool will fail");
}

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  seedQuestionnaire();
  backfillDoctorReferralCodes().catch((err) =>
    console.error("[Backfill] Failed:", err.message)
  );
  backfillLatestReportReady().catch((err) =>
    console.error("[Backfill latestReportReady] Failed:", err.message)
  );
  backfillWhereYouHeardAboutUs().catch((err) =>
    console.error("[Backfill whereYouHeardAboutUs] Failed:", err.message)
  );
  buildDatabaseSchema().catch((err) =>
    console.error("[SchemaBuilder] Init failed:", err.message)
  );

  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  const shutdown = (signal) => {
    console.log(`\n[${signal}] Shutting down gracefully...`);
    server.close(() => {
      console.log("[Shutdown] HTTP server closed");
      const mongoose = require("mongoose");
      mongoose.connection.close(false).then(() => {
        console.log("[Shutdown] MongoDB disconnected");
        process.exit(0);
      });
    });
    setTimeout(() => {
      console.error("[Shutdown] Forced exit after 30s timeout");
      process.exit(1);
    }, 30000);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
});

process.on("unhandledRejection", (err) => {
  console.error("[Fatal] Unhandled rejection:", err);
});

process.on("uncaughtException", (err) => {
  console.error("[Fatal] Uncaught exception:", err);
  process.exit(1);
});
