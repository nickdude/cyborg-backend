const ActionPlan = require("../models/ActionPlan");
const Goal = require("../models/Goal");
const ReportData = require("../models/ReportData");
const User = require("../models/User");
const WearableData = require("../models/WearableData");
const { notify, notifyDoctor } = require("../utils/notificationHelper");
const { detectIssues } = require("../utils/issueDetector");
const { generateGoals } = require("../utils/goalGenerator");
const { generateNarratives } = require("../prompts/goalNarrative");
const { buildPatientContext } = require("../utils/goalHelpers");
const { computeDeltas } = require("./deltaTracker");
const { generateProtocol } = require("../prompts/actionPlanProtocol");

const AI_CALL_TIMEOUT_MS = 120_000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

function mapSkeletonsToBiomarkerEvidence(goalSkeletons, narratives) {
  const narrativeMap = {};
  for (const n of narratives) {
    narrativeMap[n.goalId] = n;
  }

  return goalSkeletons.map((skeleton) => {
    const narrative = narrativeMap[skeleton.goalId];
    const hasNarrative = narrative != null;

    return {
      goalId: skeleton.goalId,
      title: skeleton.title,
      priority: skeleton.priority,
      healthImpact: skeleton.healthImpact,
      category: skeleton.category || "",
      recoveryTimeWeeks: skeleton.recoveryTimeWeeks || [],
      description: hasNarrative ? narrative.summary || "" : "",
      whatThisMeans: hasNarrative ? narrative.whatThisMeans || "" : "",
      potentialCauses: hasNarrative ? narrative.potentialCauses || "" : "",
      recommendedActions: hasNarrative ? narrative.recommendedActions || [] : [],
      biomarkerEvidence: (skeleton.biomarkersToImprove || []).map((bm) => ({
        name: bm.displayName || bm.canonicalName,
        canonicalName: bm.canonicalName,
        flag: bm.optimalFlag || bm.flag || "Normal",
        value: bm.numericValue,
        unit: bm.unit || "",
        referenceMin: bm.referenceMin ?? null,
        referenceMax: bm.referenceMax ?? null,
        optimalMin: bm.optimalMin ?? null,
        optimalMax: bm.optimalMax ?? null,
      })),
      protocolItems: (skeleton.protocolItems || []).map((pi) => ({
        productName: pi.productName,
        dosing: pi.dosing,
        triggerBiomarkers: pi.triggerBiomarkers || [],
      })),
      _narrativeMissing: !hasNarrative,
    };
  });
}

function buildHealthReport(reportData) {
  const scores = reportData.scores || {};
  const panel = reportData.biomarkerPanel || [];

  // Only count biomarkers with actual numeric values (tested)
  const tested = panel.filter((bm) => bm.numericValue != null);

  let optimal = 0;
  let inRange = 0;
  let outOfRange = 0;
  for (const bm of tested) {
    const optFlag = (bm.optimalFlag || "").toLowerCase();
    const flag = (bm.flag || "").toLowerCase();

    if (optFlag === "optimal") {
      optimal++;
    } else if (
      flag === "high" || flag === "low" ||
      flag === "critical_high" || flag === "critical_low" ||
      optFlag === "out of range"
    ) {
      outOfRange++;
    } else {
      inRange++;
    }
  }

  return {
    cyborgScore: scores.cyborgScore?.final ?? scores.cyborgScore?.score ?? null,
    bioAge: {
      phenoAge: scores.bioAge?.bioAge ?? null,
      delta: scores.bioAge?.delta ?? null,
    },
    markerCounts: { total: tested.length, optimal, inRange, outOfRange },
    categoryGrades: scores.categoryGrades || null,
  };
}

function buildOverview(user, reportData) {
  return {
    intro: "This action plan is created using your blood tests, health intake survey, and AI-assisted clinical review to help optimize your health and future goals.",
    dataSources: [
      `Blood test (${reportData.filename || "uploaded report"})`,
      "Health intake survey responses",
      "Cyborg AI clinical review",
    ],
  };
}

function buildPlanJson(plan, goals) {
  return {
    summary: plan.overview?.intro || "",
    recommendations: goals.map((g) => ({
      title: g.title,
      items: (g.recommendedActions || []).map((a) => `${a.label} ${a.detail}`),
    })),
    labsReviewed: {
      fileName: plan.reportFilename || "",
      uploadedAt: plan.reportUploadedAt || new Date().toISOString(),
    },
  };
}

// ── Step runners ──────────────────────────────────────────────────

async function gatherInputs(userId, reportId) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [reportData, user, previousGoals, previousPlan, wearableData] =
    await Promise.all([
      ReportData.findById(reportId).lean(),
      User.findById(userId)
        .select("firstName lastName dateOfBirth onboardingData")
        .lean(),
      Goal.find({ userId }).sort({ createdAt: -1 }).limit(8).lean(),
      ActionPlan.findOne({ userId, status: "ready" }).sort({ createdAt: -1 }).lean(),
      WearableData.find({ userId, date: { $gte: thirtyDaysAgo } }).lean(),
    ]);

  if (!reportData) throw new Error("Report not found");

  const biomarkerPanel = reportData.biomarkerPanel || [];
  if (biomarkerPanel.length === 0) throw new Error("Report has no biomarker data");

  return { reportData, user, previousGoals, previousPlan, wearableData, biomarkerPanel };
}

