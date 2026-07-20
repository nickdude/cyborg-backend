/**
 * Goal Generator (Layer 2)
 *
 * Maps detected issues to goal templates, deduplicates (multiple issues
 * can feed the same goal), ranks by priority, and produces goal skeletons
 * ready for narrative generation.
 *
 * Algorithm:
 * 1. For each detected issue, activate its relatedGoals
 * 2. Deduplicate — same goal from multiple issues merges into one card
 * 3. Goal priority = max priority of contributing issues
 * 4. Rank: High first, then by sum of contributing priority scores
 * 5. Cap at 8 goals
 * 6. Filter protocol items by contraindications
 */

const { GOAL_TEMPLATES } = require("../data/goalTemplates")

const MAX_GOALS = 8

/**
 * Check if a user is taking a medication that matches a contraindication list.
 */
function hasContraindication(contraindications, onboardingData) {
  if (!contraindications) return false

  const userMeds = (onboardingData?.medications || []).map(m => String(m).toLowerCase())
  const userAllergies = (onboardingData?.allergies || []).map(a => String(a).toLowerCase())
  const userSupplements = (onboardingData?.supplements || []).map(s => String(s).toLowerCase())

  // Check medication contraindications
  if (contraindications.medications) {
    for (const med of contraindications.medications) {
      const medLower = med.toLowerCase()
      if (userMeds.some(m => m.includes(medLower) || medLower.includes(m))) {
        return true
      }
    }
  }

  // Check allergy contraindications
  if (contraindications.allergies) {
    for (const allergy of contraindications.allergies) {
      const allergyLower = allergy.toLowerCase()
      if (userAllergies.some(a => a.includes(allergyLower) || allergyLower.includes(a))) {
        return true
      }
    }
  }

  return false
}

/**
 * Check if a protocol item's trigger biomarkers are actually flagged for this user.
 */
function hasTriggerBiomarker(triggerBiomarkers, biomarkerMap) {
  if (!triggerBiomarkers || triggerBiomarkers.length === 0) return true // no filter = always show

  for (const name of triggerBiomarkers) {
    const bm = biomarkerMap[name]
    if (bm && (bm.optimalFlag === 'suboptimal' || bm.flag === 'high' || bm.flag === 'low' ||
               bm.flag === 'critical_high' || bm.flag === 'critical_low')) {
      return true
    }
  }
  return false
}

/**
 * Check if user is already taking a supplement.
 */
function isAlreadyTaking(productName, onboardingData) {
  const supplements = (onboardingData?.supplements || []).map(s => String(s).toLowerCase())
  const prodLower = productName.toLowerCase()
  return supplements.some(s => s.includes(prodLower) || prodLower.includes(s))
}

/**
 * Check if user's stated goals align with a goal template's keywords.
 */
function computeGoalAlignment(template, onboardingData) {
  const keywords = template.goalAlignmentKeywords || []
  const userGoals = [
    ...(onboardingData?.goals || []),
    ...(onboardingData?.focusAreas || []),
  ].map(g => String(g).toLowerCase())

  for (const keyword of keywords) {
    if (userGoals.some(g => g.includes(keyword.toLowerCase()))) {
      return true
    }
  }
  return false
}

/**
 * Generate goal cards from detected issues.
 *
 * @param {Array} detectedIssues - Output from issueDetector.detectIssues()
 * @param {Object} onboardingData - User.onboardingData
 * @param {Array} biomarkerPanel - Full biomarker panel for protocol item filtering
 * @returns {Array} Goal skeletons sorted by priority, capped at MAX_GOALS
 */
