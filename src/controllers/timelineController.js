const Meal = require("../models/Meal");
const Activity = require("../models/Activity");

// ── Helpers ───────────────────────────────────────────────────────

function utcDayBounds(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  if (isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

// ── Handler ───────────────────────────────────────────────────────

/**
 * GET /:userId/timeline?date=YYYY-MM-DD
 * Merges meals + activities for the given day into a single chronological feed.
 */
const getTimeline = async (req, res, next) => {
  try {
    const dateStr = req.query.date;
    const bounds = utcDayBounds(dateStr);
    if (!bounds) {
      return res.sendError("date must be YYYY-MM-DD", 400);
    }

    // Parallel queries
    const [meals, activities] = await Promise.all([
      Meal.find({
        userId: req.user.id,
        consumedAt: { $gte: bounds.start, $lt: bounds.end },
      }).lean(),
      Activity.find({
        userId: req.user.id,
        startTime: { $gte: bounds.start, $lt: bounds.end },
      }).lean(),
    ]);

    // Map to unified entry shape
    const mealEntries = meals.map((m) => ({
      type: "meal",
      id: m._id,
      time: m.consumedAt,
      title: m.title,
      data: {
        totals: m.totals,
        items: m.items,
        imageKeys: m.imageKeys,
      },
    }));

    const activityEntries = activities.map((a) => ({
      type: "activity",
      id: a._id,
      time: a.startTime,
      title: a.name,
      data: {
        category: a.category,
        durationMinutes: a.durationMinutes,
        endTime: a.endTime,
        caloriesBurned: a.caloriesBurned,
      },
    }));

    // Merge and sort by time descending
    const entries = [...mealEntries, ...activityEntries].sort(
      (a, b) => new Date(b.time) - new Date(a.time)
    );

    // Compute summary
    const totalCaloriesConsumed = meals.reduce(
      (sum, m) => sum + (m.totals?.calories || 0),
      0
    );
    const totalCaloriesBurned = activities.reduce(
      (sum, a) => sum + (a.caloriesBurned || 0),
      0
    );

    return res.sendSuccess(
      {
        date: dateStr,
        entries,
        summary: {
          mealCount: meals.length,
          activityCount: activities.length,
          totalCaloriesConsumed,
          totalCaloriesBurned,
        },
      },
      "Timeline retrieved"
    );
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTimeline,
};
