/**
 * Mock AI Service for testing
 * Generates realistic action plans with configurable delay
 */

const generateMockActionPlan = async (delayMs = 5000) => {
  // Simulate AI processing time
  await new Promise((resolve) => setTimeout(resolve, delayMs));

  return {
    summary:
      "Based on your latest bloodwork, this personalized action plan focuses on optimizing your metabolic health, improving cardiovascular fitness, and enhancing recovery protocols.",
    recommendations: [
      {
        title: "Nutrition & Supplementation",
        items: [
          "Increase protein intake to 1.8-2.2g per kg of body weight, prioritizing lean sources",
          "Add 3-4 servings of fatty fish weekly for omega-3 fatty acids (EPA/DHA: 2-3g daily)",
          "Implement intermittent fasting 2x per week with 16:8 protocol for metabolic flexibility",
          "Supplement with: Magnesium glycinate (400mg), Vitamin D3 (4000 IU), and Zinc (15mg daily)",
          "Reduce refined carbohydrates; prioritize complex carbs with high fiber content",
          "Stay hydrated: minimum 3-4 liters of water daily, increase during training days",
        ],
      },
      {
        title: "Training & Movement",
        items: [
          "3x per week resistance training (full-body or upper/lower split) focusing on compound lifts",
          "2x per week zone 2 cardio (130-150 BPM) for 30-45 minutes to build aerobic base",
          "1x per week high-intensity interval training (HIIT) session: 6-8 rounds of 30s hard / 90s easy",
          "Daily mobility work: 10-15 minutes of stretching and foam rolling, focusing on hip flexors and thoracic spine",
          "Progressive overload: increase weight or reps by 2-5% every 2 weeks",
          "Avoid overtraining; ensure at least 1-2 complete rest days per week",
        ],
      },
      {
        title: "Recovery & Sleep Optimization",
        items: [
          "Target 7.5-8.5 hours of sleep nightly with consistent bedtime (±30 minutes variance)",
          "Finish last meal 3 hours before bed; avoid caffeine after 2 PM",
          "Implement evening wind-down routine: dim lights, no screens 60 minutes before bed",
          "Consider magnesium supplementation 1-2 hours before sleep for sleep quality",
          "Keep bedroom cool (65-68°F), dark, and free from distractions",
          "Morning sun exposure for 15-30 minutes to regulate circadian rhythm",
          "Active recovery: light yoga, swimming, or walking on non-training days",
        ],
      },
      {
        title: "Stress Management & Mental Health",
        items: [
          "Practice meditation or mindfulness for 10-15 minutes daily (app suggestions: Calm, Headspace)",
          "Regular breathwork: Box breathing (4-4-4-4) for stress reduction, 5 minutes daily",
          "Limit cortisol spikes: avoid excessive caffeine and late-night work sessions",
          "Schedule 2-3 social activities per week for mental well-being",
          "Consider journaling: 5-10 minutes daily to process emotions and set intentions",
        ],
      },
      {
        title: "Lab Follow-up & Monitoring",
        items: [
          "Retest bloodwork in 8-12 weeks to measure progress",
          "Key biomarkers to track: Cholesterol profile, glucose, HbA1C, inflammation markers (CRP, homocysteine)",
          "Schedule annual comprehensive health assessment including cardiovascular screening",
          "Consider continuous glucose monitor (CGM) for 2-4 weeks to understand dietary impacts",
        ],
      },
    ],
    timeline: {
      week1to2: "Establish baseline habits and sleep routine; start resistance training",
      week3to4: "Optimize nutrition; introduce HIIT and recovery protocols",
      week5to8: "Progressive overload in training; reassess energy and recovery",
      week9to12: "Consolidate gains; prepare for follow-up bloodwork",
    },
    keyMetrics: {
      progressMarkers: [
        "Improved sleep quality and morning energy",
        "Increased strength (weight lifted or reps completed)",
        "Better recovery between sessions",
        "Sustained energy throughout the day",
      ],
      checkInFrequency: "Bi-weekly self-assessment; bloodwork at 12 weeks",
    },
  };
};

module.exports = { generateMockActionPlan };
