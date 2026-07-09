/**
 * Issue Detection Engine (Layer 1)
 *
 * Scans a patient's biomarker panel, onboarding data, and wearable data
 * against the Issue Template Library. Computes a Detection Confidence Score
 * (DCS) for each template and returns detected issues with priority scores.
 *
 * DCS = (labSignal × 0.50) + (questionnaire × 0.25) + (wearable × 0.15) + (symptom × 0.10)
 * Issue detected when DCS >= template.threshold
 *
 * Priority = basePriority × severityMultiplier × memberRelevanceMultiplier
 */

const { ISSUE_TEMPLATES } = require("../data/issueTemplates")

// ─── Helpers ────────────────────────────────────────────────────────────────

// Common alias → canonical name mappings for reports that use non-standard names
const BIOMARKER_ALIASES = {
  hemoglobin_a1c: 'hba1c',
  glycated_hemoglobin: 'hba1c',
  a1c: 'hba1c',
  ldl_cholesterol: 'ldl',
  ldl_c: 'ldl',
  hdl_cholesterol: 'hdl',
  hdl_c: 'hdl',
  crp: 'hscrp',
  c_reactive_protein: 'hscrp',
  hs_crp: 'hscrp',
  vitamin_d_25oh: 'vitamin_d',
  '25_oh_vitamin_d': 'vitamin_d',
  vitamin_d_25_oh: 'vitamin_d',
  glucose_fasting: 'fasting_glucose',
  fasting_blood_glucose: 'fasting_glucose',
  apob: 'apolipoprotein_b',
  apo_b: 'apolipoprotein_b',
  lpa: 'lipoprotein_a',
  lp_a: 'lipoprotein_a',
  total_testosterone: 'testosterone_total',
  insulin_fasting: 'fasting_insulin',
}

/**
 * Build a lookup map: canonicalName → { numericValue, flag, optimalFlag, unit, ... }
 * Indexes by both original name and known aliases for robust matching.
 */
function buildBiomarkerLookup(biomarkerPanel) {
  const map = {}
  for (const b of biomarkerPanel) {
    const name = b.canonicalName
    map[name] = b
    // Also index by the canonical alias if this name is a known alias
    const alias = BIOMARKER_ALIASES[name]
    if (alias && !map[alias]) {
      map[alias] = b
    }
  }
  // Reverse: also map canonical names to aliases so templates using either form work
  for (const [alias, canonical] of Object.entries(BIOMARKER_ALIASES)) {
    if (map[canonical] && !map[alias]) {
      map[alias] = map[canonical]
    }
    if (map[alias] && !map[canonical]) {
      map[canonical] = map[alias]
    }
  }
  return map
}

/**
 * Normalize onboarding data into a flat, lowercased structure for matching.
 */
function normalizeOnboarding(onboardingData) {
  if (!onboardingData) return { conditions: [], familyHistory: [], symptoms: [], medications: [], diet: '', goals: [], focusAreas: [], sex: null, weight: null, height: null }

  // Safely coerce to array — onboarding fields can be strings, arrays, or missing
  const toArray = (val) => {
    if (!val) return []
    if (Array.isArray(val)) return val
    if (typeof val === 'string') return val.split(/[,;]+/).map(s => s.trim()).filter(Boolean)
    return []
  }
  const lower = (val) => toArray(val).map(s => String(s).toLowerCase().trim())

  return {
    conditions: lower(onboardingData.conditions),
    familyHistory: lower(onboardingData.familyHistory),
    symptoms: lower(onboardingData.symptoms),
    medications: lower(onboardingData.medications),
    supplements: lower(onboardingData.supplements),
    diet: String(onboardingData.diet || '').toLowerCase().trim(),
    goals: lower(onboardingData.goals),
    focusAreas: lower(onboardingData.focusAreas),
    sex: onboardingData.sex ? String(onboardingData.sex).toUpperCase().charAt(0) : null,
    weight: onboardingData.weight ? parseFloat(onboardingData.weight) : null,
    height: onboardingData.height ? parseFloat(onboardingData.height) : null,
  }
}

/**
 * Compute average wearable metrics from last 30 days of data.
 */
function aggregateWearables(wearableData) {
  if (!wearableData || wearableData.length === 0) return null

  const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
  const vals = (field) => wearableData.map(d => d.metrics?.[field]).filter(v => v != null)
  const nested = (field, sub) => wearableData.map(d => d.metrics?.[field]?.[sub]).filter(v => v != null)

  return {
    avgSteps: avg(vals('steps')),
    avgRestingHR: avg(nested('heartRate', 'resting')),
    avgHRV: avg(vals('hrv')),
    avgSleepHours: avg(nested('sleep', 'totalHours')),
    hasData: true,
  }
}

