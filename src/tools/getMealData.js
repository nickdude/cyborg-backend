const Meal = require("../models/Meal");

const definition = {
  name: "getMealData",
  description:
    "Retrieve the user's meal log (food diary) for the past N days. Returns individual meals with macronutrients (calories, protein, carbs, fat, fiber, sugar), daily totals, and averages. Call when the user asks about their diet, food intake, what they ate, meal history, nutrition, calorie tracking, or macro breakdown. Default to 3 days for recent questions; up to 14 for weekly patterns; up to 90 for long-range dietary analysis.",
  input_schema: {
    type: "object",
    properties: {
      days: {
        type: "integer",
        minimum: 1,
        maximum: 90,
        description: "Number of days to look back (default 3).",
      },
    },
    required: [],
  },
};

async function execute(input = {}, userId) {
  try {
    const days = Math.min(Math.max(input.days || 3, 1), 90);
    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - days);
    startDate.setUTCHours(0, 0, 0, 0);

    const meals = await Meal.find({
      userId,
      consumedAt: { $gte: startDate },
    })
      .sort({ consumedAt: -1 })
      .lean();

    if (meals.length === 0) {
      return {
        daysRequested: days,
        daysFound: 0,
        mealsFound: 0,
        message:
          "No meal data on file for this period. The user may not have logged any meals yet.",
      };
    }

    // Group by day
    const byDay = {};
    for (const m of meals) {
      const dayKey = new Date(m.consumedAt).toISOString().slice(0, 10);
      if (!byDay[dayKey]) byDay[dayKey] = [];
      byDay[dayKey].push(m);
    }

    // Compute daily totals
    const dailySummaries = Object.entries(byDay)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, dayMeals]) => {
        const totals = {
          calories: 0,
          proteinG: 0,
          carbsG: 0,
          fatG: 0,
          fiberG: 0,
          sugarG: 0,
        };
        for (const m of dayMeals) {
          if (m.totals) {
            totals.calories += m.totals.calories || 0;
            totals.proteinG += m.totals.proteinG || 0;
            totals.carbsG += m.totals.carbsG || 0;
            totals.fatG += m.totals.fatG || 0;
            totals.fiberG += m.totals.fiberG || 0;
            totals.sugarG += m.totals.sugarG || 0;
          }
        }
        // Round for readability
        for (const k of Object.keys(totals)) {
          totals[k] = Math.round(totals[k] * 10) / 10;
        }
        return {
          date,
          mealCount: dayMeals.length,
          totals,
          meals: dayMeals.map((m) => ({
            title: m.title || "Untitled meal",
            consumedAt: m.consumedAt,
            totals: m.totals,
            items: (m.items || []).map((it) => ({
              name: it.name,
              portion: it.portion,
              calories: it.calories,
              proteinG: it.proteinG,
              carbsG: it.carbsG,
              fatG: it.fatG,
            })),
            confidence: m.confidence,
          })),
        };
      });

    // Compute period averages
    const numDays = dailySummaries.length;
    const avgTotals = {
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      fiberG: 0,
      sugarG: 0,
    };
    for (const d of dailySummaries) {
      for (const k of Object.keys(avgTotals)) {
        avgTotals[k] += d.totals[k];
      }
    }
    for (const k of Object.keys(avgTotals)) {
      avgTotals[k] = Math.round((avgTotals[k] / numDays) * 10) / 10;
    }

    return {
      daysRequested: days,
      daysWithData: numDays,
      totalMeals: meals.length,
      dailyAverages: avgTotals,
      dailySummaries,
    };
  } catch (err) {
    console.error("[getMealData] Error:", err.message);
    return { error: "Failed to retrieve meal data." };
  }
}

module.exports = { definition, execute };
