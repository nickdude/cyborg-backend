/**
 * Goals Engine — Orchestrator
 *
 * Fetches patient data, runs the 3-layer pipeline
 * (issue detection -> goal generation -> AI narratives),
 * and merges the results into final Goal Cards.
 */

const ReportData = require("../models/ReportData");
const User = require("../models/User");
const WearableData = require("../models/WearableData");
const { detectIssues } = require("../utils/issueDetector");
const { generateGoals } = require("../utils/goalGenerator");
const { generateNarratives } = require("../prompts/goalNarrative");
const { buildPatientContext, mergeGoalsWithNarratives } = require("../utils/goalHelpers");

/**
 * Generate all goal cards for a user.
 *
 * @param {string} userId - The authenticated user's ID
 * @returns {Object} { goals: GoalCard[], meta: { totalGoals, highPriority, ... } }
 * @throws {Error} with code 'NO_REPORT' if no report data exists
 */
async function generateGoalCards(userId) {
  // Fetch data in parallel
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [reportData, user, wearableData] = await Promise.all([
    ReportData.findOne({ userId }).sort({ reportDate: -1, createdAt: -1 }).lean(),
    User.findById(userId).select("firstName lastName dateOfBirth onboardingData").lean(),
    WearableData.find({ userId, date: { $gte: thirtyDaysAgo } }).lean(),
  ]);

  if (!reportData) {
    const err = new Error("No report data found. Upload a lab report first.");
    err.code = "NO_REPORT";
    throw err;
  }

  const onboardingData = user?.onboardingData || {};
  const biomarkerPanel = reportData.biomarkerPanel || [];

  if (biomarkerPanel.length === 0) {
    const err = new Error("No report data found. Upload a lab report first.");
    err.code = "NO_REPORT";
    throw err;
  }

  // Layer 1: Detect issues
  console.log("[GoalsEngine] Running issue detection...");
  const detectedIssues = detectIssues(biomarkerPanel, onboardingData, wearableData);
  console.log(`[GoalsEngine] Detected ${detectedIssues.length} issues`);

  // Layer 2: Generate goal skeletons
  console.log("[GoalsEngine] Generating goals...");
  const goalSkeletons = generateGoals(detectedIssues, onboardingData, biomarkerPanel);
  console.log(`[GoalsEngine] Generated ${goalSkeletons.length} goal skeletons`);

  if (goalSkeletons.length === 0) {
    return {
      goals: [],
      meta: {
        totalGoals: 0,
        highPriority: 0,
        mediumPriority: 0,
        lowPriority: 0,
        issuesDetected: detectedIssues.length,
        computedAt: new Date().toISOString(),
      },
    };
  }

  // Layer 3: Generate AI narratives
  console.log("[GoalsEngine] Generating AI narratives...");
  const patientContext = buildPatientContext(user, reportData);
  const narratives = await generateNarratives(goalSkeletons, patientContext);

  // Merge skeletons + narratives into final goal cards
  const goals = mergeGoalsWithNarratives(goalSkeletons, narratives);

  const meta = {
    totalGoals: goals.length,
    highPriority: goals.filter(g => g.priority === "High").length,
    mediumPriority: goals.filter(g => g.priority === "Medium").length,
    lowPriority: goals.filter(g => g.priority === "Low").length,
    issuesDetected: detectedIssues.length,
    computedAt: new Date().toISOString(),
  };

  return { goals, meta };
}

module.exports = { generateGoalCards };
