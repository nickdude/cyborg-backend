const Activity = require("../models/Activity");
const ACTIVITY_CATALOG = require("../data/activityCatalog");
const {
  normalize,
  tokenize,
  bestFuzzyScore,
  tokenSimilarity,
} = require("../utils/fuzzy");

const FUZZY_THRESHOLD = 0.72;

// ── Helpers ───────────────────────────────────────────────────────

function utcDayBounds(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  if (isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

// ── Handlers ──────────────────────────────────────────────────────

/**
 * GET /:userId/activities/catalog?q=search
 * Returns the static activity catalog, optionally filtered by name/alias with
 * a typo-tolerant fuzzy fallback ("badmington" still finds Badminton).
 */
const getCatalog = async (req, res, next) => {
  try {
    const raw = String(req.query.q || "").trim();
    if (raw.length > 100) {
      // The fuzzy scan is O(|q| × catalog tokens) of synchronous CPU — an
      // unbounded q would let one request stall the event loop for seconds.
      return res.sendError("q must be 100 characters or fewer.", 400);
    }
    if (!raw) {
      // The full catalog only changes on deploy — let clients reuse it.
      res.set("Cache-Control", "private, max-age=86400");
      return res.sendSuccess(ACTIVITY_CATALOG, "Activity catalog retrieved");
    }
    const q = normalize(raw);
    // A query that normalizes to nothing (punctuation, non-Latin script)
    // matches nothing — returning the full catalog here would read as a hit.
    if (!q) {
      return res.sendSuccess([], "Activity catalog retrieved");
    }
    const qTokens = q.split(" ").filter(Boolean);
    const scored = [];
    for (const a of ACTIVITY_CATALOG) {
      const names = [a.name, ...(a.aliases || [])];
      // Exact > prefix > substring > fuzzy, mirroring the frontend ranking.
      let score = 0;
      for (const n of names) {
        const nn = normalize(n);
        if (nn === q) {
          score = 3;
          break;
        }
        if (nn.startsWith(q)) score = Math.max(score, 2.5);
        else if (nn.includes(q)) score = Math.max(score, 2);
      }
      if (score === 0) {
        const fuzzy = bestFuzzyScore(qTokens, names.map(tokenize));
        if (fuzzy >= FUZZY_THRESHOLD) score = fuzzy;
      }
      if (score > 0) {
        // Tie-break: how well the first typed word matches the name's first
        // word, so "badmington" ranks Badminton (Casual) over Ball Badminton.
        const firstTokSim = tokenSimilarity(
          qTokens[0] || "",
          tokenize(a.name)[0] || ""
        );
        scored.push({ a, score, firstTokSim });
      }
    }
    scored.sort(
      (x, y) =>
        y.score - x.score ||
        y.firstTokSim - x.firstTokSim ||
        x.a.name.length - y.a.name.length
    );
    return res.sendSuccess(
      scored.map((s) => s.a),
      "Activity catalog retrieved"
    );
  } catch (error) {
    next(error);
  }
};

/**
 * POST /:userId/activities
 * Body: { name, category?, startTime, endTime, durationMinutes?, caloriesBurned?, notes?, source? }
 */
const createActivity = async (req, res, next) => {
  try {
    const body = req.body || {};
    const { name, category, caloriesBurned, notes, source } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.sendError("name is required.", 400);
    }
    if (!body.startTime) {
      return res.sendError("startTime is required.", 400);
    }
    if (!body.endTime) {
      return res.sendError("endTime is required.", 400);
    }

    const startTime = new Date(body.startTime);
    const endTime = new Date(body.endTime);

    if (isNaN(startTime.getTime())) {
      return res.sendError("Invalid startTime.", 400);
    }
    if (isNaN(endTime.getTime())) {
      return res.sendError("Invalid endTime.", 400);
    }
    if (endTime <= startTime) {
      return res.sendError("endTime must be after startTime.", 400);
    }

    // Compute duration from start/end if not explicitly provided
    const durationMinutes =
      body.durationMinutes != null && Number.isFinite(Number(body.durationMinutes))
        ? Number(body.durationMinutes)
        : Math.round((endTime - startTime) / 60000);

    const activity = await Activity.create({
      userId: req.user.id,
      name: name.trim(),
      category: category || "other",
      startTime,
      endTime,
      durationMinutes,
      caloriesBurned: caloriesBurned != null ? Number(caloriesBurned) : null,
      notes: notes || null,
      source: source || "manual",
    });

    return res.sendSuccess(activity.toObject(), "Activity created", 201);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /:userId/activities?date=YYYY-MM-DD
 * Returns activities whose startTime falls within the UTC day, newest first.
 */
const listActivities = async (req, res, next) => {
  try {
    const bounds = utcDayBounds(req.query.date);
    if (!bounds) {
      return res.sendError("date must be YYYY-MM-DD", 400);
    }
    const activities = await Activity.find({
      userId: req.user.id,
      startTime: { $gte: bounds.start, $lt: bounds.end },
    })
      .sort({ startTime: -1, createdAt: -1 })
      .lean();
    return res.sendSuccess(activities, "Activities retrieved");
  } catch (error) {
    next(error);
  }
};

/**
 * GET /:userId/activities/:activityId
 */
const getActivityById = async (req, res, next) => {
  try {
    const activity = await Activity.findOne({
      _id: req.params.activityId,
      userId: req.user.id,
    }).lean();
    if (!activity) {
      return res.sendError("Activity not found.", 404);
    }
    return res.sendSuccess(activity, "Activity retrieved");
  } catch (error) {
    next(error);
  }
};

const PATCHABLE_FIELDS = new Set([
  "name",
  "category",
  "startTime",
  "endTime",
  "durationMinutes",
  "caloriesBurned",
  "notes",
]);

/**
 * PATCH /:userId/activities/:activityId
 */
const updateActivity = async (req, res, next) => {
  try {
    const body = req.body || {};
    const update = {};
    for (const key of Object.keys(body)) {
      if (!PATCHABLE_FIELDS.has(key)) continue;
      if (key === "startTime" || key === "endTime") {
        const d = new Date(body[key]);
        if (isNaN(d.getTime())) {
          return res.sendError(`Invalid ${key}.`, 400);
        }
        update[key] = d;
      } else {
        update[key] = body[key];
      }
    }
    if (Object.keys(update).length === 0) {
      return res.sendError("No patchable fields provided.", 400);
    }

    const activity = await Activity.findOneAndUpdate(
      { _id: req.params.activityId, userId: req.user.id },
      { $set: update },
      { new: true }
    );
    if (!activity) {
      return res.sendError("Activity not found.", 404);
    }
    return res.sendSuccess(activity.toObject(), "Activity updated");
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /:userId/activities/:activityId
 */
const deleteActivity = async (req, res, next) => {
  try {
    const activity = await Activity.findOneAndDelete({
      _id: req.params.activityId,
      userId: req.user.id,
    });
    if (!activity) {
      return res.sendError("Activity not found.", 404);
    }
    return res.sendSuccess({ ok: true }, "Activity deleted");
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCatalog,
  createActivity,
  listActivities,
  getActivityById,
  updateActivity,
  deleteActivity,
};
