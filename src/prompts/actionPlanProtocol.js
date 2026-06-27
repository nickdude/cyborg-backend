/**
 * Action Plan Protocol Generator
 *
 * Takes patient context, detected goals, protocol items from templates,
 * and scores to generate a personalized protocol (lifestyle, nutrition,
 * supplements, diagnostic tests) and next steps.
 */

const { generateText, extractJSON: aiExtractJSON } = require("../providers/ai");

const SYSTEM_PROMPT = `You are a clinical health protocol designer generating personalized protocol recommendations for a health optimization app. You produce structured JSON protocols based on a patient's biomarker data, detected health issues, and personal context.

RULES:
- Never prescribe medications — supplements and lifestyle changes only
- Priority order: sleep > exercise > stress > nutrition > supplements > testing
- Supplements: only include those from the provided protocol items list
- AMINO9 (Essential Amino Acids) is a foundational supplement: whenever it appears in the provided protocol items list, ALWAYS include it in the supplements array
- Diagnostic tests: include follow-up tests for High-priority issues, optional for Medium
- All recommendations must reference specific biomarker findings from the patient data
- Keep items concise: 1-2 sentences each
- Sleep items: 3-5 recommendations
- Exercise items: 3-5 recommendations
- Stress items: 2-3 recommendations
- Nutrition items: 4-6 recommendations
- Supplements: generate for each protocol item provided (whatItIs, whyItMatters personalized to patient, howToTake)
- Diagnostic tests: 1-3 tests
- followUpTimeline: High issues = 6-8 weeks, Medium = 3 months, Low = 6 months. Use shortest if mixed.
- Checklist: 3-5 concrete actionable items the patient should do immediately
- Text: 2-3 sentence paragraph about scheduling follow-up and tracking progress
- For each supplement in the protocol.supplements array, include a timing field: morning_fasted, with_breakfast, pre_workout, with_dinner, bedtime, with_food, or anytime
- Generate a clinicalThesis: a 5-10 word title and 3-5 sentence reasoning explaining WHY these interventions work together for THIS patient
- Generate 3-4 checkpoints at Week 4, 8, 12 (add Week 16 if any High-priority goals). Each checkpoint has a label, description, and 2-4 target biomarker values
- Generate 2-4 clinical watchOuts based on the patient's conditions + supplement/lifestyle interactions. Include risk, mitigation action, and severity (info/warning/critical)
- Map ALL supplement items to a dailySchedule with 5 circadian slots: morningFasted, withBreakfast, preWorkout, withDinner, bedtime. Each item has productName, dose, and a 1-sentence reason
- Generate a 12-week trainingProtocol with 2-3 phases, each with specific exercises (name, sets, reps, cue). Include zone2 cardio, warmUp, and coolDown
- Biomarker targets in checkpoints should use evidence-based improvement rates (e.g., LDL drops ~15-25% in 8-12 weeks with statin alternatives)

OUTPUT FORMAT:
Return ONLY valid JSON matching the schema below. No markdown, no explanation, no code fences.`;

function buildUserPrompt({ patientContext, goals, protocolItems, scores, previousProtocol }) {
  const goalSummaries = goals.map((g) => ({
    goalId: g.goalId,
    title: g.title,
    priority: g.priority,
    category: g.category,
    keyBiomarkers: (g.biomarkerEvidence || []).slice(0, 5).map((bm) => ({
      name: bm.name,
      value: bm.value,
      unit: bm.unit,
      flag: bm.flag,
    })),
  }));

  const protocolItemsList = protocolItems.map((pi) => ({
    productName: pi.productName,
    dosing: pi.dosing,
    triggerBiomarkers: pi.triggerBiomarkers,
  }));

  let prompt = `Generate a personalized health protocol and next steps for this patient.

PATIENT CONTEXT:
${JSON.stringify(patientContext, null, 2)}

DETECTED HEALTH ISSUES (goals):
${JSON.stringify(goalSummaries, null, 2)}

SUPPLEMENT PROTOCOL ITEMS TO INCLUDE:
${JSON.stringify(protocolItemsList, null, 2)}

SCORES:
${JSON.stringify(scores || {}, null, 2)}`;

  if (previousProtocol) {
    prompt += `

PREVIOUS PROTOCOL (for continuity — note what changed):
${JSON.stringify(previousProtocol, null, 2)}`;
  }

  prompt += `

Return a JSON object with this exact structure:
{
  "protocol": {
    "lifestyle": {
      "sleep": [{ "text": "specific recommendation" }],
      "exercise": [{ "text": "specific recommendation" }],
      "stress": [{ "text": "specific recommendation" }]
    },
    "nutrition": [{ "text": "specific recommendation" }],
    "supplements": [
      {
        "name": "Product Name with dose",
        "dose": "dosing instruction",
        "timing": "morning_fasted | with_breakfast | pre_workout | with_dinner | bedtime | with_food | anytime",
        "whatItIs": "1-2 sentence description",
        "whyItMatters": "1-2 sentence explanation personalized to patient's biomarkers",
        "howToTake": "1-2 sentence timing and practical instruction"
      }
    ],
    "diagnosticTests": [
      {
        "name": "Test Name",
        "whatItIs": "1-2 sentence description",
        "whyTestIt": "1-2 sentence personalized reason based on patient's data"
      }
    ]
  },
  "nextSteps": {
    "followUpTimeline": "Re-test in X weeks/months",
    "text": "2-3 sentence guidance about follow-up and tracking progress",
    "checklist": [{ "text": "specific actionable item" }]
  },
  "clinicalThesis": {
    "title": "string — 5-10 word thesis name",
    "reasoning": "string — 3-5 sentences explaining WHY"
  },
  "checkpoints": [
    {
      "weekNumber": 4,
      "label": "string — milestone name",
      "description": "string — 1-2 sentence primary goal for this phase",
      "targetBiomarkers": [{ "name": "string", "currentValue": 0, "targetValue": 0, "unit": "string" }]
    }
  ],
  "watchOuts": [
    { "title": "string", "risk": "string", "mitigation": "string", "severity": "warning|critical|info" }
  ],
  "dailySchedule": {
    "morningFasted": [{ "productName": "string", "dose": "string", "reason": "string" }],
    "withBreakfast": [{ "productName": "string", "dose": "string", "reason": "string" }],
    "preWorkout": [{ "productName": "string", "dose": "string", "reason": "string" }],
    "withDinner": [{ "productName": "string", "dose": "string", "reason": "string" }],
    "bedtime": [{ "productName": "string", "dose": "string", "reason": "string" }]
  },
  "trainingProtocol": {
    "goal": "string",
    "weeklySchedule": "string",
    "phases": [{
      "phaseNumber": 1,
      "weeks": "1-4",
      "focus": "string",
      "tempo": "string",
      "rest": "string",
      "days": [{
        "dayLabel": "string",
        "focus": "string",
        "exercises": [{ "name": "string", "sets": 3, "reps": "10-12", "cue": "string" }]
      }]
    }],
    "zone2": { "protocol": "string", "intensity": "string", "options": ["string"], "reasoning": "string" },
    "warmUp": ["string"],
    "coolDown": ["string"]
  }
}

Return ONLY the JSON. No markdown fences, no explanation.`;

  return prompt;
}

