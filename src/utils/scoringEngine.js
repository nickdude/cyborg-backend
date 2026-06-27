/**
 * Superpower Scoring Engine
 *
 * Computes category grades (A/B/C/D), critical flags, BioAge, Pace of Aging,
 * and the composite Cyborg Score from a biomarker panel.
 *
 * Based on Cyborg Scoring Engine Guide v1.0.
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const GRADE_POINTS = { A: 95, B: 80, C: 60, D: 25 }

const CATEGORY_WEIGHTS_RAW = {
  heart_vascular: 20,
  metabolic: 15,
  sex_hormones: 12,
  inflammation: 12,
  liver: 10,
  nutrients: 10,
  kidney: 8,
  thyroid: 8,
  energy: 8,
  immune: 8,
  dna_health: 7,
  body_composition: 5,
}

const TOTAL_RAW = Object.values(CATEGORY_WEIGHTS_RAW).reduce((a, b) => a + b, 0) // 123
const CATEGORY_WEIGHTS = Object.fromEntries(
  Object.entries(CATEGORY_WEIGHTS_RAW).map(([k, v]) => [k, v / TOTAL_RAW]),
)

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a lookup map from biomarker panel: canonicalName → numericValue
 */
function buildBiomarkerMap(panel) {
  const map = {}
  for (const b of panel) {
    if (b.numericValue != null) {
      map[b.canonicalName] = b.numericValue
    }
  }
  return map
}

function val(bm, key, fallback = null) {
  return bm[key] ?? fallback
}

function countOptimal(bm, panelMap, keys) {
  let optimal = 0
  let total = 0
  for (const key of keys) {
    if (bm[key] == null) continue
    total++
    const entry = panelMap.get(key)
    if (entry?.optimalFlag === 'optimal') optimal++
  }
  return { optimal, total }
}

function pctOptimal(optimal, total) {
  return total > 0 ? Math.round((optimal / total) * 100) / 100 : 0
}