// ─── Scoring Functions ──────────────────────────────────────────────────────

/**
 * Compute lab signal score (0.0–1.0) for a single issue template.
 */
function computeLabScore(template, bmLookup) {
  let primaryScore = 0
  let primaryFound = false

  // Score primary biomarkers
  for (const name of template.primaryBiomarkers) {
    const bm = bmLookup[name]
    if (!bm || bm.numericValue == null) continue
    primaryFound = true

    const thresholds = template.labThresholds[name]
    if (!thresholds) continue

    const val = bm.numericValue

    // "High is bad" thresholds (optimalMax / normalMax / critical)
    if (thresholds.optimalMax != null) {
      if (thresholds.critical != null && val >= thresholds.critical) {
        primaryScore = Math.max(primaryScore, 1.0)
      } else if (thresholds.normalMax != null && val > thresholds.normalMax) {
        primaryScore = Math.max(primaryScore, 0.8)
      } else if (val > thresholds.optimalMax) {
        primaryScore = Math.max(primaryScore, 0.5)
      }
    }

    // "Low is bad" thresholds (optimalMin / normalMin / criticalMin)
    if (thresholds.optimalMin != null) {
      if (thresholds.criticalMin != null && val <= thresholds.criticalMin) {
        primaryScore = Math.max(primaryScore, 1.0)
      } else if (thresholds.normalMin != null && val < thresholds.normalMin) {
        primaryScore = Math.max(primaryScore, 0.8)
      } else if (val < thresholds.optimalMin) {
        primaryScore = Math.max(primaryScore, 0.5)
      }
    }
  }

  // If no primary biomarkers found and template doesn't use BMI, score is 0
  if (!primaryFound && !template.useBMI) return 0

  // Score supporting biomarkers (+0.1 each, capped)
  let supportBonus = 0
  for (const name of (template.supportingBiomarkers || [])) {
    const bm = bmLookup[name]
    if (!bm || bm.numericValue == null) continue
    // Any out-of-optimal supporting marker adds +0.1
    if (bm.optimalFlag === 'suboptimal' || bm.flag === 'high' || bm.flag === 'low' ||
        bm.flag === 'critical_high' || bm.flag === 'critical_low') {
      supportBonus += 0.1
    }
  }

  return Math.min(primaryScore + supportBonus, 1.0)
}

/**
 * Compute questionnaire context score (0.0–1.0).
 */
function computeQuestionnaireScore(template, onboarding) {
  let score = 0
  const flags = template.questionnaireFlags
  if (!flags) return 0

  // Symptom matches from questionnaire (+0.25 each, max +0.5)
  let symptomBonus = 0
  for (const symptom of (flags.symptoms || [])) {
    if (onboarding.symptoms.some(s => s.includes(symptom) || symptom.includes(s))) {
      symptomBonus += 0.25
    }
  }
  score += Math.min(symptomBonus, 0.5)

  // Diet flag match (+0.2)
  for (const diet of (flags.dietFlags || [])) {
    if (onboarding.diet.includes(diet)) {
      score += 0.2
      break
    }
  }

  // Condition flag match (+0.2)
  for (const condition of (flags.conditions || [])) {
    if (onboarding.conditions.some(c => c.includes(condition) || condition.includes(c))) {
      score += 0.2
      break
    }
  }

  // Family history match (+0.1)
  for (const fh of (flags.familyHistory || [])) {
    if (onboarding.familyHistory.some(h => h.includes(fh) || fh.includes(h))) {
      score += 0.1
      break
    }
  }

  // Medication depletion flag (+0.2)
  for (const med of (flags.medications || [])) {
    if (onboarding.medications.some(m => m.includes(med) || med.includes(m))) {
      score += 0.2
      break
    }
  }

  return Math.min(score, 1.0)
}

/**
 * Compute wearable signal score (0.0–1.0).
 * Defaults to 0.5 if no wearable data connected.
 */
