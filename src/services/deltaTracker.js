/**
 * Delta Tracker — compares new goals vs previous goals to track
 * what improved, worsened, appeared, or resolved between reports.
 */

function distanceFromOptimal(biomarker) {
  const { value, optimalMin, optimalMax, referenceMin, referenceMax } = biomarker;
  if (value == null) return null;

  const oMin = optimalMin ?? referenceMin;
  const oMax = optimalMax ?? referenceMax;
  if (oMin == null || oMax == null) return null;

  if (value >= oMin && value <= oMax) return 0;

  // Use reference range as denominator for normalization; fall back to absolute distance
  const range = Math.abs(oMax - oMin);
  if (range === 0) {
    return Math.abs(value - oMin);
  }
  if (value < oMin) return (oMin - value) / range;
  return (value - oMax) / range;
}

function evaluateOperator(value, operator, threshold) {
  if (value == null || threshold == null) return false;
  switch (operator) {
    case "<": return value < threshold;
    case "<=": return value <= threshold;
    case ">": return value > threshold;
    case ">=": return value >= threshold;
    case "within_range": return value >= threshold * 0.9 && value <= threshold * 1.1;
    default: return false;
  }
}

function computeDeltas(newGoals, previousGoals, biomarkerPanel) {
  if (!previousGoals || previousGoals.length === 0) {
    return {
      goals: newGoals.map((g) => {
        const result = {
          ...g,
          delta: { status: "new", previousPriority: null, improvedBiomarkers: [], worsenedBiomarkers: [] },
        };
        // Evaluate achievement criteria against current biomarker panel
        if (g.achievementCriteria?.length > 0 && biomarkerPanel) {
          const allMet = g.achievementCriteria.every(criterion => {
            const bm = biomarkerPanel.find(b =>
              b.canonicalName === criterion.biomarkerName || b.displayName === criterion.biomarkerName
            );
            if (!bm?.numericValue) return false;
            return evaluateOperator(bm.numericValue, criterion.operator, criterion.threshold);
          });
          result.status = allMet ? "achieved" : "active";
          result.achievementCriteria = g.achievementCriteria.map(c => {
            const bm = biomarkerPanel.find(b =>
              b.canonicalName === c.biomarkerName || b.displayName === c.biomarkerName
            );
            return { ...c, currentlyMet: bm ? evaluateOperator(bm.numericValue, c.operator, c.threshold) : false };
          });
        }
        return result;
      }),
      resolvedGoalIds: [],
    };
  }

  const prevMap = {};
  for (const pg of previousGoals) {
    prevMap[pg.goalId] = pg;
  }

  const newGoalIds = new Set(newGoals.map((g) => g.goalId));
  const results = [];

  for (const goal of newGoals) {
    const prev = prevMap[goal.goalId];

    if (!prev) {
      results.push({
        ...goal,
        delta: { status: "new", previousPriority: null, improvedBiomarkers: [], worsenedBiomarkers: [] },
      });
      continue;
    }

    const improved = [];
    const worsened = [];

    for (const bm of goal.biomarkerEvidence || []) {
      const prevBm = (prev.biomarkerEvidence || []).find(
        (pb) => pb.canonicalName === bm.canonicalName
      );
      if (!prevBm) continue;

      const prevDist = distanceFromOptimal({
        value: prevBm.value,
        optimalMin: prevBm.optimalMin,
        optimalMax: prevBm.optimalMax,
        referenceMin: prevBm.referenceMin,
        referenceMax: prevBm.referenceMax,
      });
      const newDist = distanceFromOptimal({
        value: bm.value,
        optimalMin: bm.optimalMin,
        optimalMax: bm.optimalMax,
        referenceMin: bm.referenceMin,
        referenceMax: bm.referenceMax,
      });

      if (prevDist == null || newDist == null) continue;

      const threshold = 0.05;
      if (newDist < prevDist - threshold) improved.push(bm.canonicalName);
      else if (newDist > prevDist + threshold) worsened.push(bm.canonicalName);
    }

    let status;
    if (improved.length > 0 && worsened.length === 0) status = "improved";
    else if (worsened.length > 0 && improved.length === 0) status = "worsened";
    else if (improved.length > 0 && worsened.length > 0) {
      status = improved.length >= worsened.length ? "improved" : "worsened";
    } else {
      status = "unchanged";
    }

    const goalWithDelta = {
      ...goal,
      delta: {
        status,
        previousPriority: prev.priority || null,
        improvedBiomarkers: improved,
        worsenedBiomarkers: worsened,
      },
    };

    // Evaluate achievement criteria against current biomarker panel
    if (goal.achievementCriteria?.length > 0 && biomarkerPanel) {
      const allMet = goal.achievementCriteria.every(criterion => {
        const bm = biomarkerPanel.find(b =>
          b.canonicalName === criterion.biomarkerName || b.displayName === criterion.biomarkerName
        );
        if (!bm?.numericValue) return false;
        return evaluateOperator(bm.numericValue, criterion.operator, criterion.threshold);
      });
      goalWithDelta.status = allMet ? "achieved" : "active";
      goalWithDelta.achievementCriteria = goal.achievementCriteria.map(c => {
        const bm = biomarkerPanel.find(b =>
          b.canonicalName === c.biomarkerName || b.displayName === c.biomarkerName
        );
        return { ...c, currentlyMet: bm ? evaluateOperator(bm.numericValue, c.operator, c.threshold) : false };
      });
    }

    results.push(goalWithDelta);
  }

  const resolvedGoalIds = Object.keys(prevMap).filter(
    (id) => !newGoalIds.has(id)
  );

  return { goals: results, resolvedGoalIds };
}

module.exports = { computeDeltas, distanceFromOptimal, evaluateOperator };
