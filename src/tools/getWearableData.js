const WearableData = require("../models/WearableData");
const { computeTrends } = require("../services/wearableTrends");

const definition = {
  name: 'getWearableData',
  description: 'Retrieve recent wearable device data with trend analysis for the user (steps, heart rate, HRV, sleep stages, SpO2, workouts). Returns daily data, summary averages, 7-day moving trends, week-over-week comparisons, and auto-generated insights. Call when the user asks about activity, sleep, heart rate trends, recovery, fitness progress, or health trends. Default to 7 days; use up to 30 for trend questions, up to 90 for long-range analysis.',
  input_schema: {
    type: 'object',
    properties: {
      days: {
        type: 'integer',
        minimum: 1,
        maximum: 90,
        description: 'Number of days to look back (default 7).',
      },
    },
    required: [],
  },
};

async function execute(input = {}, userId, chatId) {
  try {
    const days = Math.min(Math.max(input.days || 7, 1), 90);
    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - days);
    startDate.setUTCHours(0, 0, 0, 0);

    const records = await WearableData.find({
      userId,
      date: { $gte: startDate },
    })
      .sort({ date: -1 })
      .lean();

    if (records.length === 0) {
      return {
        daysRequested: days,
        daysFound: 0,
        message: 'No wearable data on file. Ask the user to connect a device or seed test data.',
      };
    }

    // Compute summary averages
    let totalSteps = 0, totalRestingHR = 0, totalHRV = 0, totalSleep = 0, totalSpO2 = 0;
    let stepsCount = 0, hrCount = 0, hrvCount = 0, sleepCount = 0, spo2Count = 0;
    let totalWorkouts = 0;

    for (const r of records) {
      const m = r.metrics || {};
      if (m.steps != null)                 { totalSteps    += m.steps;               stepsCount++; }
      if (m.heartRate?.resting != null)    { totalRestingHR += m.heartRate.resting;  hrCount++; }
      if (m.hrv != null)                   { totalHRV      += m.hrv;                 hrvCount++; }
      if (m.sleep?.totalHours != null)     { totalSleep    += m.sleep.totalHours;    sleepCount++; }
      if (m.spo2 != null)                  { totalSpO2     += m.spo2;                spo2Count++; }
      if (Array.isArray(m.workouts))       totalWorkouts   += m.workouts.length;
    }

    const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

    const summary = {
      avgSteps:      stepsCount  ? round(totalSteps    / stepsCount,  0) : null,
      avgRestingHR:  hrCount     ? round(totalRestingHR / hrCount,    1) : null,
      avgHRV:        hrvCount    ? round(totalHRV       / hrvCount,   1) : null,
      avgSleepHours: sleepCount  ? round(totalSleep     / sleepCount, 1) : null,
      avgSpO2:       spo2Count   ? round(totalSpO2      / spo2Count,  1) : null,
      totalWorkouts,
    };

    const dailyData = records.map(r => ({
      date: r.date.toISOString().slice(0, 10),
      source: r.source,
      metrics: r.metrics,
    }));

    // Compute trends (without time series arrays to reduce context bloat for AI)
    const trendAnalysis = computeTrends(records, days, { includeTimeSeries: false });

    return {
      daysRequested: days,
      daysFound: records.length,
      source: records[0]?.source,
      summary,
      trends: trendAnalysis.trends,
      weekOverWeek: trendAnalysis.weekOverWeek,
      insights: trendAnalysis.insights,
      dailyData,
    };
  } catch (err) {
    console.error('[getWearableData] Error:', err.message);
    return { error: `Failed to fetch wearable data: ${err.message}` };
  }
}

module.exports = { definition, execute };
