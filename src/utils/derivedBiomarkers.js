/**
 * Derived Biomarker Calculator
 *
 * Computes ~30 derived/calculated biomarkers from direct lab values.
 * Based on Superpower Scoring Engine Guide + Biomarker Reference Ranges.
 *
 * Each derived biomarker has a formula that references other canonical biomarker names.
 * If the required inputs are missing, the derived value is skipped (returns null).
 */

const { CANONICAL_MAP, determineFlag, determineOptimalFlag } = require("./labNormalizer")

/**
 * Helper: get a biomarker's numeric value from the normalized tests map.
 */
function get(biomarkerMap, canonicalName) {
  const entry = biomarkerMap.get(canonicalName)
  return entry?.numericValue ?? null
}

/**
 * Round to N decimal places.
 */
function round(val, decimals = 2) {
  if (val == null) return null
  return Math.round(val * 10 ** decimals) / 10 ** decimals
}

/**
 * All derived biomarker definitions.
 * Each entry: { canonicalName, requires: [...inputs], denominators?: [...], compute: (map) => number|null }
 * `denominators` lists inputs that must be non-zero (division positions).
 */
const DERIVED_DEFINITIONS = [
  // ── Heart & Vascular Ratios ─────────────────────────────────────────────
  {
    canonicalName: 'non_hdl_cholesterol',
    requires: ['cholesterol_total', 'hdl'],
    compute: m => round(get(m, 'cholesterol_total') - get(m, 'hdl')),
  },
  {
    canonicalName: 'cholesterol_hdl_ratio',
    requires: ['cholesterol_total', 'hdl'],
    denominators: ['hdl'],
    compute: m => round(get(m, 'cholesterol_total') / get(m, 'hdl')),
  },
  {
    canonicalName: 'ldl_hdl_ratio',
    requires: ['ldl', 'hdl'],
    denominators: ['hdl'],
    compute: m => round(get(m, 'ldl') / get(m, 'hdl')),
  },
  {
    canonicalName: 'aip',
    requires: ['triglycerides', 'hdl'],
    denominators: ['hdl'],
    compute: m => {
      // AIP = log10(TG/HDL-C) — both in mg/dL, convert to mmol/L first
      const tg = get(m, 'triglycerides') / 88.57 // mg/dL → mmol/L
      const hdl = get(m, 'hdl') / 38.67          // mg/dL → mmol/L
      if (tg <= 0 || hdl <= 0) return null
      return round(Math.log10(tg / hdl), 3)
    },
  },
  {
    canonicalName: 'tg_hdl_ratio',
    requires: ['triglycerides', 'hdl'],
    denominators: ['hdl'],
    compute: m => round(get(m, 'triglycerides') / get(m, 'hdl')),
  },
  {
    canonicalName: 'atherogenic_coefficient',
    requires: ['cholesterol_total', 'hdl'],
    denominators: ['hdl'],
    compute: m => round((get(m, 'cholesterol_total') - get(m, 'hdl')) / get(m, 'hdl')),
  },
  {
    canonicalName: 'ldl_total_chol_ratio',
    requires: ['ldl', 'cholesterol_total'],
    denominators: ['cholesterol_total'],
    compute: m => round(get(m, 'ldl') / get(m, 'cholesterol_total')),
  },
  {
    canonicalName: 'ldl_apob_ratio',
    requires: ['ldl', 'apob'],
    denominators: ['apob'],
    compute: m => round(get(m, 'ldl') / get(m, 'apob')),
  },
  {
    canonicalName: 'non_hdl_apob_ratio',
    requires: ['cholesterol_total', 'hdl', 'apob'],
    denominators: ['apob'],
    compute: m => round((get(m, 'cholesterol_total') - get(m, 'hdl')) / get(m, 'apob')),
  },
  {
    canonicalName: 'non_hdl_total_chol_ratio',
    requires: ['cholesterol_total', 'hdl'],
    denominators: ['cholesterol_total'],
    compute: m => round((get(m, 'cholesterol_total') - get(m, 'hdl')) / get(m, 'cholesterol_total')),
  },
  {
    canonicalName: 'uric_acid_hdl_ratio',
    requires: ['uric_acid', 'hdl'],
    denominators: ['hdl'],
    compute: m => round(get(m, 'uric_acid') / (get(m, 'hdl') / 10)),
  },
  {
    canonicalName: 'nhr',
    requires: ['neutrophils_abs', 'hdl'],
    denominators: ['hdl'],
    compute: m => round(get(m, 'neutrophils_abs') / (get(m, 'hdl') / 10)),
  },

  // ── Liver Derived ───────────────────────────────────────────────────────
  {
    canonicalName: 'globulin',
    requires: ['total_protein', 'albumin'],
    compute: m => round(get(m, 'total_protein') - get(m, 'albumin'), 1),
  },
  {
    canonicalName: 'ag_ratio',
    requires: ['total_protein', 'albumin'],
    compute: m => {
      const globulin = get(m, 'total_protein') - get(m, 'albumin')
      return globulin > 0 ? round(get(m, 'albumin') / globulin) : null
    },
  },
  {
    canonicalName: 'bilirubin_indirect',
    requires: ['bilirubin_total', 'bilirubin_direct'],
    compute: m => round(get(m, 'bilirubin_total') - get(m, 'bilirubin_direct'), 1),
  },
  {
    canonicalName: 'bar',
    requires: ['bilirubin_total', 'albumin'],
    denominators: ['albumin'],
    compute: m => round(get(m, 'bilirubin_total') / get(m, 'albumin'), 3),
  },
  {
    canonicalName: 'ggt_hdl_ratio',
    requires: ['ggt', 'hdl'],
    denominators: ['hdl'],
    compute: m => round(get(m, 'ggt') / get(m, 'hdl')),
  },

  // ── Kidney Derived ──────────────────────────────────────────────────────
  {
    canonicalName: 'bun_creatinine_ratio',
    requires: ['bun', 'creatinine'],
    denominators: ['creatinine'],
    compute: m => round(get(m, 'bun') / get(m, 'creatinine'), 1),
  },
  {
    canonicalName: 'calcium_corrected',
    requires: ['calcium', 'albumin'],
    compute: m => {
      // Corrected Ca = measured Ca + 0.8 × (4.0 − albumin)
      const ca = get(m, 'calcium')
      const alb = get(m, 'albumin')
      return round(ca + 0.8 * (4.0 - alb), 1)
    },
  },

  // ── Metabolic Derived ───────────────────────────────────────────────────
  {
    canonicalName: 'eag',
    requires: ['hba1c'],
    compute: m => round(get(m, 'hba1c') * 28.7 - 46.7, 0),
  },
  {
    canonicalName: 'tyg_index',
    requires: ['triglycerides', 'glucose_fasting'],
    compute: m => {
      const tg = get(m, 'triglycerides')
      const glu = get(m, 'glucose_fasting') ?? get(m, 'glucose_random')
      if (!tg || !glu) return null
      // TyG = ln(TG [mg/dL] × glucose [mg/dL] / 2)
      return round(Math.log(tg * glu / 2), 2)
    },
  },
  {
    canonicalName: 'homa_ir',
    requires: ['glucose_fasting', 'insulin_fasting'],
    compute: m => {
      // HOMA-IR = (Fasting Glucose [mg/dL] × Fasting Insulin [µU/mL]) / 405
      return round(get(m, 'glucose_fasting') * get(m, 'insulin_fasting') / 405)
    },
  },

  // ── Energy Derived ──────────────────────────────────────────────────────
  {
    canonicalName: 'transferrin_saturation',
    requires: ['iron', 'tibc'],
    denominators: ['tibc'],
    compute: m => round((get(m, 'iron') / get(m, 'tibc')) * 100, 1),
  },

  // ── Thyroid Derived ─────────────────────────────────────────────────────
  {
    canonicalName: 't7_index',
    requires: ['t4_total', 't3_uptake'],
    compute: m => round(get(m, 't4_total') * get(m, 't3_uptake'), 1),
  },

  // ── Immune Derived ──────────────────────────────────────────────────────
  {
    canonicalName: 'nlr',
    requires: ['neutrophils_abs', 'lymphocytes_abs'],
    denominators: ['lymphocytes_abs'],
    compute: m => round(get(m, 'neutrophils_abs') / get(m, 'lymphocytes_abs')),
  },
  {
    canonicalName: 'lmr',
    requires: ['lymphocytes_abs', 'monocytes_abs'],
    denominators: ['monocytes_abs'],
    compute: m => round(get(m, 'lymphocytes_abs') / get(m, 'monocytes_abs')),
  },
  {
    canonicalName: 'mlr',
    requires: ['monocytes_abs', 'lymphocytes_abs'],
    denominators: ['lymphocytes_abs'],
    compute: m => round(get(m, 'monocytes_abs') / get(m, 'lymphocytes_abs'), 3),
  },
  {
    canonicalName: 'nlpr',
    requires: ['neutrophils_abs', 'lymphocytes_abs', 'platelets'],
    denominators: ['lymphocytes_abs', 'platelets'],
    compute: m => {
      // NLPR = (NEU / LYM) / PLT
      return round(
        (get(m, 'neutrophils_abs') / get(m, 'lymphocytes_abs')) / get(m, 'platelets'),
        4,
      )
    },
  },

  // ── Inflammation Derived ────────────────────────────────────────────────
  {
    canonicalName: 'sii',
    requires: ['platelets', 'neutrophils_abs', 'lymphocytes_abs'],
    denominators: ['lymphocytes_abs'],
    compute: m => {
      // SII = (PLT × NEU) / LYM
      return round(get(m, 'platelets') * get(m, 'neutrophils_abs') / get(m, 'lymphocytes_abs'), 0)
    },
  },
  {
    canonicalName: 'siri',
    requires: ['monocytes_abs', 'neutrophils_abs', 'lymphocytes_abs'],
    denominators: ['lymphocytes_abs'],
    compute: m => {
      // SIRI = (MONO × NEU) / LYM
      return round(get(m, 'monocytes_abs') * get(m, 'neutrophils_abs') / get(m, 'lymphocytes_abs'))
    },
  },
  {
    canonicalName: 'far',
    requires: ['ferritin', 'albumin'],
    denominators: ['albumin'],
    compute: m => round(get(m, 'ferritin') / get(m, 'albumin')),
  },
  {
    canonicalName: 'mhr',
    requires: ['monocytes_abs', 'hdl'],
    denominators: ['hdl'],
    compute: m => {
      // MHR = monocytes (×10³/µL) × 1000 / HDL (mg/dL)
      return round(get(m, 'monocytes_abs') * 1000 / get(m, 'hdl'), 1)
    },
  },
  {
    canonicalName: 'car',
    requires: ['hscrp', 'albumin'],
    denominators: ['albumin'],
    compute: m => round(get(m, 'hscrp') / (get(m, 'albumin') * 10), 4),
  },
  {
    canonicalName: 'plr',
    requires: ['platelets', 'lymphocytes_abs'],
    denominators: ['lymphocytes_abs'],
    compute: m => round(get(m, 'platelets') / get(m, 'lymphocytes_abs'), 0),
  },

  // ── Sex Hormone Derived ─────────────────────────────────────────────────
  {
    canonicalName: 'te2_ratio',
    requires: ['testosterone_total', 'estradiol'],
    denominators: ['estradiol'],
    compute: m => {
      const t = get(m, 'testosterone_total')
      const e2 = get(m, 'estradiol')
      if (!t || !e2 || e2 === 0) return null
      // T:E2 — testosterone in ng/dL, estradiol in pg/mL → T*10 / E2 for ratio
      return round(t * 10 / e2, 1)
    },
  },
  {
    canonicalName: 'fai',
    requires: ['testosterone_total', 'shbg'],
    denominators: ['shbg'],
    compute: m => {
      // FAI = (Total T [nmol/L] × 100) / SHBG [nmol/L]
      // Convert ng/dL → nmol/L: ÷ 28.842
      const t_nmol = get(m, 'testosterone_total') / 28.842
      const shbg = get(m, 'shbg')
      if (!shbg || shbg === 0) return null
      return round(t_nmol * 100 / shbg, 1)
    },
  },

  // ── Nutrients Derived ───────────────────────────────────────────────────
  {
    canonicalName: 'rdw_mcv_ratio',
    requires: ['rdw', 'mcv'],
    denominators: ['mcv'],
    compute: m => round(get(m, 'rdw') / get(m, 'mcv'), 3),
  },
]