function computeWearableScore(template, wearableAgg) {
  if (!wearableAgg || !wearableAgg.hasData) return 0.5  // neutral if no wearable

  const signals = template.wearableSignals
  if (!signals || Object.keys(signals).length === 0) return 0.5

  let score = 0

  if (signals.resting_hr_above && wearableAgg.avgRestingHR > signals.resting_hr_above) {
    score += 0.2
  }
  if (signals.hrv_below && wearableAgg.avgHRV != null && wearableAgg.avgHRV < signals.hrv_below) {
    score += 0.2
  }
  if (signals.steps_below && wearableAgg.avgSteps != null && wearableAgg.avgSteps < signals.steps_below) {
    score += 0.2
  }
  if (signals.sleep_below && wearableAgg.avgSleepHours != null && wearableAgg.avgSleepHours < signals.sleep_below) {
    score += 0.2
  }
  // resting_hr_below (for hypothyroidism)
  if (signals.resting_hr_below && wearableAgg.avgRestingHR != null && wearableAgg.avgRestingHR < signals.resting_hr_below) {
    score += 0.2
  }

  return Math.min(score, 1.0)
}

/**
 * Compute symptom match score (0.0–1.0).
 */
function computeSymptomScore(template, onboarding) {
  const matches = template.symptomMatches
  if (!matches) return 0

  // Check perfect matches first
  for (const symptom of (matches.perfect || [])) {
    if (onboarding.symptoms.some(s => s.includes(symptom) || symptom.includes(s))) {
      return 1.0
    }
  }

  // Check partial matches
  for (const symptom of (matches.partial || [])) {
    if (onboarding.symptoms.some(s => s.includes(symptom) || symptom.includes(s))) {
      return 0.5
    }
  }

  return 0
}

/**
 * Sentence-case a raw symptom token for display, e.g. "brain fog" → "Brain fog".
 */
function humanizeSymptom(s) {
  const t = String(s || "").trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t
}

/**
 * Collect the humanized symptoms associated with an issue template, tagging each
 * as "reported" when it matches the patient's onboarding symptoms, else "associated".
 * De-duplicated by label; reported wins over associated.
 */
function collectIssueSymptoms(template, onboarding) {
  const raw = [
    ...(template.symptomMatches?.perfect || []),
    ...(template.symptomMatches?.partial || []),
    ...(template.questionnaireFlags?.symptoms || []),
  ]
  const seen = new Map() // lowerLabel → { label, source }
  for (const s of raw) {
    const key = String(s).toLowerCase().trim()
    if (!key) continue
    const reported = onboarding.symptoms.some(u => u.includes(key) || key.includes(u))
    if (!seen.has(key) || reported) {
      seen.set(key, { label: humanizeSymptom(key), source: reported ? "reported" : "associated" })
    }
  }
  return [...seen.values()]
}

/**
 * Compute severity multiplier from biomarker flags.
 */
function computeSeverityMultiplier(template, bmLookup) {
  let maxSeverity = 1.0

  for (const name of template.primaryBiomarkers) {
    const bm = bmLookup[name]
    if (!bm) continue

    if (bm.flag === 'critical_high' || bm.flag === 'critical_low') {
      maxSeverity = Math.max(maxSeverity, 2.0)
    } else if (bm.flag === 'high' || bm.flag === 'low') {
      maxSeverity = Math.max(maxSeverity, 1.5)
    }
  }

  return maxSeverity
}

/**
 * Compute member relevance multiplier based on goal alignment, symptoms, family history.
 */
function computeMemberRelevance(template, onboarding) {
  let multiplier = 1.0

  // Goal alignment: check if user's stated goals match this issue's category
  const goalKeywords = {
    cardiovascular: ['heart', 'cardiovascular', 'cholesterol', 'longevity', 'heart health'],
    metabolic: ['weight', 'lose weight', 'diabetes', 'blood sugar', 'metabolic'],
    sex_hormones: ['hormonal', 'hormones', 'libido', 'testosterone', 'energy'],
    thyroid: ['thyroid', 'energy', 'metabolism'],
    nutrients: ['energy', 'fatigue', 'vitamins', 'nutrients'],
    inflammation: ['inflammation', 'joint pain', 'recovery', 'longevity'],
    liver: ['liver', 'detox'],
    kidney: ['kidney'],
    body_composition: ['weight', 'lose weight', 'build muscle', 'body composition'],
    energy: ['energy', 'fatigue'],
  }

  const categoryKeywords = goalKeywords[template.category] || []
  const userGoals = [...onboarding.goals, ...onboarding.focusAreas]

  for (const keyword of categoryKeywords) {
    if (userGoals.some(g => g.includes(keyword))) {
      multiplier *= 1.3
      break
    }
  }

  // Symptom confirmation
  const allSymptoms = [
    ...(template.symptomMatches?.perfect || []),
    ...(template.symptomMatches?.partial || []),
  ]
  for (const symptom of allSymptoms) {
    if (onboarding.symptoms.some(s => s.includes(symptom) || symptom.includes(s))) {
      multiplier *= 1.2
      break
    }
  }

  // Family history
  for (const fh of (template.questionnaireFlags?.familyHistory || [])) {
    if (onboarding.familyHistory.some(h => h.includes(fh) || fh.includes(h))) {
      multiplier *= 1.1
      break
    }
  }

  return multiplier
}

