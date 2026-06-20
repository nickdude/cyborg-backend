const Activity = require("../models/Activity");
const ACTIVITY_CATALOG = require("../data/activityCatalog");

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
 * Returns the static activity catalog, optionally filtered by name.
 */
const getCatalog = async (req, res, next) => {
  try {
    const q = (req.query.q || "").trim().toLowerCase();
    const results = q
      ? ACTIVITY_CATALOG.filter((a) => a.name.toLowerCase().includes(q))
      : ACTIVITY_CATALOG;
    return res.sendSuccess(results, "Activity catalog retrieved");
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
