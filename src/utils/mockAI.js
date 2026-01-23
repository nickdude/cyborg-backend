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

const generateChatResponse = async (message, patientId, patientName) => {
  const messageLower = message.toLowerCase();

  // Simulate AI thinking time
  await new Promise((resolve) => setTimeout(resolve, 800));

  // Sample knowledge base for patient insights
  const responses = {
    // Biomarkers questions
    biomarker: `
Based on the patient's biomarkers, I can see some important insights:

**Strong Points:**
- Excellent cholesterol profile (LDL: 49 mg/dL, Total: 112 mg/dL)
- Great glycemic control (HbA1c: 5.2%, Fasting glucose: 85 mg/dL)
- Very low systemic inflammation (ESR: 2 mm/hr)
- Normal blood counts across all CBC parameters

**Areas of Concern:**
- Biological age estimate of 33 years suggests lifestyle factors offsetting good biomarkers
- Sleep quality and daily smoking need intervention

**Recommendations:**
1. Focus on sleep quality improvement (CBT-I recommended)
2. Smoking cessation support (offer pharmacotherapy + behavioral)
3. Increase physical activity (sedentary pattern concerning)
4. Monitor diabetes risk given family history despite current normal labs
    `,

    // Risk questions
    risk:
      `The patient has several modifiable risk factors to address:\n\n1. **High Priority:**\n   - Daily smoking (even <5/day increases cardiovascular risk)\n   - Severe sleep disturbance (impacts immunity and cardiometabolic health)\n   - Possible malnutrition (weight extremely low for height)\n\n2. **Medium Priority:**\n   - Sedentary lifestyle (0-1x/week exercise)\n   - Conflicting diabetes history (needs clarification and monitoring)\n\nAll of these are highly modifiable with proper intervention and support.`,

    // Sleep questions
    sleep: `Sleep is a critical issue for this patient. Current status:\n- Duration: 6-7 hours/night (below ideal 8-9 hours)\n- Quality: "Very poor - severe insomnia/unrestful"\n\nRecommended interventions:\n1. **CBT-I (Cognitive Behavioral Therapy for Insomnia)** - First-line treatment\n2. **Sleep hygiene optimization:**\n   - Consistent sleep schedule (even weekends)\n   - Cool bedroom (60-67°F)\n   - No screens 1 hour before bed\n   - Avoid nicotine 2-3 hours before sleep\n\n3. **Supplement support:**\n   - Magnesium glycinate 200-400mg nightly (helps with relaxation)\n\n4. **Behavioral techniques:**\n   - Sleep restriction therapy\n   - Stimulus control\n   - Relaxation training`,

    // Smoking questions
    smoking:
      `Smoking cessation is critical for this patient:\n\n**Health Impact:**\n- Increases cardiovascular disease risk 2-4x\n- Impairs sleep quality and causes overnight withdrawal\n- Increases inflammation and platelet activation\n- Interacts negatively with diabetes/prediabetes risk\n\n**Recommended Approach:**\n1. **Assess readiness** to quit using 1-10 scale\n2. **Pharmacotherapy options:**\n   - Nicotine replacement therapy (patch + gum/lozenge)\n   - Varenicline (Chantix) or Bupropion (Zyban)\n3. **Behavioral support:**\n   - Identify triggers (after meals, stress, coding sessions)\n   - Create replacement activities (walk, tea, deep breathing)\n   - Delay technique: wait 10 minutes when craving hits\n\n**Timeline:** Set quit date within 2-4 weeks`,

    // Exercise questions
    exercise:
      `Current status: Sedentary (0-1x/week) - this needs intervention.\n\n**Progressive 12-Week Plan:**\n\n**Weeks 1-2: Foundation**\n- 10-15 minutes daily brisk walking\n- Break up sitting every 30-60 minutes\n- Add 1,500 steps/day to baseline\n\n**Weeks 3-8: Build Strength**\n- 2x/week strength training (20-30 min)\n- Focus: squats, hip hinge, push, pull, carry, core\n- Progressive overload: increase reps first, then load\n\n**Weeks 5-12: Add Cardio**\n- Target 150 min/week moderate cardio\n- Add 10-15 min per week\n- 1x/week HIIT after establishing consistency\n\n**Key: Start low, progress slow - avoid injury and burnout**`,

    // Weight questions
    weight: `⚠️ **Critical Issue:** Recorded weight of 59 lbs at 5'10" is severely underweight.\n\n**Immediate Action:**\n1. **Verify weight** - could be data entry error (lbs vs kg)\n2. If accurate, this suggests:\n   - Severe malnutrition risk\n   - Possible GI disease, malabsorption, or eating disorder\n   - Urgent in-person medical evaluation needed\n\n**If confirmed low weight - Restoration Plan:**\n1. Gradual weight gain: 0.25-0.5 kg/week\n2. Increased calorie intake with high protein\n3. Resistance training to build lean mass\n4. Screen for underlying causes (GI, endocrine, infection)\n5. Nutrition assessment recommended\n\n**Next Step:** Confirm accurate weight immediately`,

    // Family history
    family: `The patient reports family history of diabetes/blood sugar issues:\n\n**Current Status:**\n- Despite family risk, current labs are favorable:\n  - HbA1c: 5.2% (normal, <5.6%)\n  - Fasting glucose: 85 mg/dL (normal)\n  - eAG: 102.54 mg/dL\n\n**However, uncertainty exists:**\n- Self-reported "high diabetic" and diabetes/prediabetes history\n- May indicate prior prediabetes now improved\n- Or intermittent dysglycemia not captured by single test\n\n**Recommended Monitoring:**\n1. Quarterly HbA1c and fasting glucose\n2. Consider fasting insulin + HOMA-IR to assess insulin resistance\n3. Lifestyle interventions (exercise, weight, sleep) reduce risk significantly\n4. Watch for symptoms: increased thirst, fatigue, vision changes`,

    // Default response
    default: `I'm here to help you understand ${patientName}'s health profile. I can answer questions about:\n\n📊 **Biomarkers & Lab Results** - Explain any value or trend\n⚠️ **Risk Factors** - Priority issues to address\n😴 **Sleep & Lifestyle** - Recommendations for improvement\n🚭 **Smoking Cessation** - Support strategies\n💪 **Exercise Plans** - Progressive fitness guidance\n⚖️ **Weight & Nutrition** - Restoration or optimization\n👨‍👩‍👧‍👦 **Family History** - Risk assessment\n💊 **Supplements** - Evidence-based recommendations\n\nWhat would you like to know more about?`,
  };

  // Match user input to category
  let response = responses.default;

  if (
    messageLower.includes("biomarker") ||
    messageLower.includes("lab") ||
    messageLower.includes("value") ||
    messageLower.includes("hemoglobin") ||
    messageLower.includes("glucose") ||
    messageLower.includes("cholesterol")
  ) {
    response = responses.biomarker;
  } else if (
    messageLower.includes("risk") ||
    messageLower.includes("concern") ||
    messageLower.includes("danger")
  ) {
    response = responses.risk;
  } else if (
    messageLower.includes("sleep") ||
    messageLower.includes("insomnia") ||
    messageLower.includes("rest")
  ) {
    response = responses.sleep;
  } else if (
    messageLower.includes("smoke") ||
    messageLower.includes("smoking") ||
    messageLower.includes("cigarette") ||
    messageLower.includes("nicotine")
  ) {
    response = responses.smoking;
  } else if (
    messageLower.includes("exercise") ||
    messageLower.includes("activity") ||
    messageLower.includes("fitness") ||
    messageLower.includes("cardio") ||
    messageLower.includes("strength")
  ) {
    response = responses.exercise;
  } else if (
    messageLower.includes("weight") ||
    messageLower.includes("underweight") ||
    messageLower.includes("nutrition")
  ) {
    response = responses.weight;
  } else if (
    messageLower.includes("family") ||
    messageLower.includes("diabetes") ||
    messageLower.includes("history")
  ) {
    response = responses.family;
  }

  return response.trim();
};

module.exports = { generateMockActionPlan, generateChatResponse };