/**
 * Compute BMI from onboarding weight (kg) and height (cm).
 */
function computeBMI(onboarding) {
  if (!onboarding.weight || !onboarding.height) return null
  const heightM = onboarding.height / 100
  if (heightM <= 0) return null
  return onboarding.weight / (heightM * heightM)
}

// ─── Main Detection Function ────────────────────────────────────────────────

/**
 * Detect issues by running all templates against patient data.
 *
 * @param {Array} biomarkerPanel - Array of normalized biomarker objects from ReportData
 * @param {Object} onboardingData - User.onboardingData (raw from MongoDB)
 * @param {Array} wearableData - Array of WearableData documents (last 30 days)
 * @returns {Array} Detected issues sorted by priority score descending
 */
function detectIssues(biomarkerPanel, onboardingData, wearableData) {
  const bmLookup = buildBiomarkerLookup(biomarkerPanel)
  const onboarding = normalizeOnboarding(onboardingData)
  const wearableAgg = aggregateWearables(wearableData)
  const bmi = computeBMI(onboarding)

  const detectedIssues = []

  for (const template of ISSUE_TEMPLATES) {
    // Sex filter: skip if template is sex-specific and doesn't match
    if (template.sexFilter && onboarding.sex && onboarding.sex !== template.sexFilter) {
      continue
    }

    // BMI-based templates: check BMI threshold
    if (template.useBMI) {
      if (!bmi || bmi < (template.bmiThreshold || 30)) continue
    }

    // Compute DCS components
    const labScore = computeLabScore(template, bmLookup)
    const qScore = computeQuestionnaireScore(template, onboarding)
    const wScore = computeWearableScore(template, wearableAgg)
    const sScore = computeSymptomScore(template, onboarding)

    // Adaptive DCS: redistribute unused weight to lab when other signals are absent
    const hasOnboarding = Object.keys(onboarding).length > 2
    const hasWearable = wearableAgg && Object.keys(wearableAgg).length > 0
    let labWeight = 0.50
    let qWeight = 0.25
    let wWeight = 0.15
    let sWeight = 0.10
    if (!hasOnboarding && !hasWearable) {
      labWeight = 1.0
      qWeight = 0
      wWeight = 0
      sWeight = 0
    } else if (!hasWearable) {
      labWeight = 0.65
      qWeight = 0.25
      wWeight = 0
      sWeight = 0.10
    }

    const dcs = (labScore * labWeight) + (qScore * qWeight) + (wScore * wWeight) + (sScore * sWeight)

    // Check threshold
    if (dcs < template.threshold) continue

    // Compute priority score
    const severityMult = computeSeverityMultiplier(template, bmLookup)
    const relevanceMult = computeMemberRelevance(template, onboarding)
    const rawPriority = template.basePriority * severityMult * relevanceMult
    const priorityScore = Math.min(Math.round(rawPriority), 100)

    // Determine priority tier
    let priority
    if (priorityScore >= 70) priority = 'High'
    else if (priorityScore >= 40) priority = 'Medium'
    else priority = 'Low'

    // Collect biomarker data for this issue
    const allBiomarkers = [...template.primaryBiomarkers, ...template.supportingBiomarkers]
    const biomarkers = []
    for (const name of allBiomarkers) {
      const bm = bmLookup[name]
      if (!bm || bm.numericValue == null) continue
      biomarkers.push({
        name: bm.displayName || bm.canonicalName,
        canonicalName: bm.canonicalName,
        value: bm.numericValue,
        unit: bm.unit || '',
        flag: bm.flag,
        optimalFlag: bm.optimalFlag,
        optimalMin: bm.optimalMin,
        optimalMax: bm.optimalMax,
        referenceMin: bm.referenceMin,
        referenceMax: bm.referenceMax,
      })
    }

    detectedIssues.push({
      issueId: template.issueId,
      title: template.title,
      category: template.category,
      dcs: Math.round(dcs * 100) / 100,
      priorityScore,
      priority,
      biomarkers,
      symptoms: collectIssueSymptoms(template, onboarding),
      relatedGoals: template.relatedGoals,
    })
  }

  // Sort by priority score descending
  detectedIssues.sort((a, b) => b.priorityScore - a.priorityScore)

  return detectedIssues
}

module.exports = { detectIssues };