function gradeResult(grade, biomarkersUsed, totalInCategory, optimalCount, totalAvailable) {
  return {
    grade,
    points: GRADE_POINTS[grade],
    pctOptimal: pctOptimal(optimalCount, totalAvailable),
    biomarkersUsed,
    totalInCategory,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CRITICAL FLAGS
// ═══════════════════════════════════════════════════════════════════════════

function checkCriticalFlags(bm, sex) {
  const flags = []

  function flag(biomarker, condition, category, threshold, direction) {
    const v = val(bm, biomarker)
    if (v != null && condition(v)) {
      flags.push({ biomarker, value: v, category, threshold, direction })
    }
  }

  // Heart & Vascular
  flag('lpa', v => v > 125, 'heart_vascular', 125, 'HIGH')
  flag('ldl', v => v > 190, 'heart_vascular', 190, 'HIGH')
  flag('apob', v => v > 130, 'heart_vascular', 130, 'HIGH')
  flag('triglycerides', v => v > 500, 'heart_vascular', 500, 'HIGH')

  // Liver
  flag('alt', v => v > 100, 'liver', 100, 'HIGH')
  flag('ast', v => v > 100, 'liver', 100, 'HIGH')
  flag('albumin', v => v < 3.0, 'liver', 3.0, 'LOW')
  flag('alp', v => v > 300, 'liver', 300, 'HIGH')

  // Kidney
  flag('egfr', v => v < 45, 'kidney', 45, 'LOW')
  flag('potassium', v => v > 6.0 || v < 3.0, 'kidney', '3.0–6.0', 'BOTH')
  flag('sodium', v => v > 150 || v < 128, 'kidney', '128–150', 'BOTH')
  flag('creatinine', v => v > 2.0, 'kidney', 2.0, 'HIGH')

  // Sex Hormones
  if (sex === 'M') {
    flag('testosterone_total', v => v < 200, 'sex_hormones', 200, 'LOW')
  }
  flag('prolactin', v => v > 50, 'sex_hormones', 50, 'HIGH')
  flag('amh', v => v < 0.5, 'sex_hormones', 0.5, 'LOW')
  flag('psa_total', v => v > 10, 'sex_hormones', 10, 'HIGH')

  // Metabolic
  flag('hba1c', v => v >= 6.5, 'metabolic', 6.5, 'HIGH')
  flag('glucose_fasting', v => v >= 126, 'metabolic', 126, 'HIGH')
  flag('insulin_fasting', v => v > 25, 'metabolic', 25, 'HIGH')

  // Nutrients
  flag('hemoglobin', v => v < 10, 'nutrients', 10, 'LOW')
  flag('ferritin', v => v < 5, 'nutrients', 5, 'LOW')
  flag('vitamin_d', v => v < 10, 'nutrients', 10, 'LOW')
  flag('vitamin_b12', v => v < 150, 'nutrients', 150, 'LOW')

  // Inflammation
  flag('hscrp', v => v > 10, 'inflammation', 10, 'HIGH')
  flag('esr', v => v > 80, 'inflammation', 80, 'HIGH')
  flag('sii', v => v > 1500, 'inflammation', 1500, 'HIGH')

  // Thyroid
  flag('tsh', v => v > 10, 'thyroid', 10, 'HIGH')
  flag('tsh', v => v < 0.1, 'thyroid', 0.1, 'LOW')
  flag('t3_free', v => v < 1.8, 'thyroid', 1.8, 'LOW')

  // Energy
  flag('cortisol', v => v < 3, 'energy', 3, 'LOW')
  flag('cortisol', v => v > 30, 'energy', 30, 'HIGH')
  flag('transferrin_saturation', v => v < 10, 'energy', 10, 'LOW')

  // Immune
  flag('wbc', v => v < 2.0, 'immune', 2.0, 'LOW')
  flag('neutrophils_abs', v => v < 0.5, 'immune', 0.5, 'LOW')

  // Body Composition
  flag('igf1', v => v > 400, 'body_composition', 400, 'HIGH')
  flag('igf1', v => v < 50, 'body_composition', 50, 'LOW')

  // DNA Health
  flag('homocysteine', v => v > 20, 'dna_health', 20, 'HIGH')
  flag('mma', v => v > 500, 'dna_health', 500, 'HIGH')
  flag('folate_rbc', v => v < 140, 'dna_health', 140, 'LOW')

  return { hasCritical: flags.length > 0, flags }
}

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORY GRADERS
// ═══════════════════════════════════════════════════════════════════════════

const CATEGORY_BIOMARKERS = {
  heart_vascular: [
    'non_hdl_cholesterol', 'hdl', 'triglycerides', 'ldl', 'cholesterol_hdl_ratio',
    'ldl_hdl_ratio', 'cholesterol_total', 'apob', 'lpa', 'ldl_particle_number',
    'small_ldl_p', 'ldl_size', 'hdl_particle_number', 'large_hdl_p', 'hdl_size',
    'large_vldl_p', 'vldl_size', 'aip', 'tg_hdl_ratio', 'nhr',
    'atherogenic_coefficient', 'ldl_total_chol_ratio', 'ldl_apob_ratio',
    'non_hdl_apob_ratio', 'non_hdl_total_chol_ratio', 'uric_acid_hdl_ratio',
    'vldl', 'adma', 'sdma',
  ],
  liver: [
    'alt', 'ast', 'alp', 'ggt', 'albumin', 'total_protein', 'globulin',
    'ag_ratio', 'bilirubin_total', 'bilirubin_direct', 'bilirubin_indirect',
    'bar', 'ggt_hdl_ratio',
  ],
  kidney: [
    'creatinine', 'bun', 'bun_creatinine_ratio', 'egfr', 'sodium', 'potassium',
    'chloride', 'co2', 'calcium', 'calcium_corrected',
  ],
  sex_hormones: [
    'testosterone_total', 'testosterone_free', 'testosterone_bioavailable', 'shbg',
    'estradiol', 'dhea_s', 'te2_ratio', 'fai', 'fsh', 'lh', 'progesterone',
    'prolactin', 'amh', 'hydroxyprogesterone_17', 'psa_total', 'psa_free',
  ],
  metabolic: [
    'glucose_fasting', 'glucose_random', 'hba1c', 'eag', 'insulin_fasting',
    'uric_acid', 'leptin', 'adiponectin', 'fructosamine', 'tyg_index', 'homa_ir',
    'phosphorus',
  ],
  nutrients: [
    'hemoglobin', 'hematocrit', 'rbc', 'mcv', 'mch', 'mchc', 'platelets', 'mpv',
    'rdw', 'rdw_mcv_ratio', 'vitamin_d', 'vitamin_b12', 'vitamin_c', 'vitamin_e',
    'vitamin_k', 'magnesium', 'selenium', 'folate', 'iron',
  ],
  inflammation: [
    'hscrp', 'esr', 'ferritin', 'sii', 'siri', 'far', 'mhr', 'car', 'plr',
  ],
  thyroid: [
    'tsh', 't4_free', 't4_total', 't3_uptake', 't7_index', 't3_free', 't3_total',
    'tpo_ab', 'tgab',
  ],
  energy: [
    'tibc', 'transferrin_saturation', 'cortisol', 'bmi',
  ],
  immune: [
    'wbc', 'neutrophils_pct', 'neutrophils_abs', 'lymphocytes_pct', 'lymphocytes_abs',
    'monocytes_pct', 'monocytes_abs', 'eosinophils_pct', 'eosinophils_abs',
    'basophils_pct', 'basophils_abs', 'nlr', 'lmr', 'mlr', 'nlpr',
    'rheumatoid_factor', 'anti_ccp', 'ana',
  ],
  body_composition: ['igf1'],
  dna_health: ['homocysteine', 'folate_rbc', 'vitamin_b6', 'mma'],
}

/**
 * Generic category grader — uses threshold-based rubrics.
 * Each category has specific A/B/C/D logic based on the Scoring Engine Guide.
 */
function gradeHeartVascular(bm, panel, critFlags) {
  const keys = CATEGORY_BIOMARKERS.heart_vascular
  const { optimal, total } = countOptimal(bm, panel, keys)
  const hasCatCritical = critFlags.some(f => f.category === 'heart_vascular')
  if (hasCatCritical) return gradeResult('D', total, keys.length, optimal, total)

  const pct = pctOptimal(optimal, total)
  if (total === 0) return gradeResult('C', 0, keys.length, 0, 0) // no data, default C

  // Grade A: ApoB < 80 AND LDL < 100 AND TG < 100 AND HDL > 60 AND ≥80% optimal
  const apob = val(bm, 'apob')
  const ldl = val(bm, 'ldl')
  const tg = val(bm, 'triglycerides')
  const hdl = val(bm, 'hdl')
  const lpa = val(bm, 'lpa')

  if (pct >= 0.80 &&
      (apob == null || apob < 80) &&
      (ldl == null || ldl < 100) &&
      (tg == null || tg < 100) &&
      (hdl == null || hdl > 60) &&
      (lpa == null || lpa < 75)) {
    return gradeResult('A', total, keys.length, optimal, total)
  }

  // Grade B: ApoB 80-90, LDL < 130, HDL ≥ 50, TG < 150
  if ((apob == null || apob <= 90) &&
      (ldl == null || ldl < 130) &&
      (hdl == null || hdl >= 50) &&
      (tg == null || tg < 150) &&
      (lpa == null || lpa < 125)) {
    return gradeResult('B', total, keys.length, optimal, total)
  }

  // Grade C: ApoB 90-110 OR LDL 130-160 OR HDL 40-50 OR TG 150-200
  if ((apob == null || apob <= 110) &&
      (ldl == null || ldl <= 160) &&
      (tg == null || tg <= 200)) {
    return gradeResult('C', total, keys.length, optimal, total)
  }

  return gradeResult('D', total, keys.length, optimal, total)
}

function gradeLiver(bm, panel, critFlags) {
  const keys = CATEGORY_BIOMARKERS.liver
  const { optimal, total } = countOptimal(bm, panel, keys)
  const hasCatCritical = critFlags.some(f => f.category === 'liver')
  if (hasCatCritical) return gradeResult('D', total, keys.length, optimal, total)
  if (total === 0) return gradeResult('C', 0, keys.length, 0, 0)

  const alt = val(bm, 'alt')
  const ast = val(bm, 'ast')
  const ggt = val(bm, 'ggt')
  const alb = val(bm, 'albumin')
  const bili = val(bm, 'bilirubin_total')
  const ag = val(bm, 'ag_ratio')

  const pct = pctOptimal(optimal, total)

  // A: ALT < 35, AST < 25, GGT < 30, Albumin 4.0-5.0, Bili < 1.0, A/G > 1.7
  if (pct >= 0.80 &&
      (alt == null || alt < 35) &&
      (ast == null || ast < 25) &&
      (ggt == null || ggt < 30) &&
      (alb == null || (alb >= 4.0 && alb <= 5.0)) &&
      (bili == null || bili < 1.0) &&
      (ag == null || ag > 1.7)) {
    return gradeResult('A', total, keys.length, optimal, total)
  }

  // B: ALT 25-40, AST 25-35, mild elevations
  if ((alt == null || alt <= 40) &&
      (ast == null || ast <= 35) &&
      (alb == null || alb >= 3.5) &&
      (bili == null || bili <= 1.2)) {
    return gradeResult('B', total, keys.length, optimal, total)
  }

  // C: ALT 40-80, AST 35-60
  if ((alt == null || alt <= 80) &&
      (ast == null || ast <= 60) &&
      (alb == null || alb >= 3.2) &&
      (bili == null || bili <= 2.0)) {
    return gradeResult('C', total, keys.length, optimal, total)
  }

  return gradeResult('D', total, keys.length, optimal, total)
}

function gradeKidney(bm, panel, critFlags) {
  const keys = CATEGORY_BIOMARKERS.kidney
  const { optimal, total } = countOptimal(bm, panel, keys)
  const hasCatCritical = critFlags.some(f => f.category === 'kidney')
  if (hasCatCritical) return gradeResult('D', total, keys.length, optimal, total)
  if (total === 0) return gradeResult('C', 0, keys.length, 0, 0)

  const egfr = val(bm, 'egfr')
  const creat = val(bm, 'creatinine')
  const bunCr = val(bm, 'bun_creatinine_ratio')
  const na = val(bm, 'sodium')
  const k = val(bm, 'potassium')
  const ca = val(bm, 'calcium')

  // A
  if ((egfr == null || egfr > 90) &&
      (na == null || (na >= 136 && na <= 142)) &&
      (k == null || (k >= 4.0 && k <= 4.5)) &&
      (ca == null || (ca >= 9.0 && ca <= 10.2)) &&
      (bunCr == null || (bunCr >= 10 && bunCr <= 15))) {
    return gradeResult('A', total, keys.length, optimal, total)
  }

  // B
  if ((egfr == null || egfr >= 75) &&
      (creat == null || creat <= 1.3)) {
    return gradeResult('B', total, keys.length, optimal, total)
  }

  // C
  if ((egfr == null || egfr >= 60) &&
      (creat == null || creat <= 1.5)) {
    return gradeResult('C', total, keys.length, optimal, total)
  }

  return gradeResult('D', total, keys.length, optimal, total)
}

function gradeSexHormones(bm, panel, critFlags, sex) {
  const keys = CATEGORY_BIOMARKERS.sex_hormones
  const { optimal, total } = countOptimal(bm, panel, keys)
  const hasCatCritical = critFlags.some(f => f.category === 'sex_hormones')
  if (hasCatCritical) return gradeResult('D', total, keys.length, optimal, total)
  if (total === 0) return gradeResult('C', 0, keys.length, 0, 0)

  const totalT = val(bm, 'testosterone_total')
  const isMale = sex === 'M'

  if (isMale) {
    if (totalT != null && totalT >= 600 && totalT <= 900) {
      return gradeResult('A', total, keys.length, optimal, total)
    }
    if (totalT != null && totalT >= 300) {
      return gradeResult('B', total, keys.length, optimal, total)
    }
    if (totalT != null && totalT >= 200) {
      return gradeResult('C', total, keys.length, optimal, total)
    }
    if (totalT != null && totalT < 200) {
      return gradeResult('D', total, keys.length, optimal, total)
    }
  } else {
    if (totalT != null && totalT >= 30 && totalT <= 70) {
      return gradeResult('A', total, keys.length, optimal, total)
    }
    if (totalT != null && totalT >= 15) {
      return gradeResult('B', total, keys.length, optimal, total)
    }
  }

  // Fallback — grade by pct optimal
  const pct = pctOptimal(optimal, total)
  if (pct >= 0.80) return gradeResult('A', total, keys.length, optimal, total)
  if (pct >= 0.60) return gradeResult('B', total, keys.length, optimal, total)
  if (pct >= 0.40) return gradeResult('C', total, keys.length, optimal, total)
  return gradeResult('D', total, keys.length, optimal, total)
}

function gradeMetabolic(bm, panel, critFlags) {
  const keys = CATEGORY_BIOMARKERS.metabolic
  const { optimal, total } = countOptimal(bm, panel, keys)
  const hasCatCritical = critFlags.some(f => f.category === 'metabolic')
  if (hasCatCritical) return gradeResult('D', total, keys.length, optimal, total)
  if (total === 0) return gradeResult('C', 0, keys.length, 0, 0)

  const glu = val(bm, 'glucose_fasting')
  const a1c = val(bm, 'hba1c')
  const ins = val(bm, 'insulin_fasting')
  const tyg = val(bm, 'tyg_index')

  // A
  if ((glu == null || (glu >= 72 && glu <= 85)) &&
      (a1c == null || a1c < 5.4) &&
      (ins == null || (ins >= 3 && ins <= 8)) &&
      (tyg == null || tyg < 8.5)) {
    return gradeResult('A', total, keys.length, optimal, total)
  }

  // B
  if ((glu == null || glu <= 100) &&
      (a1c == null || a1c <= 5.7) &&
      (ins == null || ins <= 12) &&
      (tyg == null || tyg <= 9.0)) {
    return gradeResult('B', total, keys.length, optimal, total)
  }

  // C
  if ((glu == null || glu <= 125) &&
      (a1c == null || a1c <= 6.4) &&
      (ins == null || ins <= 20)) {
    return gradeResult('C', total, keys.length, optimal, total)
  }

  return gradeResult('D', total, keys.length, optimal, total)
}

function gradeNutrients(bm, panel, critFlags) {
  const keys = CATEGORY_BIOMARKERS.nutrients
  const { optimal, total } = countOptimal(bm, panel, keys)
  const hasCatCritical = critFlags.some(f => f.category === 'nutrients')
  if (hasCatCritical) return gradeResult('D', total, keys.length, optimal, total)
  if (total === 0) return gradeResult('C', 0, keys.length, 0, 0)

  const vitD = val(bm, 'vitamin_d')
  const b12 = val(bm, 'vitamin_b12')
  const fer = val(bm, 'ferritin')
  const hgb = val(bm, 'hemoglobin')
  const rdw = val(bm, 'rdw')
  const mcv = val(bm, 'mcv')

  // A
  if ((vitD == null || (vitD >= 40 && vitD <= 60)) &&
      (b12 == null || (b12 >= 400 && b12 <= 900)) &&
      (hgb == null || hgb >= 13.0) &&
      (mcv == null || (mcv >= 82 && mcv <= 90)) &&
      (rdw == null || rdw < 13.5)) {
    return gradeResult('A', total, keys.length, optimal, total)
  }

  // B
  if ((vitD == null || vitD >= 30) &&
      (b12 == null || b12 >= 250) &&
      (hgb == null || hgb >= 12.0)) {
    return gradeResult('B', total, keys.length, optimal, total)
  }

  // C
  if ((vitD == null || vitD >= 20) &&
      (b12 == null || b12 >= 200) &&
      (hgb == null || hgb >= 10.0)) {
    return gradeResult('C', total, keys.length, optimal, total)
  }

  return gradeResult('D', total, keys.length, optimal, total)
}

function gradeInflammation(bm, panel, critFlags) {
  const keys = CATEGORY_BIOMARKERS.inflammation
  const { optimal, total } = countOptimal(bm, panel, keys)
  const hasCatCritical = critFlags.some(f => f.category === 'inflammation')
  if (hasCatCritical) return gradeResult('D', total, keys.length, optimal, total)
  if (total === 0) return gradeResult('C', 0, keys.length, 0, 0)

  const crp = val(bm, 'hscrp')
  const esr = val(bm, 'esr')
  const sii = val(bm, 'sii')
  const siri = val(bm, 'siri')

  // A
  if ((crp == null || crp < 1.0) &&
      (esr == null || esr < 10) &&
      (sii == null || sii < 500) &&
      (siri == null || siri < 1.0)) {
    return gradeResult('A', total, keys.length, optimal, total)
  }

  // B
  if ((crp == null || crp <= 2.0) &&
      (esr == null || esr <= 20) &&
      (sii == null || sii <= 700)) {
    return gradeResult('B', total, keys.length, optimal, total)
  }

  // C
  if ((crp == null || crp <= 5.0) &&
      (esr == null || esr <= 40) &&
      (sii == null || sii <= 1000)) {
    return gradeResult('C', total, keys.length, optimal, total)
  }

  return gradeResult('D', total, keys.length, optimal, total)
}

function gradeThyroid(bm, panel, critFlags) {
  const keys = CATEGORY_BIOMARKERS.thyroid
  const { optimal, total } = countOptimal(bm, panel, keys)
  const hasCatCritical = critFlags.some(f => f.category === 'thyroid')
  if (hasCatCritical) return gradeResult('D', total, keys.length, optimal, total)
  if (total === 0) return gradeResult('C', 0, keys.length, 0, 0)

  const tsh = val(bm, 'tsh')
  const ft4 = val(bm, 't4_free')
  const ft3 = val(bm, 't3_free')
  const tpoAb = val(bm, 'tpo_ab')

  // A
  if ((tsh == null || (tsh >= 1.0 && tsh <= 2.5)) &&
      (ft4 == null || (ft4 >= 1.0 && ft4 <= 1.4)) &&
      (ft3 == null || (ft3 >= 3.2 && ft3 <= 3.8)) &&
      (tpoAb == null || tpoAb < 9)) {
    return gradeResult('A', total, keys.length, optimal, total)
  }

  // B
  if ((tsh == null || (tsh >= 0.45 && tsh <= 4.5)) &&
      (ft4 == null || (ft4 >= 0.8 && ft4 <= 1.8)) &&
      (ft3 == null || (ft3 >= 2.3 && ft3 <= 4.2)) &&
      (tpoAb == null || tpoAb < 34)) {
    return gradeResult('B', total, keys.length, optimal, total)
  }

  // C: subclinical
  if ((tsh == null || (tsh >= 0.1 && tsh <= 10))) {
    return gradeResult('C', total, keys.length, optimal, total)
  }

  return gradeResult('D', total, keys.length, optimal, total)
}

function gradeEnergy(bm, panel, critFlags) {
  const keys = CATEGORY_BIOMARKERS.energy
  const { optimal, total } = countOptimal(bm, panel, keys)
  const hasCatCritical = critFlags.some(f => f.category === 'energy')
  if (hasCatCritical) return gradeResult('D', total, keys.length, optimal, total)
  if (total === 0) return gradeResult('C', 0, keys.length, 0, 0)

  const fer = val(bm, 'ferritin')
  const tsat = val(bm, 'transferrin_saturation')
  const cort = val(bm, 'cortisol')
  const bmiVal = val(bm, 'bmi')

  // A
  if ((tsat == null || (tsat >= 25 && tsat <= 40)) &&
      (cort == null || (cort >= 12 && cort <= 18)) &&
      (bmiVal == null || (bmiVal >= 20 && bmiVal <= 22))) {
    return gradeResult('A', total, keys.length, optimal, total)
  }

  // B
  if ((tsat == null || tsat >= 20) &&
      (cort == null || (cort >= 8 && cort <= 22)) &&
      (bmiVal == null || bmiVal <= 25)) {
    return gradeResult('B', total, keys.length, optimal, total)
  }

  // C
  if ((tsat == null || tsat >= 15) &&
      (bmiVal == null || bmiVal <= 30)) {
    return gradeResult('C', total, keys.length, optimal, total)
  }

  return gradeResult('D', total, keys.length, optimal, total)
}

function gradeImmune(bm, panel, critFlags) {
  const keys = CATEGORY_BIOMARKERS.immune
  const { optimal, total } = countOptimal(bm, panel, keys)
  const hasCatCritical = critFlags.some(f => f.category === 'immune')
  if (hasCatCritical) return gradeResult('D', total, keys.length, optimal, total)
  if (total === 0) return gradeResult('C', 0, keys.length, 0, 0)

  const wbc = val(bm, 'wbc')
  const nlr = val(bm, 'nlr')
  const lmr = val(bm, 'lmr')
  const neutPct = val(bm, 'neutrophils_pct')
  const lymphPct = val(bm, 'lymphocytes_pct')

  // A
  if ((wbc == null || (wbc >= 5.0 && wbc <= 8.0)) &&
      (neutPct == null || (neutPct >= 50 && neutPct <= 65)) &&
      (lymphPct == null || (lymphPct >= 25 && lymphPct <= 40)) &&
      (nlr == null || nlr < 2.0) &&
      (lmr == null || lmr > 5.0)) {
    return gradeResult('A', total, keys.length, optimal, total)
  }

  // B
  if ((wbc == null || (wbc >= 4.5 && wbc <= 11.0)) &&
      (nlr == null || nlr <= 3.0) &&
      (lmr == null || lmr >= 3.0)) {
    return gradeResult('B', total, keys.length, optimal, total)
  }

  // C
  if ((wbc == null || (wbc >= 4.0 && wbc <= 11.0)) &&
      (nlr == null || nlr <= 5.0)) {
    return gradeResult('C', total, keys.length, optimal, total)
  }

  return gradeResult('D', total, keys.length, optimal, total)
}

function gradeBodyComposition(bm, panel, critFlags) {
  const keys = CATEGORY_BIOMARKERS.body_composition
  const { optimal, total } = countOptimal(bm, panel, keys)
  const hasCatCritical = critFlags.some(f => f.category === 'body_composition')
  if (hasCatCritical) return gradeResult('D', total, keys.length, optimal, total)
  if (total === 0) return gradeResult('C', 0, keys.length, 0, 0)

  const igf = val(bm, 'igf1')

  if (igf != null && igf >= 175 && igf <= 250) return gradeResult('A', total, keys.length, optimal, total)
  if (igf != null && igf >= 100 && igf <= 300) return gradeResult('B', total, keys.length, optimal, total)
  if (igf != null && igf >= 75 && igf <= 350) return gradeResult('C', total, keys.length, optimal, total)
  return gradeResult('D', total, keys.length, optimal, total)
}

function gradeDnaHealth(bm, panel, critFlags) {
  const keys = CATEGORY_BIOMARKERS.dna_health
  const { optimal, total } = countOptimal(bm, panel, keys)
  const hasCatCritical = critFlags.some(f => f.category === 'dna_health')
  if (hasCatCritical) return gradeResult('D', total, keys.length, optimal, total)
  if (total === 0) return gradeResult('C', 0, keys.length, 0, 0)

  const hcy = val(bm, 'homocysteine')
  const b12 = val(bm, 'vitamin_b12')
  const mma = val(bm, 'mma')
  const folateS = val(bm, 'folate')

  // A
  if ((hcy == null || hcy < 8.0) &&
      (b12 == null || (b12 >= 400 && b12 <= 900)) &&
      (mma == null || mma < 200) &&
      (folateS == null || (folateS >= 10 && folateS <= 25))) {
    return gradeResult('A', total, keys.length, optimal, total)
  }

  // B
  if ((hcy == null || hcy <= 10) &&
      (b12 == null || b12 >= 250) &&
      (mma == null || mma <= 300)) {
    return gradeResult('B', total, keys.length, optimal, total)
  }

  // C
  if ((hcy == null || hcy <= 15) &&
      (b12 == null || b12 >= 200) &&
      (mma == null || mma <= 500)) {
    return gradeResult('C', total, keys.length, optimal, total)
  }

  return gradeResult('D', total, keys.length, optimal, total)
}

// Map category → grader function
const GRADERS = {
  heart_vascular: gradeHeartVascular,
  liver: gradeLiver,
  kidney: gradeKidney,
  sex_hormones: gradeSexHormones,
  metabolic: gradeMetabolic,
  nutrients: gradeNutrients,
  inflammation: gradeInflammation,
  thyroid: gradeThyroid,
  energy: gradeEnergy,
  immune: gradeImmune,
  body_composition: gradeBodyComposition,
  dna_health: gradeDnaHealth,
}

// ═══════════════════════════════════════════════════════════════════════════
// BIOAGE (PhenoAge)
// ═══════════════════════════════════════════════════════════════════════════

// Population medians (NHANES reference, healthy adults 20-60)
const BIOAGE_MEDIANS = {
  albumin: 4.2,       // g/dL
  creatinine: 0.9,    // mg/dL
  glucose: 93,        // mg/dL fasting
  hscrp: 1.5,         // mg/L
  lymphPct: 30,       // %
  mcv: 89,            // fL
  rdw: 12.8,          // %
  alp: 70,            // U/L
  wbc: 6.5,           // 10^3/µL
}

function computeBioAge(bm, chronoAge) {
  const raw = {
    albumin: val(bm, 'albumin'),
    creatinine: val(bm, 'creatinine'),
    glucose: val(bm, 'glucose_fasting') ?? val(bm, 'glucose_random'),
    hscrp: val(bm, 'hscrp'),
    lymphPct: val(bm, 'lymphocytes_pct'),
    mcv: val(bm, 'mcv'),
    rdw: val(bm, 'rdw'),
    alp: val(bm, 'alp'),
    wbc: val(bm, 'wbc'),
  }

  const available = Object.values(raw).filter(v => v != null).length
  if (available < 5) return null // too few markers for any meaningful estimate

  // Substitute population medians for missing values
  const albumin = raw.albumin ?? BIOAGE_MEDIANS.albumin
  const creatinine = raw.creatinine ?? BIOAGE_MEDIANS.creatinine
  const glucose = raw.glucose ?? BIOAGE_MEDIANS.glucose
  const hscrp = raw.hscrp ?? BIOAGE_MEDIANS.hscrp
  const lymphPct = raw.lymphPct ?? BIOAGE_MEDIANS.lymphPct
  const mcv = raw.mcv ?? BIOAGE_MEDIANS.mcv
  const rdw = raw.rdw ?? BIOAGE_MEDIANS.rdw
  const alp = raw.alp ?? BIOAGE_MEDIANS.alp
  const wbc = raw.wbc ?? BIOAGE_MEDIANS.wbc

  if (hscrp <= 0) return null // ln(0) is undefined

  let confidence = 'high'
  if (available < 9) confidence = available >= 7 ? 'medium' : 'low'

  // Step 1: Linear combination (xb)
  const xb = -19.9067
    + (-0.0336 * albumin)
    + (0.0095 * creatinine)
    + (0.1953 * (glucose / 18)) // convert mg/dL → mmol/L
    + (0.0954 * Math.log(hscrp))
    + (-0.0120 * lymphPct)
    + (0.0268 * mcv)
    + (0.3306 * rdw)
    + (0.0019 * alp)
    + (0.0554 * wbc)
    + (0.0804 * chronoAge)

  // Step 2: Mortality score (M)
  const gompertz = 0.0076927
  const M = 1 - Math.exp(-Math.exp(xb) * (Math.exp(gompertz * chronoAge) - 1) / gompertz)

  if (M <= 0 || M >= 1) return null // Out of valid range

  // Step 3: PhenoAge
  const phenoAge = 141.50 + Math.log(-0.00553 * Math.log(1 - M)) / 0.0553

  if (!isFinite(phenoAge)) return null

  // When markers are missing, blend toward chronoAge to prevent
  // median-driven extremes. With all 9 markers: 100% phenoAge.
  // With 5 markers: ~56% phenoAge + ~44% chronoAge.
  const weight = available / 9
  const blendedAge = phenoAge * weight + chronoAge * (1 - weight)

  // Clamp range scales with confidence: high=±15yr, medium=±10yr, low=±7yr
  const maxDelta = confidence === 'high' ? 15 : confidence === 'medium' ? 10 : 7
  const clampedAge = Math.max(chronoAge - maxDelta, Math.min(chronoAge + maxDelta, blendedAge))

  const delta = chronoAge - clampedAge // positive = younger
  const roundedAge = Math.round(clampedAge * 10) / 10

  let grade
  if (delta >= 5) grade = 'A'
  else if (delta >= 1) grade = 'B'
  else if (delta >= -2) grade = 'C'
  else grade = 'D'

  return {
    phenoAge: roundedAge,
    chronoAge,
    delta: Math.round(delta * 10) / 10,
    grade,
    confidence,
    markersUsed: available,
    markersTotal: 9,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PACE OF AGING (DunedinPACE Proxy)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Simplified DunedinPACE proxy using weighted z-scores.
 * Without population norm tables, we use the biomarker optimal ranges as reference.
 */
function computePaceOfAging(bm) {
  const weights = {
    hscrp: { w: 0.18, higher: true },     // higher = faster aging
    hba1c: { w: 0.15, higher: true },
    rdw: { w: 0.10, higher: true },
    albumin: { w: 0.09, higher: false },   // lower = faster aging
    wbc: { w: 0.07, higher: true },
    tyg_index: { w: 0.08, higher: true },
  }

  // Simple reference midpoints for z-score approximation
  const refs = {
    hscrp: { mean: 1.5, sd: 1.5 },
    hba1c: { mean: 5.4, sd: 0.5 },
    rdw: { mean: 13.0, sd: 1.0 },
    albumin: { mean: 4.3, sd: 0.4 },
    wbc: { mean: 6.5, sd: 2.0 },
    tyg_index: { mean: 8.5, sd: 0.5 },
  }

  let weightedSum = 0
  let totalWeight = 0

  for (const [biomarker, config] of Object.entries(weights)) {
    const v = val(bm, biomarker)
    if (v == null) continue

    const ref = refs[biomarker]
    let z = (v - ref.mean) / ref.sd
    if (!config.higher) z = -z // Invert for protective markers

    // Clamp each marker's z-score so a single extreme or mis-unit value
    // (e.g. WBC reported in /µL) cannot dominate / blow up the proxy.
    z = Math.max(-3, Math.min(3, z))

    weightedSum += config.w * z
    totalWeight += config.w
  }

  if (totalWeight === 0) return null

  // Normalize and shift to mean = 1.0
  const pace = 1.0 + (weightedSum / totalWeight) * 0.12 // SD ≈ 0.12
  // Clamp to a physiologically plausible DunedinPACE range as a final guard.
  const clampedPace = Math.max(0.5, Math.min(1.75, pace))
  const roundedPace = Math.round(clampedPace * 100) / 100

  let grade
  if (roundedPace < 0.85) grade = 'A'
  else if (roundedPace <= 0.99) grade = 'B'
  else if (roundedPace <= 1.12) grade = 'C'
  else grade = 'D'

  return { pace: roundedPace, grade }
}

// ═══════════════════════════════════════════════════════════════════════════
// CYBORG SCORE (MASTER COMPOSITE)
// ═══════════════════════════════════════════════════════════════════════════

function computeCyborgScore(categoryGrades, criticalResult, bioAge, panel) {
  // Step 1: Base score = weighted sum of category points
  let baseScore = 0
  for (const [cat, gradeData] of Object.entries(categoryGrades)) {
    const weight = CATEGORY_WEIGHTS[cat] || 0
    baseScore += gradeData.points * weight
  }

  // Step 2: Modifiers
  let modifiers = 0

  // Optimal density bonus: >80% of all tested biomarkers in optimal
  const testedBiomarkers = panel.filter(b => b.numericValue != null)
  const optimalBiomarkers = testedBiomarkers.filter(b => b.optimalFlag === 'optimal')
  if (testedBiomarkers.length > 0 && (optimalBiomarkers.length / testedBiomarkers.length) > 0.80) {
    modifiers += 3
  }

  // BioAge bonus: up to +3 if ≥5yr younger
  if (bioAge && bioAge.delta >= 5) {
    modifiers += Math.min(3, Math.floor(bioAge.delta - 4)) // 5yr=+1, 6yr=+2, 7yr+=+3
  }

  // Step 3: Final score
  let finalScore = Math.max(0, Math.min(100, Math.round(baseScore + modifiers)))

  // Step 4: Critical flag cap
  if (criticalResult.hasCritical) {
    finalScore = Math.min(finalScore, 70)
  }

  // Grade
  let grade
  if (finalScore >= 90) grade = 'A'
  else if (finalScore >= 70) grade = 'B'
  else if (finalScore >= 50) grade = 'C'
  else grade = 'D'

  return {
    base: Math.round(baseScore),
    modifiers: {
      optimalDensity: (testedBiomarkers.length > 0 && (optimalBiomarkers.length / testedBiomarkers.length) > 0.80) ? 3 : 0,
      bioAge: bioAge?.delta >= 5 ? Math.min(3, Math.floor(bioAge.delta - 4)) : 0,
      trend: 0, // requires previous report — not implemented yet
    },
    criticalCap: criticalResult.hasCritical,
    final: finalScore,
    grade,
    testedCount: testedBiomarkers.length,
    optimalCount: optimalBiomarkers.length,
    optimalPct: testedBiomarkers.length > 0
      ? Math.round((optimalBiomarkers.length / testedBiomarkers.length) * 100)
      : 0,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MASTER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute all scores for a report.
 *
 * @param {Array} biomarkerPanel - Full biomarker panel from buildFullBiomarkerPanel()
 * @param {Object} userContext - { dateOfBirth, sex } from User model + onboarding
 * @returns {Object} Complete scores object for ReportData.scores
 */
function computeScores(biomarkerPanel, userContext = {}) {
  const bm = buildBiomarkerMap(biomarkerPanel)

  // Build panel Map once for O(1) lookups in countOptimal
  const panelMap = new Map()
  for (const b of biomarkerPanel) {
    panelMap.set(b.canonicalName, b)
  }

  // Normalize sex: accept 'Male', 'male', 'M', 'm', 'Female', etc.
  const rawSex = (userContext.sex || '').toString().trim().toUpperCase()
  const sex = rawSex.startsWith('M') ? 'M' : rawSex.startsWith('F') ? 'F' : null

  // Chronological age
  let chronoAge = null
  if (userContext.dateOfBirth) {
    const dob = new Date(userContext.dateOfBirth)
    const now = new Date()
    chronoAge = (now - dob) / (365.25 * 24 * 60 * 60 * 1000)
    chronoAge = Math.round(chronoAge * 10) / 10
  }

  // 1. Critical flags
  const criticalResult = checkCriticalFlags(bm, sex)

  // 2. Category grades
  const categoryGrades = {}
  for (const [cat, graderFn] of Object.entries(GRADERS)) {
    if (cat === 'sex_hormones') {
      categoryGrades[cat] = graderFn(bm, panelMap, criticalResult.flags, sex)
    } else {
      categoryGrades[cat] = graderFn(bm, panelMap, criticalResult.flags)
    }
  }

  // 3. BioAge
  const bioAge = chronoAge ? computeBioAge(bm, chronoAge) : null

  // 4. Pace of Aging
  const paceOfAging = computePaceOfAging(bm)

  // 5. Cyborg Score
  const cyborgScore = computeCyborgScore(categoryGrades, criticalResult, bioAge, biomarkerPanel)

  return {
    categoryGrades,
    criticalFlags: criticalResult.flags,
    hasCriticalFlags: criticalResult.hasCritical,
    cyborgScore,
    bioAge,
    paceOfAging,
    computedAt: new Date(),
  }
}

module.exports = { computeScores, checkCriticalFlags, computeBioAge, computePaceOfAging };
