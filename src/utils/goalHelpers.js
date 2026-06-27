/**
 * Shared helpers used by both goalsEngine.js and actionPlanGenerator.js.
 */

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
    superpowerScore: scores.cyborgScore?.final ?? null,
    bioAge: scores.bioAge?.phenoAge ?? null,
    categoryGrades: scores.categoryGrades || {},
  };
}

function mergeGoalsWithNarratives(goalSkeletons, narratives) {
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
      summary: hasNarrative ? narrative.summary || "" : "",
      description: hasNarrative ? narrative.summary || "" : "",
      whatThisMeans: hasNarrative ? narrative.whatThisMeans || "" : "",
      potentialCauses: hasNarrative ? narrative.potentialCauses || "" : "",
      recommendedActions: hasNarrative ? narrative.recommendedActions || [] : [],
      biomarkerEvidence: skeleton.biomarkersToImprove,
      protocolItems: skeleton.protocolItems,
      contributingIssues: skeleton.contributingIssues,
      _narrativeMissing: !hasNarrative,
    };
  });
}

module.exports = { buildPatientContext, mergeGoalsWithNarratives };