function runGoalsPipeline(biomarkerPanel, onboardingData, wearableData) {
  const detectedIssues = detectIssues(biomarkerPanel, onboardingData, wearableData);
  console.log(`[ActionPlan] Detected ${detectedIssues.length} issues`);

  const goalSkeletons = generateGoals(detectedIssues, onboardingData, biomarkerPanel);
  console.log(`[ActionPlan] Generated ${goalSkeletons.length} goal skeletons`);

  return { detectedIssues, goalSkeletons };
}

async function saveGoals(goalsWithDeltas, userId, reportId) {
  const saved = [];
  for (const goal of goalsWithDeltas) {
    const doc = await Goal.findOneAndUpdate(
      { reportId, goalId: goal.goalId },
      { userId, reportId, ...goal },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    saved.push(doc);
  }
  return saved;
}

// ── Main orchestrator ─────────────────────────────────────────────

async function triggerGoalsAndActionPlan(userId, reportId, planId) {
  try {
    await ActionPlan.findByIdAndUpdate(planId, {
      status: "generating",
      $inc: { generationAttempts: 1 },
    });

    console.log(`[ActionPlan] Starting generation for user=${userId} report=${reportId}`);

    // Step 1: Gather inputs
    const { reportData, user, previousGoals, previousPlan, wearableData, biomarkerPanel } =
      await gatherInputs(userId, reportId);

    const onboardingData = user?.onboardingData || {};

    // Step 2: Run goals pipeline
    const { goalSkeletons } = runGoalsPipeline(biomarkerPanel, onboardingData, wearableData);

    // Step 3: AI Call 1 — generate narratives (with timeout)
    console.log("[ActionPlan] Generating AI narratives...");
    const patientContext = buildPatientContext(user, reportData);
    const narratives = await withTimeout(
      generateNarratives(goalSkeletons, patientContext),
      AI_CALL_TIMEOUT_MS,
      "Narrative generation"
    );

    // Step 4: Merge skeletons + narratives into full goals with biomarker evidence
    const mergedGoals = mapSkeletonsToBiomarkerEvidence(goalSkeletons, narratives);

    // Step 5: Compute deltas vs previous goals
    const { goals: goalsWithDeltas } = computeDeltas(mergedGoals, previousGoals);

    // Step 6: Save Goal documents (sequential to avoid hammering DB)
    console.log(`[ActionPlan] Saving ${goalsWithDeltas.length} goals...`);
    const savedGoals = await saveGoals(goalsWithDeltas, userId, reportId);
    const goalIds = savedGoals.map((g) => g._id);

    // Step 7: AI Call 2 — generate protocol + next steps (with timeout)
    console.log("[ActionPlan] Generating protocol...");
    const allProtocolItems = goalsWithDeltas.flatMap((g) => g.protocolItems || []);
    const protocolResult = await withTimeout(
      generateProtocol({
        patientContext,
        goals: goalsWithDeltas,
        protocolItems: allProtocolItems,
        scores: reportData.scores,
        previousProtocol: previousPlan?.protocol || null,
      }),
      AI_CALL_TIMEOUT_MS,
      "Protocol generation"
    );

    // Step 8: Assemble full plan
    const overview = buildOverview(user, reportData);
    const healthReport = buildHealthReport(reportData);

    const planUpdate = {
      status: "pending_review",
      goalIds,
      previousPlanId: previousPlan?._id || null,
      overview,
      healthReport,
      protocol: protocolResult.protocol || {},
      nextSteps: {
        followUpTimeline: protocolResult.nextSteps?.followUpTimeline || "Re-test in 3 months",
        text: protocolResult.nextSteps?.text || "",
        checklist: protocolResult.nextSteps?.checklist || [],
        recommendedProducts: allProtocolItems.map((pi) => ({
          productName: pi.productName,
          dose: pi.dosing,
          price: null,
        })),
        disclaimer:
          "This report is not intended to diagnose or treat disease, or to substitute a physician's consultation. Review these results with your doctor.",
      },
      generatedAt: new Date(),
    };

    planUpdate.planJson = buildPlanJson(
      { ...planUpdate, reportFilename: reportData.filename, reportUploadedAt: reportData.createdAt },
      goalsWithDeltas
    );

    await ActionPlan.findByIdAndUpdate(planId, planUpdate);

    // Step 9: Notify patient (awaiting review) + doctor (ready for review)
    await notify(userId, "goals:awaiting_review", { planId, reportId });
    await notifyDoctor(userId, "doctor:goals_ready_for_review", { planId, reportId });

    console.log(`[ActionPlan] Generation complete for plan=${planId}`);
  } catch (error) {
    console.error(`[ActionPlan] Generation failed for plan=${planId}:`, error.message);
    await ActionPlan.findByIdAndUpdate(planId, {
      status: "failed",
      errorMessage: error.message,
    }).catch(() => {});
  }
}

module.exports = { triggerGoalsAndActionPlan };
