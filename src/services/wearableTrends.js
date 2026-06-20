/**
 * Pure computation module — no DB imports.
 * Takes raw WearableData records, returns trends, week-over-week, and insights.
 */

const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

function extractMetricSeries(records, accessor) {
  const series = [];
  for (const r of records) {
    const val = accessor(r);
    if (val != null) {
      series.push({ date: r.date.toISOString().slice(0, 10), value: val });
    }
  }
  return series;
}

function computeStats(values) {
  if (values.length === 0) return { avg: null, min: null, max: null, stdDev: null };
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const variance = values.reduce((acc, v) => acc + (v - avg) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  return { avg: round(avg, 1), min: round(min, 1), max: round(max, 1), stdDev: round(stdDev, 2) };
}

function computeMovingAverage(series, windowSize = 7) {
  const result = [];
  for (let i = 0; i < series.length; i++) {
    const windowStart = Math.max(0, i - windowSize + 1);
    const window = series.slice(windowStart, i + 1);
    const avg = window.reduce((s, p) => s + p.value, 0) / window.length;
    result.push({ date: series[i].date, value: round(avg, 1) });
  }
  return result;
}

function computeDirection(current, previous, invertBetter = false) {
  if (current == null || previous == null || previous === 0) return "insufficient_data";
  const changePct = ((current - previous) / previous) * 100;
  if (Math.abs(changePct) < 5) return "stable";
  const isUp = changePct > 0;
  if (invertBetter) return isUp ? "declining" : "improving";
  return isUp ? "improving" : "declining";
}

function computeMetricTrend(series, invertBetter = false, includeTimeSeries = true) {
  if (series.length < 2) {
    return {
      current7dAvg: series.length === 1 ? series[0].value : null,
      previous7dAvg: null,
      min: series.length === 1 ? series[0].value : null,
      max: series.length === 1 ? series[0].value : null,
      stdDev: null,
      direction: "insufficient_data",
      ...(includeTimeSeries ? { movingAverage7d: series } : {}),
    };
  }

  const values = series.map(s => s.value);
  const stats = computeStats(values);

  // Split into recent 7d and previous 7d
  const recent7 = series.slice(-7);
  const previous7 = series.slice(-14, -7);

  const current7dAvg = recent7.length > 0
    ? round(recent7.reduce((s, p) => s + p.value, 0) / recent7.length, 1)
    : null;
  const previous7dAvg = previous7.length > 0
    ? round(previous7.reduce((s, p) => s + p.value, 0) / previous7.length, 1)
    : null;

  const direction = series.length < 7
    ? "insufficient_data"
    : computeDirection(current7dAvg, previous7dAvg, invertBetter);

  return {
    current7dAvg,
    previous7dAvg,
    min: stats.min,
    max: stats.max,
    stdDev: stats.stdDev,
    direction,
    ...(includeTimeSeries ? { movingAverage7d: computeMovingAverage(series) } : {}),
  };
}

function computeWoW(series, invertBetter = false) {
  const last14 = series.slice(-14);
  if (last14.length < 7) return { thisWeekAvg: null, lastWeekAvg: null, changePercent: null, direction: "insufficient_data" };

  const thisWeek = last14.slice(-7);
  const lastWeek = last14.slice(0, last14.length - 7);

  if (lastWeek.length === 0) return { thisWeekAvg: null, lastWeekAvg: null, changePercent: null, direction: "insufficient_data" };

  const thisWeekAvg = round(thisWeek.reduce((s, p) => s + p.value, 0) / thisWeek.length, 1);
  const lastWeekAvg = round(lastWeek.reduce((s, p) => s + p.value, 0) / lastWeek.length, 1);
  const changePercent = lastWeekAvg !== 0 ? round(((thisWeekAvg - lastWeekAvg) / lastWeekAvg) * 100, 1) : null;

  let direction = "stable";
  if (changePercent != null && Math.abs(changePercent) >= 5) {
    const isUp = changePercent > 0;
    direction = invertBetter ? (isUp ? "declining" : "improving") : (isUp ? "improving" : "declining");
  }

  return { thisWeekAvg, lastWeekAvg, changePercent, direction };
}

function generateInsights(trends, weekOverWeek, summary, records) {
  const insights = [];

  // HRV trend
  if (trends.hrv?.direction === "improving") {
    insights.push("Your HRV is trending upward — this suggests improving recovery and stress resilience.");
  } else if (trends.hrv?.direction === "declining") {
    insights.push("Your HRV has been declining — consider prioritizing sleep quality and stress management.");
  }

  // Sleep deficit
  if (summary.avgSleepHours != null && summary.avgSleepHours < 7) {
    insights.push(`Your average sleep is ${summary.avgSleepHours}h — below the recommended 7-9 hours. Sleep debt accumulates and impacts recovery.`);
  }

  // Step goal
  if (summary.avgSteps != null) {
    if (summary.avgSteps >= 10000) {
      insights.push(`Averaging ${summary.avgSteps} steps/day — great job hitting the 10K target!`);
    } else if (summary.avgSteps < 7000) {
      insights.push(`Averaging ${summary.avgSteps} steps/day — aim for 7,000-10,000 for cardiovascular benefits.`);
    }
  }

  // Activity consistency
  if (trends.activeMinutes?.stdDev != null && trends.activeMinutes.stdDev > 25) {
    insights.push("Your daily activity varies a lot — consistency matters more than occasional intense days.");
  }

  // Workout frequency
  if (summary.totalWorkouts != null && records.length >= 7) {
    const weeklyRate = round((summary.totalWorkouts / records.length) * 7, 1);
    if (weeklyRate >= 4) {
      insights.push(`${weeklyRate} workouts/week — excellent training frequency.`);
    } else if (weeklyRate < 3) {
      insights.push(`${weeklyRate} workouts/week — try to aim for 3-5 sessions for optimal health benefits.`);
    }
  }

  // Resting HR WoW
  if (weekOverWeek.restingHR?.direction === "declining") {
    insights.push("Resting heart rate is dropping week-over-week — a sign of improving cardiovascular fitness.");
  } else if (weekOverWeek.restingHR?.direction === "improving") {
    // For HR, "improving" means going up, which is actually worse
    insights.push("Resting heart rate is rising — could indicate stress, overtraining, or insufficient recovery.");
  }

  // SpO2
  if (summary.avgSpO2 != null && summary.avgSpO2 < 95) {
    insights.push(`Average SpO2 of ${summary.avgSpO2}% is below normal range (95-100%). Consider discussing with your doctor.`);
  }

  // Best day for steps
  if (records.length > 0) {
    let bestDay = null;
    let bestSteps = 0;
    for (const r of records) {
      if (r.metrics?.steps > bestSteps) {
        bestSteps = r.metrics.steps;
        bestDay = r.date.toISOString().slice(0, 10);
      }
    }
    if (bestDay && bestSteps > 0) {
      insights.push(`Best step day: ${bestDay} with ${bestSteps.toLocaleString()} steps.`);
    }
  }

  // Deep sleep ratio
  if (summary.avgSleepHours != null && trends.deepSleepHours?.current7dAvg != null) {
    const deepRatio = trends.deepSleepHours.current7dAvg / summary.avgSleepHours;
    if (deepRatio < 0.13) {
      insights.push("Deep sleep is below 13% of total — this stage is critical for physical recovery and growth hormone release.");
    }
  }

  // Week-over-week steps change
  if (weekOverWeek.steps?.changePercent != null && weekOverWeek.steps.changePercent > 15) {
    insights.push(`Steps up ${weekOverWeek.steps.changePercent}% week-over-week — keep the momentum going!`);
  }

  return insights;
}

/**
 * Compute trends from raw WearableData records.
 *
 * @param {Array} records - WearableData documents sorted by date ascending
 * @param {number} days - Number of days requested
 * @param {Object} options
 * @param {boolean} options.includeTimeSeries - Include movingAverage7d arrays (default true)
 * @returns {Object} Full trend analysis
 */
function computeTrends(records, days, { includeTimeSeries = true } = {}) {
  if (!records || records.length === 0) {
    return {
      period: { days, daysFound: 0, dateRange: null },
      summary: null,
      trends: null,
      weekOverWeek: null,
      insights: [],
      dailyData: [],
    };
  }

  // Sort ascending by date
  const sorted = [...records].sort((a, b) => new Date(a.date) - new Date(b.date));

  // Build metric series
  const m = (r) => r.metrics || {};
  const stepsSeries = extractMetricSeries(sorted, r => m(r).steps);
  const restingHRSeries = extractMetricSeries(sorted, r => m(r).heartRate?.resting);
  const hrvSeries = extractMetricSeries(sorted, r => m(r).hrv);
  const sleepSeries = extractMetricSeries(sorted, r => m(r).sleep?.totalHours);
  const spo2Series = extractMetricSeries(sorted, r => m(r).spo2);
  const activeMinSeries = extractMetricSeries(sorted, r => m(r).activeMinutes);
  const deepSleepSeries = extractMetricSeries(sorted, r => m(r).sleep?.deepHours);
  const remSleepSeries = extractMetricSeries(sorted, r => m(r).sleep?.remHours);

  // Summary averages
  const avg = (series) => series.length > 0 ? round(series.reduce((s, p) => s + p.value, 0) / series.length, 1) : null;
  let totalWorkouts = 0;
  for (const r of sorted) {
    if (Array.isArray(m(r).workouts)) totalWorkouts += m(r).workouts.length;
  }

  const summary = {
    avgSteps: avg(stepsSeries),
    avgRestingHR: avg(restingHRSeries),
    avgHRV: avg(hrvSeries),
    avgSleepHours: avg(sleepSeries),
    avgSpO2: avg(spo2Series),
    avgActiveMinutes: avg(activeMinSeries),
    totalWorkouts,
  };

  // Trends per metric (invertBetter=true for restingHR — lower is better)
  const trends = {
    steps: computeMetricTrend(stepsSeries, false, includeTimeSeries),
    restingHR: computeMetricTrend(restingHRSeries, true, includeTimeSeries),
    hrv: computeMetricTrend(hrvSeries, false, includeTimeSeries),
    sleepHours: computeMetricTrend(sleepSeries, false, includeTimeSeries),
    spo2: computeMetricTrend(spo2Series, false, includeTimeSeries),
    activeMinutes: computeMetricTrend(activeMinSeries, false, includeTimeSeries),
    deepSleepHours: computeMetricTrend(deepSleepSeries, false, includeTimeSeries),
    remSleepHours: computeMetricTrend(remSleepSeries, false, includeTimeSeries),
  };

  // Week-over-week
  const weekOverWeek = {
    steps: computeWoW(stepsSeries),
    restingHR: computeWoW(restingHRSeries, true),
    hrv: computeWoW(hrvSeries),
    sleepHours: computeWoW(sleepSeries),
    activeMinutes: computeWoW(activeMinSeries),
  };

  const insights = generateInsights(trends, weekOverWeek, summary, sorted);

  // Flat daily data for charts
  const dailyData = sorted.map(r => {
    const met = r.metrics || {};
    return {
      date: r.date.toISOString().slice(0, 10),
      steps: met.steps ?? null,
      restingHR: met.heartRate?.resting ?? null,
      avgHR: met.heartRate?.avg ?? null,
      maxHR: met.heartRate?.max ?? null,
      hrv: met.hrv ?? null,
      spo2: met.spo2 ?? null,
      activeMinutes: met.activeMinutes ?? null,
      sleepTotal: met.sleep?.totalHours ?? null,
      sleepDeep: met.sleep?.deepHours ?? null,
      sleepRem: met.sleep?.remHours ?? null,
      sleepLight: met.sleep?.lightHours ?? null,
      sleepAwake: met.sleep?.awakeHours ?? null,
      workoutCount: Array.isArray(met.workouts) ? met.workouts.length : 0,
    };
  });

  return {
    period: {
      days,
      daysFound: sorted.length,
      dateRange: {
        start: sorted[0].date.toISOString().slice(0, 10),
        end: sorted[sorted.length - 1].date.toISOString().slice(0, 10),
      },
    },
    summary,
    trends,
    weekOverWeek,
    insights,
    dailyData,
  };
}

module.exports = { computeTrends };
