/**
 * Goal Narrative Generator (Layer 3)
 *
 * Takes goal skeletons + patient context, makes a single AI call to generate
 * personalized narrative text for all goals, validates the returned JSON,
 * and retries with correction prompt if invalid (max 2 retries).
 */

const { generateText, extractJSON: aiExtractJSON } = require("../providers/ai")

// ─── Prompt Construction ────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a clinical health analyst generating personalized goal narratives for a health companion app. Your task is to write patient-specific narrative sections for health Goal Cards.

RULES:
- Always cite at least 2 specific biomarker values from the patient's data in each narrative
- Never diagnose — use "your data suggests" or "this pattern is associated with"
- Never prescribe — say "discuss with your clinician" for any medication
- Lead with what's working well in the summary, then address concerns
- Recovery time is always a range with "with consistent adherence to the recommended actions"
- Medical referral actions written urgently but not alarmingly
- recommendedActions ordered: Medical care first (if needed), then Dietary, Exercise, Lifestyle, Supplementation
- Maximum 3 recommendedActions per goal
- Keep summary to 2-3 sentences
- Keep whatThisMeans to 3-5 sentences
- Keep potentialCauses to 2-4 sentences
- For each goal, generate 1-3 achievementCriteria based on the primary biomarkers. These define when the goal is considered achieved. Also generate biomarkerTargets with realistic target values and expected timeline.

OUTPUT FORMAT:
Return ONLY a valid JSON array. No markdown, no explanation, no code fences. Just the raw JSON array.`

function buildUserPrompt(goalSkeletons, patientContext) {
  return `Generate personalized narratives for the following health goals.

PATIENT CONTEXT:
${JSON.stringify(patientContext, null, 2)}

GOAL SKELETONS (generate narratives for each):
${JSON.stringify(goalSkeletons, null, 2)}

Return a JSON array with one object per goal. Each object must have exactly these fields:
[
  {
    "goalId": "the exact goalId from the skeleton",
    "summary": "2-3 sentence personalized summary citing specific biomarker values",
    "whatThisMeans": "3-5 sentence clinical explanation with patient-specific numbers",
    "potentialCauses": "2-4 sentence root cause analysis referencing patient's diet, lifestyle, genetics",
    "recommendedActions": [
      { "number": 1, "label": "Action category name", "detail": "Specific personalized action text" }
    ],
    "achievementCriteria": [
      { "biomarkerName": "string — canonical biomarker name", "operator": "< or <= or > or >=", "threshold": 0 }
    ],
    "biomarkerTargets": [
      { "canonicalName": "string", "targetValue": 0, "targetDate": "Week 12" }
    ]
  }
]

Return ONLY the JSON array. No markdown fences, no explanation.`
}

function buildCorrectionPrompt(rawOutput, errors) {
  return `Your previous response had invalid JSON. Here are the errors:
${errors.join('\n')}

Here is your raw output:
${rawOutput.slice(0, 3000)}