function validateProtocolResult(result) {
  const errors = [];
  if (!result || typeof result !== "object") {
    errors.push("Result must be an object");
    return errors;
  }
  if (!result.protocol) errors.push("Missing 'protocol' field");
  if (!result.nextSteps) errors.push("Missing 'nextSteps' field");
  if (result.protocol) {
    if (!result.protocol.lifestyle) errors.push("Missing 'protocol.lifestyle'");
    if (!Array.isArray(result.protocol.nutrition))
      errors.push("'protocol.nutrition' must be an array");
    if (!Array.isArray(result.protocol.supplements))
      errors.push("'protocol.supplements' must be an array");
  }
  return errors;
}

async function generateProtocol({ patientContext, goals, protocolItems, scores, previousProtocol }) {
  const userPrompt = buildUserPrompt({
    patientContext,
    goals,
    protocolItems,
    scores,
    previousProtocol,
  });

  const maxRetries = 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const promptToUse =
        attempt === 0
          ? userPrompt
          : `Your previous response had invalid JSON. Please fix and return ONLY valid JSON.\n\n${userPrompt}`;

      const rawOutput = await generateText({
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: promptToUse,
        maxTokens: 16384,
        // Low temperature for a strict, schema-constrained JSON task — reduces
        // variance and improves validation pass rate vs. the provider default (1.0).
        temperature: 0.3,
      });

      const parsed = aiExtractJSON(rawOutput);
      if (!parsed) {
        console.warn(`[ActionPlanProtocol] Attempt ${attempt + 1}: Failed to parse JSON`);
        continue;
      }

      const errors = validateProtocolResult(parsed);
      if (errors.length > 0) {
        console.warn(`[ActionPlanProtocol] Attempt ${attempt + 1} validation errors:`, errors);
        if (attempt < maxRetries) continue;
      }

      return {
        protocol: parsed.protocol || {},
        nextSteps: parsed.nextSteps || {},
        clinicalThesis: parsed.clinicalThesis || { title: "", reasoning: "" },
        checkpoints: parsed.checkpoints || [],
        watchOuts: parsed.watchOuts || [],
        dailySchedule: parsed.dailySchedule || {},
        trainingProtocol: parsed.trainingProtocol || {},
      };
    } catch (error) {
      console.error(`[ActionPlanProtocol] Attempt ${attempt + 1} error:`, error.message);
      if (attempt === maxRetries) throw error;
    }
  }

  console.warn("[ActionPlanProtocol] All attempts failed, returning empty protocol");
  return {
    protocol: {
      lifestyle: { sleep: [], exercise: [], stress: [] },
      nutrition: [],
      supplements: [],
      diagnosticTests: [],
    },
    nextSteps: {
      followUpTimeline: "Re-test in 3 months",
      text: "Schedule a follow-up blood panel to track your progress.",
      checklist: [],
    },
    clinicalThesis: { title: "", reasoning: "" },
    checkpoints: [],
    watchOuts: [],
    dailySchedule: {},
    trainingProtocol: {},
  };
}

module.exports = { generateProtocol };