/**
 * Compute all derived biomarkers from a set of normalized (direct) tests.
 *
 * @param {Array} normalizedTests - Array of normalized test objects from normalizeTests()
 * @returns {Array} Additional normalized test objects for derived biomarkers
 */
function computeDerivedBiomarkers(normalizedTests) {
  // Build lookup map: canonicalName → test object
  const biomarkerMap = new Map()
  for (const test of normalizedTests) {
    biomarkerMap.set(test.canonicalName, test)
  }

  const derived = []

  for (const def of DERIVED_DEFINITIONS) {
    // Skip if this biomarker was already directly measured in the report
    if (biomarkerMap.has(def.canonicalName)) continue

    // Check all required inputs are present (null = missing)
    // Only reject zero for denominator positions to avoid division-by-zero
    const hasAllInputs = def.requires.every(req => {
      const v = get(biomarkerMap, req)
      if (v == null) return false
      if (v === 0 && def.denominators?.includes(req)) return false
      return true
    })
    if (!hasAllInputs) continue

    // Compute
    const value = def.compute(biomarkerMap)
    if (value == null || !isFinite(value)) continue

    const entry = CANONICAL_MAP[def.canonicalName]
    if (!entry) continue

    const refMin = entry.defaultRefMin
    const refMax = entry.defaultRefMax
    const flag = determineFlag(value, refMin, refMax)
    const optimalFlag = determineOptimalFlag(value, entry)

    const derivedTest = {
      canonicalName: def.canonicalName,
      displayName: entry.displayName,
      category: entry.category,
      numericValue: value,
      unit: entry.defaultUnit,
      referenceMin: refMin,
      referenceMax: refMax,
      optimalMin: entry.optimalMin ?? null,
      optimalMax: entry.optimalMax ?? null,
      flag,
      optimalFlag,
      panelTag: entry.panelTag || 'Derived',
      isDerived: true,
    }

    derived.push(derivedTest)
    // Also add to map so subsequent derived calcs can use earlier derived values
    biomarkerMap.set(def.canonicalName, derivedTest)
  }

  return derived
}