Please correct it and return ONLY a valid JSON array matching the schema above. No markdown, no explanation.`
}

// ─── AI Call ────────────────────────────────────────────────────────────────

async function callAI(systemPrompt, userPrompt) {
  return generateText({ systemPrompt, userPrompt })
}

// ─── JSON Extraction ────────────────────────────────────────────────────────

function extractJSON(text) {
  // For arrays, try bracket extraction first (aiExtractJSON looks for {} objects)
  let cleaned = text.trim()
  const fenceMatch = cleaned.match(/```(?:json)?\n?([\s\S]*?)\n?```/)
  if (fenceMatch) cleaned = fenceMatch[1].trim()

  const arrStart = cleaned.indexOf('[')
  const arrEnd = cleaned.lastIndexOf(']')
  if (arrStart !== -1 && arrEnd > arrStart) {
    try {
      return JSON.parse(cleaned.slice(arrStart, arrEnd + 1))
    } catch (e) { /* fall through */ }
  }

  // Fall back to shared extractor (handles objects, markdown fences, etc.)
  return aiExtractJSON(cleaned)
}

function validateNarratives(parsed, expectedGoalIds) {
  const errors = []

  if (!Array.isArray(parsed)) {
    errors.push('Response is not a JSON array')
    return errors
  }

  if (parsed.length !== expectedGoalIds.length) {
    errors.push(`Expected ${expectedGoalIds.length} goals but got ${parsed.length}`)
  }

  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i]
    const prefix = `Goal[${i}]`

    if (!item.goalId || typeof item.goalId !== 'string') {
      errors.push(`${prefix}: missing or invalid goalId`)
    } else if (!expectedGoalIds.includes(item.goalId)) {
      errors.push(`${prefix}: goalId "${item.goalId}" does not match any expected goal (${expectedGoalIds.join(', ')})`)
    }

    if (!item.summary || typeof item.summary !== 'string') {
      errors.push(`${prefix}: missing or invalid summary`)
    }
    if (!item.whatThisMeans || typeof item.whatThisMeans !== 'string') {
      errors.push(`${prefix}: missing or invalid whatThisMeans`)
    }
    if (!item.potentialCauses || typeof item.potentialCauses !== 'string') {
      errors.push(`${prefix}: missing or invalid potentialCauses`)
    }
    if (!Array.isArray(item.recommendedActions)) {
      errors.push(`${prefix}: missing or invalid recommendedActions array`)
    } else {
      for (let j = 0; j < item.recommendedActions.length; j++) {
        const action = item.recommendedActions[j]
        if (typeof action.number !== 'number') errors.push(`${prefix}.recommendedActions[${j}]: missing number`)
        if (!action.label || typeof action.label !== 'string') errors.push(`${prefix}.recommendedActions[${j}]: missing label`)
        if (!action.detail || typeof action.detail !== 'string') errors.push(`${prefix}.recommendedActions[${j}]: missing detail`)
      }
    }
  }

  return errors
}

// ─── Fallback Narratives ────────────────────────────────────────────────────

function generateFallbackNarratives(goalSkeletons) {
  return goalSkeletons.map(goal => {
    const biomarkerText = goal.biomarkersToImprove
      .slice(0, 3)
      .map(b => `${b.name}: ${b.value} ${b.unit}`)
      .join(', ')

    return {
      goalId: goal.goalId,
      summary: `Based on your lab results, this area needs attention. Key markers: ${biomarkerText}. Work with your healthcare team to address this.`,
      whatThisMeans: `Your biomarker values in this area are outside the optimal range. ${biomarkerText}. This may impact your overall health and energy levels. Addressing these markers through lifestyle changes and targeted supplementation can help bring them into a healthier range.`,
      potentialCauses: `Out-of-range values in this area can be influenced by diet, exercise habits, sleep quality, stress levels, and genetic factors. Your specific combination of markers suggests a pattern that is addressable with the right interventions.`,
      recommendedActions: [
        { number: 1, label: 'Medical care', detail: 'Discuss these results with your healthcare provider to determine the best course of action.' },
        { number: 2, label: 'Lifestyle modification', detail: 'Focus on improving diet quality, regular exercise, and sleep optimization to support your biomarker improvement.' },
        { number: 3, label: 'Follow-up testing', detail: 'Retest these markers in 8-12 weeks to track your progress and adjust your protocol as needed.' },
      ],
      achievementCriteria: [],
      biomarkerTargets: [],
    }
  })
}

// ─── Main Export ─────────────────────────────────────────────────────────────

const MAX_RETRIES = 2

/**
 * Generate AI narratives for goal skeletons.
 *
 * @param {Array} goalSkeletons - Output from goalGenerator.generateGoals()
 * @param {Object} patientContext - { name, age, sex, conditions, medications, allergies,
 *                                    diet, exercise, sleep, goals, familyHistory, superpowerScore, bioAge }
 * @returns {Array} Narrative objects: [{ goalId, summary, whatThisMeans, potentialCauses, recommendedActions }]
 */
async function generateNarratives(goalSkeletons, patientContext) {
  if (!goalSkeletons || goalSkeletons.length === 0) return []

  const expectedGoalIds = goalSkeletons.map(g => g.goalId)
  const userPrompt = buildUserPrompt(goalSkeletons, patientContext)

  let lastRawOutput = ''
  let lastErrors = []

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const prompt = attempt === 0
        ? userPrompt
        : buildCorrectionPrompt(lastRawOutput, lastErrors)

      console.log(`[GoalNarrative] AI call attempt ${attempt + 1}/${MAX_RETRIES + 1}`)

      const rawOutput = await callAI(SYSTEM_PROMPT, prompt)
      lastRawOutput = rawOutput

      const parsed = extractJSON(rawOutput)
      const errors = validateNarratives(parsed, expectedGoalIds)

      if (errors.length === 0) {
        console.log(`[GoalNarrative] Valid JSON received on attempt ${attempt + 1}`)
        return parsed.map(item => ({
          ...item,
          achievementCriteria: item.achievementCriteria || [],
          biomarkerTargets: item.biomarkerTargets || [],
        }))
      }

      console.warn(`[GoalNarrative] Validation errors on attempt ${attempt + 1}:`, errors)
      lastErrors = errors
    } catch (err) {
      console.error(`[GoalNarrative] Error on attempt ${attempt + 1}:`, err.message)
      lastErrors = [`Parse/call error: ${err.message}`]
    }
  }

  // All retries exhausted — fall back to template narratives
  console.warn('[GoalNarrative] All retries exhausted, using fallback narratives')
  return generateFallbackNarratives(goalSkeletons)
}

module.exports = { generateNarratives }