function generateGoals(detectedIssues, onboardingData, biomarkerPanel) {
  // Build biomarker lookup for protocol item filtering
  const biomarkerMap = {}
  for (const bm of (biomarkerPanel || [])) {
    biomarkerMap[bm.canonicalName] = bm
  }

  // Build goal template lookup
  const goalTemplateLookup = {}
  for (const tmpl of GOAL_TEMPLATES) {
    goalTemplateLookup[tmpl.goalId] = tmpl
  }

  // Step 1 + 2: Map issues to goals, dedup/merge
  const goalMap = {} // goalId → { template, contributingIssues, allBiomarkers, maxPriority, sumPriority }

  for (const issue of detectedIssues) {
    for (const goalId of issue.relatedGoals) {
      const template = goalTemplateLookup[goalId]
      if (!template) continue

      if (!goalMap[goalId]) {
        goalMap[goalId] = {
          template,
          contributingIssues: [],
          allBiomarkers: [],
          allSymptoms: [],
          maxPriorityScore: 0,
          maxPriority: 'Low',
          sumPriority: 0,
          goalAligned: computeGoalAlignment(template, onboardingData),
        }
      }

      const goal = goalMap[goalId]
      goal.contributingIssues.push({
        issueId: issue.issueId,
        title: issue.title,
        priorityScore: issue.priorityScore,
        priority: issue.priority,
      })

      // Merge biomarkers (deduplicate by canonicalName)
      const existingNames = new Set(goal.allBiomarkers.map(b => b.canonicalName))
      for (const bm of issue.biomarkers) {
        if (!existingNames.has(bm.canonicalName)) {
          goal.allBiomarkers.push(bm)
          existingNames.add(bm.canonicalName)
        }
      }

      // Merge symptoms across contributing issues (dedupe by label, reported wins)
      const symIndex = new Map(goal.allSymptoms.map(s => [s.label.toLowerCase(), s]))
      for (const s of (issue.symptoms || [])) {
        const key = s.label.toLowerCase()
        const existing = symIndex.get(key)
        if (!existing) {
          symIndex.set(key, s)
          goal.allSymptoms.push(s)
        } else if (existing.source === 'associated' && s.source === 'reported') {
          existing.source = 'reported' // upgrade
        }
      }

      // Track priority
      if (issue.priorityScore > goal.maxPriorityScore) {
        goal.maxPriorityScore = issue.priorityScore
        goal.maxPriority = issue.priority
      }
      goal.sumPriority += issue.priorityScore
    }
  }

  // Step 3: Build goal skeletons
  let goals = Object.values(goalMap).map(({ template, contributingIssues, allBiomarkers, allSymptoms, maxPriorityScore, maxPriority, sumPriority, goalAligned }) => {
    // Filter protocol items by contraindications and trigger biomarkers
    const filteredProtocol = (template.protocolItems || [])
      .filter(item => !hasContraindication(item.contraindications, onboardingData))
      .filter(item => hasTriggerBiomarker(item.triggerBiomarkers, biomarkerMap))
      .map(item => ({
        productName: item.productName,
        dosing: item.dosing,
        alreadyTaking: isAlreadyTaking(item.productName, onboardingData),
      }))
      .filter(item => !item.alreadyTaking) // exclude if already taking

    // Sort biomarkers: most out-of-range first (critical > high/low > suboptimal)
    const flagOrder = { critical_high: 0, critical_low: 0, high: 1, low: 1 }
    allBiomarkers.sort((a, b) => {
      const aOrder = flagOrder[a.flag] ?? 2
      const bOrder = flagOrder[b.flag] ?? 2
      return aOrder - bOrder
    })

    return {
      goalId: template.goalId,
      title: template.title,
      priority: maxPriority,
      priorityScore: maxPriorityScore,
      sumPriority,
      healthImpact: template.healthImpact,
      category: template.category,
      recoveryTimeWeeks: template.recoveryTimeWeeks,
      biomarkersToImprove: allBiomarkers.slice(0, 8), // cap at 8 most relevant
      protocolItems: filteredProtocol,
      symptoms: [...allSymptoms]
        .sort((a, b) => (b.source === 'reported' ? 1 : 0) - (a.source === 'reported' ? 1 : 0))
        .slice(0, 6),
      contributingIssues: contributingIssues.map(i => i.title),
      goalAligned,
    }
  })

  // Step 4: Rank goals
  const priorityOrder = { High: 0, Medium: 1, Low: 2 }
  goals.sort((a, b) => {
    // Primary: priority tier
    const tierDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
    if (tierDiff !== 0) return tierDiff

    // Secondary: goal-aligned goals first within same tier
    if (a.goalAligned !== b.goalAligned) return a.goalAligned ? -1 : 1

    // Tertiary: sum of contributing issue priority scores
    return b.sumPriority - a.sumPriority
  })

  // Step 5: Cap at MAX_GOALS
  goals = goals.slice(0, MAX_GOALS)

  // Remove internal sorting fields
  return goals.map(({ sumPriority, priorityScore, goalAligned, ...rest }) => rest)
}

module.exports = { generateGoals, hasContraindication };