/**
 * Build a complete biomarker panel — all 165 biomarkers with values or null.
 * Direct values + derived values are filled in; everything else is null (N/A).
 *
 * @param {Array} allTests - Combined array of direct + derived normalized tests
 * @returns {Array} Full panel with all canonical biomarkers
 */
function buildFullBiomarkerPanel(allTests) {
  const testMap = new Map()
  for (const t of allTests) {
    testMap.set(t.canonicalName, t)
  }

  const panel = []

  for (const [canonicalName, entry] of Object.entries(CANONICAL_MAP)) {
    const existing = testMap.get(canonicalName)

    if (existing) {
      panel.push(existing)
    } else {
      // N/A — biomarker not present in report
      panel.push({
        canonicalName,
        displayName: entry.displayName,
        category: entry.category,
        numericValue: null,
        unit: entry.defaultUnit,
        referenceMin: entry.defaultRefMin,
        referenceMax: entry.defaultRefMax,
        optimalMin: entry.optimalMin ?? null,
        optimalMax: entry.optimalMax ?? null,
        flag: null,
        optimalFlag: null,
        panelTag: entry.panelTag || 'Core Panel',
        isDerived: entry.isDerived || false,
      })
    }
  }

  return panel
}

module.exports = { computeDerivedBiomarkers, buildFullBiomarkerPanel };
