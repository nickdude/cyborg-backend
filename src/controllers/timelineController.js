const Meal = require("../models/Meal");
const Activity = require("../models/Activity");
const MealScore = require("../models/MealScore");

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

    // One score fetch for the whole day — meal entries carry their food
    // score so consumers (Zone Score overlay, cards) don't need a request
    // per meal.
    const scores = meals.length
      ? await MealScore.find(
          { userId: req.user.id, mealId: { $in: meals.map((m) => m._id) } },
          { mealId: 1, foodScore: 1, "predictedGlucosePeak.deltaMgDl": 1 }
        ).lean()
      : [];
    const scoreByMeal = new Map(scores.map((s) => [String(s.mealId), s]));

    // Map to unified entry shape
    const mealEntries = meals.map((m) => {
      const score = scoreByMeal.get(String(m._id));
      return {
        type: "meal",
        id: m._id,
        time: m.consumedAt,
        title: m.title,
        data: {
          mealType: m.mealType || null,
          totals: m.totals,
          // Cards only render item names — full macros/portions per item
          // (and imageKeys) just inflate the day-feed payload.
          items: (m.items || []).map((i) => ({ name: i.name })),
          foodScore: score?.foodScore ?? null,
          deltaMgDl: score?.predictedGlucosePeak?.deltaMgDl ?? null,
        },
      };
    });

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

    // Compute summary — including the day's macro totals so the dashboard
    // macro split doesn't need a second summary request.
    const macros = {
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      fiberG: 0,
      sugarG: 0,
    };
    for (const m of meals) {
      for (const key of Object.keys(macros)) {
        macros[key] += m.totals?.[key] || 0;
      }
    }
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
          totalCaloriesConsumed: macros.calories,
          totalCaloriesBurned,
          macros,
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
