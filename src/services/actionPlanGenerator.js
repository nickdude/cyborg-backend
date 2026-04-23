const ActionPlan = require("../models/ActionPlan");
const Goal = require("../models/Goal");
const ReportData = require("../models/ReportData");
const User = require("../models/User");
const WearableData = require("../models/WearableData");
const Notification = require("../models/Notification");
const { detectIssues } = require("../utils/issueDetector");
const { generateGoals } = require("../utils/goalGenerator");
const { generateNarratives } = require("../prompts/goalNarrative");
const { computeDeltas } = require("./deltaTracker");
const { generateProtocol } = require("../prompts/actionPlanProtocol");

function buildPatientContext(user, reportData) {
  const od = user.onboardingData || {};
  const scores = reportData?.scores || {};

  let age = null;
  const dob = user.dateOfBirth || od.dateOfBirth;
  if (dob) {
    const dobDate = new Date(dob);
    age = Math.floor(
      (Date.now() - dobDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
    );
  }

  return {
    name: user.firstName || od.name || "Member",
    age,
    sex: od.sex || null,
    conditions: od.conditions || [],
    medications: od.medications || [],
    allergies: od.allergies || [],
    supplements: od.supplements || [],
    diet: od.diet || "",
    exerciseFreq: od.exerciseFreq || "",
    exerciseTypes: od.exerciseTypes || [],
    sleepHours: od.sleepHours || "",
    sleepQuality: od.sleepQuality || "",
    smoking: od.smoking || "",
    alcohol: od.alcohol || "",
    goals: od.goals || [],
    focusAreas: od.focusAreas || [],
    familyHistory: od.familyHistory || [],
    technicalLevel: od.technicalLevel || "standard",
    superpowerScore: scores.cyborgScore?.score ?? null,
    bioAge: scores.bioAge?.bioAge ?? null,
    categoryGrades: scores.categoryGrades || {},
  };
}

function mergeGoalsWithNarratives(goalSkeletons, narratives) {
  const narrativeMap = {};
  for (const n of narratives) {
    narrativeMap[n.goalId] = n;
  }

  return goalSkeletons.map((skeleton) => {
    const narrative = narrativeMap[skeleton.goalId] || {};
    return {
      goalId: skeleton.goalId,
      title: skeleton.title,
      priority: skeleton.priority,
      healthImpact: skeleton.healthImpact,
      category: skeleton.category || "",
      recoveryTimeWeeks: skeleton.recoveryTimeWeeks || [],
      description: narrative.summary || "",
      whatThisMeans: narrative.whatThisMeans || "",
      potentialCauses: narrative.potentialCauses || "",
      recommendedActions: narrative.recommendedActions || [],
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
    };
  });
}

function buildHealthReport(reportData) {
  const scores = reportData.scores || {};
  const panel = reportData.biomarkerPanel || [];

  let optimal = 0;
  let inRange = 0;
  let outOfRange = 0;
  for (const bm of panel) {
    const flag = (bm.optimalFlag || bm.flag || "").toLowerCase();
    if (flag === "optimal") optimal++;
    else if (
      flag === "out of range" ||
      flag === "elevated" ||
      flag === "low" ||
      flag === "high" ||
      flag === "critical"
    )
      outOfRange++;
    else inRange++;
  }

  return {
    cyborgScore: scores.cyborgScore?.score ?? null,
    bioAge: {
      phenoAge: scores.bioAge?.bioAge ?? null,
      delta: scores.bioAge?.delta ?? null,
    },
    markerCounts: {
      total: panel.length,
      optimal,
      inRange,
      outOfRange,
    },
    categoryGrades: scores.categoryGrades || null,
  };
}

function buildOverview(user, reportData) {
  const name = user.firstName || "Member";
  return {
    intro: `This action plan is created using your blood tests, health intake survey, and AI-assisted clinical review to help optimize your health and future goals.`,
    dataSources: [
      `Blood test (${reportData.filename || "uploaded report"})`,
      "Health intake survey responses",
      "Cyborg AI clinical review",
    ],
  };
}

function buildPlanJson(plan, goals) {
  const monitoredIssues = goals.map((g) => ({
    title: g.title,
    priority: g.priority,
    description: g.whatThisMeans || g.description,
    actions: (g.recommendedActions || []).map(
      (a) => `${a.label} ${a.detail}`
    ),
  }));

  return {
    summary: plan.overview?.intro || "",
    recommendations: monitoredIssues.map((issue) => ({
      title: issue.title,
      items: issue.actions,
    })),
    labsReviewed: {
      fileName: plan.reportFilename || "",
      uploadedAt: plan.reportUploadedAt || new Date().toISOString(),
    },
  };
}

async function triggerGoalsAndActionPlan(userId, reportId, planId) {
  try {
    await ActionPlan.findByIdAndUpdate(planId, {
      status: "generating",
      $inc: { generationAttempts: 1 },
    });

    console.log(`[ActionPlan] Starting generation for user=${userId} report=${reportId}`);

    // Step 1: Gather inputs in parallel
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [reportData, user, previousGoals, previousPlan, wearableData] =
      await Promise.all([
        ReportData.findById(reportId).lean(),
        User.findById(userId)
          .select("firstName lastName dateOfBirth onboardingData")
          .lean(),
        Goal.find({ userId })
          .sort({ createdAt: -1 })
          .limit(8)
          .lean(),
        ActionPlan.findOne({ userId, status: "ready" })
          .sort({ createdAt: -1 })
          .lean(),
        WearableData.find({ userId, date: { $gte: thirtyDaysAgo } }).lean(),
      ]);

    if (!reportData) {
      throw new Error("Report not found");
    }

    const biomarkerPanel = reportData.biomarkerPanel || [];
    if (biomarkerPanel.length === 0) {
      throw new Error("Report has no biomarker data");
    }

    const onboardingData = user?.onboardingData || {};

    // Step 2: Run goals pipeline (Layer 1 + 2)
    console.log("[ActionPlan] Running issue detection...");
    const detectedIssues = detectIssues(biomarkerPanel, onboardingData, wearableData);
    console.log(`[ActionPlan] Detected ${detectedIssues.length} issues`);

    console.log("[ActionPlan] Generating goal skeletons...");
    const goalSkeletons = generateGoals(detectedIssues, onboardingData, biomarkerPanel);
    console.log(`[ActionPlan] Generated ${goalSkeletons.length} goal skeletons`);

    // Step 3: AI Call 1 — generate narratives
    console.log("[ActionPlan] Generating AI narratives...");
    const patientContext = buildPatientContext(user, reportData);
    const narratives = await generateNarratives(goalSkeletons, patientContext);

    // Step 4: Merge skeletons + narratives
    const mergedGoals = mergeGoalsWithNarratives(goalSkeletons, narratives);

    // Step 5: Compute deltas vs previous goals
    const { goals: goalsWithDeltas, resolvedGoalIds } = computeDeltas(
      mergedGoals,
      previousGoals
    );

    // Step 6: Save Goal documents
    console.log(`[ActionPlan] Saving ${goalsWithDeltas.length} goals...`);
    const savedGoals = await Promise.all(
      goalsWithDeltas.map((goal) =>
        Goal.findOneAndUpdate(
          { reportId, goalId: goal.goalId },
          { userId, reportId, ...goal },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        )
      )
    );

    const goalIds = savedGoals.map((g) => g._id);

    // Step 7: AI Call 2 — generate protocol + next steps
    console.log("[ActionPlan] Generating protocol...");
    const allProtocolItems = goalsWithDeltas.flatMap((g) => g.protocolItems || []);
    const protocolResult = await generateProtocol({
      patientContext,
      goals: goalsWithDeltas,
      protocolItems: allProtocolItems,
      scores: reportData.scores,
      previousProtocol: previousPlan?.protocol || null,
    });

    // Step 8: Assemble full plan
    const overview = buildOverview(user, reportData);
    const healthReport = buildHealthReport(reportData);

    const planUpdate = {
      status: "ready",
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

    // Build planJson for backward compat with current frontend
    planUpdate.planJson = buildPlanJson(
      { ...planUpdate, reportFilename: reportData.filename, reportUploadedAt: reportData.createdAt },
      goalsWithDeltas
    );

    await ActionPlan.findByIdAndUpdate(planId, planUpdate);

    // Step 9: Update user flags
    await User.findByIdAndUpdate(userId, { actionPlanReady: true });

    // Step 10: Send notification
    await Notification.create({
      userId,
      type: "action_plan_ready",
      metadata: { planId, reportId },
    });

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
