/**
 * Glucose Scoring Service
 *
 * Converts a predicted glucose spike (delta mg/dL) into a 1-10 score
 * with a human-readable label.
 */

/**
 * @param {number} predictedPeakDelta - Predicted blood glucose rise in mg/dL
 * @returns {{ score: number, label: string }}
 */
function computeGlucoseScore(predictedPeakDelta) {
  const delta = Math.abs(predictedPeakDelta || 0);

  if (delta < 15) return { score: 10, label: "Flat response" };
  if (delta < 20) return { score: 9, label: "Minimal spike" };
  if (delta < 25) return { score: 8, label: "Minimal spike" };
  if (delta < 30) return { score: 7, label: "Moderate spike" };
  if (delta < 40) return { score: 6, label: "Moderate spike" };
  if (delta < 50) return { score: 5, label: "Significant spike" };
  if (delta < 60) return { score: 4, label: "Significant spike" };
  if (delta < 70) return { score: 3, label: "Large spike" };
  if (delta < 80) return { score: 2, label: "Large spike" };
  return { score: 1, label: "Severe spike" };
}

module.exports = { computeGlucoseScore };
