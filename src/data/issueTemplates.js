/**
 * Issue Templates for the rule-based health issue detection engine.
 *
 * Each template defines a detectable health concern that the scoring engine
 * evaluates against a patient's biomarker data, questionnaire answers, and
 * wearable signals.
 *
 * Canonical biomarker names match those in `backend/src/utils/labNormalizer.js`.
 */

const ISSUE_TEMPLATES = [
  // ═══════════════════════════════════════════════════════════════════════════
  // CARDIOVASCULAR (5)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    issueId: 'CV-LPA-01',
    title: 'Elevated Lipoprotein(a)',
    category: 'cardiovascular',
    basePriority: 80,
    threshold: 0.65,
    primaryBiomarkers: ['lpa'],
    supportingBiomarkers: ['apob', 'ldl', 'ldl_particle_number'],
    labThresholds: {
      lpa: { optimalMax: 75, normalMax: 125, critical: 200 },       // nmol/L
      apob: { optimalMax: 80, normalMax: 90, critical: 130 },       // mg/dL
    },
    questionnaireFlags: {
      conditions: [],
      familyHistory: ['cvd', 'stroke', 'heart attack'],
      symptoms: ['chest pain'],
      medications: [],
      dietFlags: [],
    },
    wearableSignals: {
      resting_hr_above: 75,
      hrv_below: 30,
    },
    symptomMatches: {
      perfect: [],
      partial: ['fatigue', 'chest tightness'],
    },
    relatedGoals: ['goal_cardiovascular_1'],
  },

  {
    issueId: 'CV-LDL-01',
    title: 'High LDL / ApoB',
    category: 'cardiovascular',
    basePriority: 78,
    threshold: 0.60,
    primaryBiomarkers: ['ldl', 'apob'],
    supportingBiomarkers: ['non_hdl_cholesterol', 'ldl_particle_number', 'cholesterol_total'],
    labThresholds: {
      ldl: { optimalMax: 100, normalMax: 130, critical: 190 },      // mg/dL
      apob: { optimalMax: 80, normalMax: 90, critical: 130 },       // mg/dL
      non_hdl_cholesterol: { optimalMax: 130, normalMax: 160, critical: 220 },
    },
    questionnaireFlags: {
      conditions: ['high cholesterol', 'hyperlipidemia'],
      familyHistory: ['cvd', 'high cholesterol'],
      symptoms: [],
      medications: ['statin', 'ezetimibe'],
      dietFlags: [],
    },
    wearableSignals: {
      resting_hr_above: 75,
    },
    symptomMatches: {
      perfect: [],
      partial: ['fatigue'],
    },
    relatedGoals: ['goal_cardiovascular_2'],
  },

  {
    issueId: 'CV-HDL-01',
    title: 'Low HDL Cholesterol',
    category: 'cardiovascular',
    basePriority: 65,
    threshold: 0.60,
    primaryBiomarkers: ['hdl'],
    supportingBiomarkers: ['tg_hdl_ratio', 'cholesterol_hdl_ratio', 'aip'],
    labThresholds: {
      hdl: { optimalMin: 60, normalMin: 40, criticalMin: 30 },      // mg/dL
      tg_hdl_ratio: { optimalMax: 1.8, normalMax: 3.0, critical: 5.0 },
    },
    questionnaireFlags: {
      conditions: ['metabolic syndrome', 'obesity'],
      familyHistory: ['cvd'],
      symptoms: [],
      medications: [],
      dietFlags: [],
    },
    wearableSignals: {
      steps_below: 5000,
      resting_hr_above: 78,
    },
    symptomMatches: {
      perfect: [],
      partial: ['fatigue', 'shortness of breath'],
    },
    relatedGoals: ['goal_cardiovascular_2'],
  },

  {
    issueId: 'CV-TG-01',
    title: 'High Triglycerides',
    category: 'cardiovascular',
    basePriority: 70,
    threshold: 0.60,
    primaryBiomarkers: ['triglycerides'],
    supportingBiomarkers: ['tg_hdl_ratio', 'vldl', 'large_vldl_p', 'glucose_fasting'],
    labThresholds: {
      triglycerides: { optimalMax: 100, normalMax: 150, critical: 500 },  // mg/dL
      tg_hdl_ratio: { optimalMax: 1.8, normalMax: 3.0, critical: 6.0 },
    },
    questionnaireFlags: {
      conditions: ['high triglycerides', 'metabolic syndrome'],
      familyHistory: ['cvd', 'diabetes'],
      symptoms: [],
      medications: [],
      dietFlags: [],
    },
    wearableSignals: {
      steps_below: 5000,
    },
    symptomMatches: {
      perfect: [],
      partial: ['abdominal pain'],
    },
    relatedGoals: ['goal_cardiovascular_2', 'goal_metabolic_1'],
  },

  {
    issueId: 'CV-HSCRP-01',
    title: 'Elevated hsCRP (Vascular Risk)',
    category: 'cardiovascular',
    basePriority: 72,
    threshold: 0.60,
    primaryBiomarkers: ['hscrp'],
    supportingBiomarkers: ['ldl', 'apob', 'lpa', 'fibrinogen'],
    labThresholds: {
      hscrp: { optimalMax: 1.0, normalMax: 3.0, critical: 10.0 },   // mg/L
    },
    questionnaireFlags: {
      conditions: ['heart disease', 'high cholesterol'],
      familyHistory: ['cvd', 'stroke', 'heart attack'],
      symptoms: ['chest pain'],
      medications: ['statin'],
      dietFlags: [],
    },
    wearableSignals: {
      resting_hr_above: 78,
      hrv_below: 30,
    },
    symptomMatches: {
      perfect: [],
      partial: ['fatigue', 'chest tightness'],
    },
    relatedGoals: ['goal_cardiovascular_1', 'goal_inflammation_1'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // METABOLIC (3)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    issueId: 'MET-IR-01',
    title: 'Insulin Resistance (HOMA-IR)',
    category: 'metabolic',
    basePriority: 82,
    threshold: 0.60,
    primaryBiomarkers: ['homa_ir', 'insulin_fasting'],
    supportingBiomarkers: ['glucose_fasting', 'triglycerides', 'tg_hdl_ratio', 'tyg_index'],
    labThresholds: {
      homa_ir: { optimalMax: 1.5, normalMax: 2.5, critical: 5.0 },
      insulin_fasting: { optimalMax: 8, normalMax: 15, critical: 25 },  // µIU/mL
      glucose_fasting: { optimalMax: 90, normalMax: 100, critical: 126 }, // mg/dL
    },
    questionnaireFlags: {
      conditions: ['insulin resistance', 'prediabetes', 'pcos'],
      familyHistory: ['diabetes', 'metabolic syndrome'],
      symptoms: ['frequent urination', 'increased thirst'],
      medications: ['metformin'],
      dietFlags: [],
    },
    wearableSignals: {
      steps_below: 5000,
      resting_hr_above: 78,
    },
    symptomMatches: {
      perfect: ['frequent urination', 'increased thirst'],
      partial: ['fatigue', 'brain fog', 'weight gain'],
    },
    relatedGoals: ['goal_metabolic_1'],
  },

  {
    issueId: 'MET-HBA1C-01',
    title: 'Elevated HbA1c',
    category: 'metabolic',
    basePriority: 85,
    threshold: 0.60,
    primaryBiomarkers: ['hba1c'],
    supportingBiomarkers: ['glucose_fasting', 'insulin_fasting', 'homa_ir', 'fructosamine'],
    labThresholds: {
      hba1c: { optimalMax: 5.4, normalMax: 5.7, critical: 6.5 },    // %
      glucose_fasting: { optimalMax: 90, normalMax: 100, critical: 126 },
    },
    questionnaireFlags: {
      conditions: ['diabetes', 'prediabetes'],
      familyHistory: ['diabetes'],
      symptoms: ['frequent urination', 'increased thirst', 'blurred vision'],
      medications: ['metformin', 'insulin', 'glp-1'],
      dietFlags: [],
    },
    wearableSignals: {
      steps_below: 5000,
    },
    symptomMatches: {
      perfect: ['frequent urination', 'increased thirst'],
      partial: ['fatigue', 'blurred vision', 'slow wound healing'],
    },
    relatedGoals: ['goal_metabolic_1'],
  },

  {
    issueId: 'MET-SYNDROME-01',
    title: 'Metabolic Syndrome Cluster',
    category: 'metabolic',
    basePriority: 88,
    threshold: 0.70,
    primaryBiomarkers: ['triglycerides', 'hdl', 'glucose_fasting'],
    supportingBiomarkers: ['homa_ir', 'insulin_fasting', 'hscrp', 'uric_acid_hdl_ratio', 'tg_hdl_ratio'],
    labThresholds: {
      triglycerides: { optimalMax: 100, normalMax: 150, critical: 500 },
      hdl: { optimalMin: 60, normalMin: 40, criticalMin: 30 },
      glucose_fasting: { optimalMax: 90, normalMax: 100, critical: 126 },
      homa_ir: { optimalMax: 1.5, normalMax: 2.5, critical: 5.0 },
    },
    questionnaireFlags: {
      conditions: ['metabolic syndrome', 'obesity', 'hypertension'],
      familyHistory: ['diabetes', 'cvd'],
      symptoms: [],
      medications: ['metformin', 'statin', 'blood pressure medication'],
      dietFlags: [],
    },
    wearableSignals: {
      steps_below: 4000,
      resting_hr_above: 80,
      sleep_below: 6,
    },
    symptomMatches: {
      perfect: [],
      partial: ['fatigue', 'weight gain', 'brain fog'],
    },
    relatedGoals: ['goal_metabolic_1', 'goal_cardiovascular_1'],
    useBMI: true,
    bmiThreshold: 30,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // HORMONAL (4)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    issueId: 'HOR-TESTO-01',
    title: 'Low Testosterone (Male)',
    category: 'hormonal',
    basePriority: 70,
    threshold: 0.60,
    sexFilter: 'M',
    primaryBiomarkers: ['testosterone_total', 'testosterone_free'],
    supportingBiomarkers: ['shbg', 'lh', 'fsh', 'estradiol'],
    labThresholds: {
      testosterone_total: { optimalMin: 500, normalMin: 300, criticalMin: 200 },  // ng/dL
      testosterone_free: { optimalMin: 10, normalMin: 6, criticalMin: 4 },        // pg/mL
    },
    questionnaireFlags: {
      conditions: ['low testosterone', 'hypogonadism'],
      familyHistory: [],
      symptoms: ['low libido', 'erectile dysfunction', 'fatigue'],
      medications: ['testosterone', 'clomiphene'],
      dietFlags: [],
    },
    wearableSignals: {
      sleep_below: 6,
      hrv_below: 30,
    },
    symptomMatches: {
      perfect: ['low libido', 'erectile dysfunction'],
      partial: ['fatigue', 'muscle weakness', 'mood changes', 'brain fog'],
    },
    relatedGoals: ['goal_hormonal_1'],
  },

  {
    issueId: 'HOR-SHBG-01',
    title: 'Elevated SHBG (Male)',
    category: 'hormonal',
    basePriority: 55,
    threshold: 0.60,
    sexFilter: 'M',
    primaryBiomarkers: ['shbg'],
    supportingBiomarkers: ['testosterone_total', 'testosterone_free', 'testosterone_bioavailable', 'fai'],
    labThresholds: {
      shbg: { optimalMax: 50, normalMax: 70, critical: 100 },      // nmol/L
    },
    questionnaireFlags: {
      conditions: ['low testosterone'],
      familyHistory: [],
      symptoms: ['low libido', 'fatigue'],
      medications: [],
      dietFlags: [],
    },
    wearableSignals: {},
    symptomMatches: {
      perfect: [],
      partial: ['low libido', 'fatigue', 'muscle weakness'],
    },
    relatedGoals: ['goal_hormonal_1'],
  },

  {
    issueId: 'HOR-THYROID-01',
    title: 'Hypothyroidism (Elevated TSH)',
    category: 'hormonal',
    basePriority: 75,
    threshold: 0.60,
    primaryBiomarkers: ['tsh'],
    supportingBiomarkers: ['t4_free', 't3_free', 'tpo_ab'],
    labThresholds: {
      tsh: { optimalMax: 2.5, normalMax: 4.5, critical: 10.0 },     // mIU/L
      t4_free: { optimalMin: 1.1, normalMin: 0.8, criticalMin: 0.5 }, // ng/dL
      t3_free: { optimalMin: 3.0, normalMin: 2.3, criticalMin: 1.8 }, // pg/mL
    },
    questionnaireFlags: {
      conditions: ['hypothyroidism', 'hashimotos', 'thyroid disease'],
      familyHistory: ['thyroid disease'],
      symptoms: ['fatigue', 'weight gain', 'cold intolerance'],
      medications: ['levothyroxine', 'synthroid', 'armour thyroid'],
      dietFlags: [],
    },
    wearableSignals: {
      resting_hr_above: null,
      hrv_below: 30,
      sleep_below: null,
    },
    symptomMatches: {
      perfect: ['cold intolerance', 'weight gain'],
      partial: ['fatigue', 'constipation', 'dry skin', 'hair loss', 'brain fog'],
    },
    relatedGoals: ['goal_thyroid_1'],
  },

  {
    issueId: 'HOR-DHEAS-01',
    title: 'Low DHEA-S',
    category: 'hormonal',
    basePriority: 50,
    threshold: 0.60,
    primaryBiomarkers: ['dhea_s'],
    supportingBiomarkers: ['cortisol', 'testosterone_total'],
    labThresholds: {
      dhea_s: { optimalMin: 200, normalMin: 100, criticalMin: 50 },  // µg/dL
    },
    questionnaireFlags: {
      conditions: ['adrenal fatigue', 'chronic fatigue'],
      familyHistory: [],
      symptoms: ['fatigue', 'low libido'],
      medications: ['dhea'],
      dietFlags: [],
    },
    wearableSignals: {
      hrv_below: 35,
      sleep_below: 6,
    },
    symptomMatches: {
      perfect: [],
      partial: ['fatigue', 'low libido', 'mood changes', 'muscle weakness'],
    },
    relatedGoals: ['goal_hormonal_1'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NUTRIENTS (4)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    issueId: 'NUT-IRON-01',
    title: 'Iron Deficiency',
    category: 'nutrients',
    basePriority: 72,
    threshold: 0.60,
    primaryBiomarkers: ['ferritin'],
    supportingBiomarkers: ['iron', 'hemoglobin', 'transferrin_saturation', 'tibc', 'mcv', 'rdw'],
    labThresholds: {
      ferritin: { optimalMin: 50, normalMin: 20, criticalMin: 10 },   // ng/mL
      hemoglobin: { optimalMin: 13.5, normalMin: 12.0, criticalMin: 8.0 }, // g/dL
      transferrin_saturation: { optimalMin: 25, normalMin: 15, criticalMin: 10 }, // %
    },
    questionnaireFlags: {
      conditions: ['anemia', 'iron deficiency'],
      familyHistory: [],
      symptoms: ['fatigue', 'dizziness', 'shortness of breath'],
      medications: ['iron supplement'],
      dietFlags: ['vegan', 'vegetarian'],
    },
    wearableSignals: {
      resting_hr_above: 80,
      hrv_below: 30,
    },
    symptomMatches: {
      perfect: ['fatigue', 'dizziness'],
      partial: ['shortness of breath', 'cold hands', 'brittle nails', 'pale skin'],
    },
    relatedGoals: ['goal_nutrient_1'],
  },

  {
    issueId: 'NUT-VITD-01',
    title: 'Vitamin D Deficiency',
    category: 'nutrients',
    basePriority: 60,
    threshold: 0.55,
    primaryBiomarkers: ['vitamin_d'],
    supportingBiomarkers: ['calcium', 'calcium_corrected', 'phosphorus'],
    labThresholds: {
      vitamin_d: { optimalMin: 50, normalMin: 30, criticalMin: 15 },  // ng/mL
    },
    questionnaireFlags: {
      conditions: ['osteoporosis', 'osteopenia'],
      familyHistory: ['osteoporosis'],
      symptoms: ['bone pain', 'muscle weakness'],
      medications: ['vitamin d'],
      dietFlags: ['vegan'],
    },
    wearableSignals: {},
    symptomMatches: {
      perfect: ['bone pain'],
      partial: ['fatigue', 'muscle weakness', 'mood changes', 'frequent illness'],
    },
    relatedGoals: ['goal_nutrient_2'],
  },

  {
    issueId: 'NUT-B12-01',
    title: 'Vitamin B12 Deficiency',
    category: 'nutrients',
    basePriority: 65,
    threshold: 0.55,
    primaryBiomarkers: ['vitamin_b12'],
    supportingBiomarkers: ['homocysteine', 'mma', 'folate', 'mcv'],
    labThresholds: {
      vitamin_b12: { optimalMin: 500, normalMin: 300, criticalMin: 200 }, // pg/mL
      homocysteine: { optimalMax: 8, normalMax: 12, critical: 20 },      // µmol/L
      mma: { optimalMax: 250, normalMax: 370, critical: 600 },           // nmol/L
    },
    questionnaireFlags: {
      conditions: ['pernicious anemia', 'b12 deficiency'],
      familyHistory: [],
      symptoms: ['tingling', 'numbness', 'fatigue'],
      medications: ['metformin', 'ppi'],
      dietFlags: ['vegan', 'vegetarian'],
    },
    wearableSignals: {},
    symptomMatches: {
      perfect: ['tingling', 'numbness'],
      partial: ['fatigue', 'brain fog', 'balance problems', 'mood changes'],
    },
    relatedGoals: ['goal_nutrient_3'],
  },

  {
    issueId: 'NUT-HOMOCYS-01',
    title: 'Elevated Homocysteine',
    category: 'nutrients',
    basePriority: 68,
    threshold: 0.60,
    primaryBiomarkers: ['homocysteine'],
    supportingBiomarkers: ['vitamin_b12', 'folate', 'folate_rbc', 'mma'],
    labThresholds: {
      homocysteine: { optimalMax: 8, normalMax: 12, critical: 20 },  // µmol/L
    },
    questionnaireFlags: {
      conditions: ['mthfr mutation'],
      familyHistory: ['cvd', 'stroke'],
      symptoms: [],
      medications: [],
      dietFlags: ['vegan', 'vegetarian'],
    },
    wearableSignals: {},
    symptomMatches: {
      perfect: [],
      partial: ['fatigue', 'brain fog', 'tingling'],
    },
    relatedGoals: ['goal_nutrient_3', 'goal_cardiovascular_1'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // INFLAMMATION (2)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    issueId: 'INF-CHRONIC-01',
    title: 'Chronic Inflammation',
    category: 'inflammation',
    basePriority: 70,
    threshold: 0.60,
    primaryBiomarkers: ['hscrp'],
    supportingBiomarkers: ['esr', 'ferritin', 'sii', 'nlr', 'plr'],
    labThresholds: {
      hscrp: { optimalMax: 1.0, normalMax: 3.0, critical: 10.0 },   // mg/L
      esr: { optimalMax: 10, normalMax: 20, critical: 50 },          // mm/hr
    },
    questionnaireFlags: {
      conditions: ['autoimmune', 'rheumatoid arthritis', 'lupus', 'ibd'],
      familyHistory: ['autoimmune'],
      symptoms: ['joint pain', 'swelling'],
      medications: ['nsaid', 'prednisone', 'biologic'],
      dietFlags: [],
    },
    wearableSignals: {
      hrv_below: 30,
      resting_hr_above: 78,
      sleep_below: 6,
    },
    symptomMatches: {
      perfect: ['joint pain', 'swelling'],
      partial: ['fatigue', 'muscle aches', 'brain fog'],
    },
    relatedGoals: ['goal_inflammation_1'],
  },

  {
    issueId: 'INF-FIBRIN-01',
    title: 'Elevated Fibrinogen',
    category: 'inflammation',
    basePriority: 60,
    threshold: 0.65,
    primaryBiomarkers: ['ferritin'],  // fibrinogen not in normalizer; ferritin as proxy inflammatory marker
    supportingBiomarkers: ['hscrp', 'esr', 'sii'],
    labThresholds: {
      ferritin: { optimalMax: 200, normalMax: 400, critical: 800 },  // ng/mL (elevated = inflammation)
      hscrp: { optimalMax: 1.0, normalMax: 3.0, critical: 10.0 },
    },
    questionnaireFlags: {
      conditions: ['blood clots', 'dvt', 'autoimmune'],
      familyHistory: ['blood clots', 'dvt', 'stroke'],
      symptoms: [],
      medications: ['anticoagulant', 'aspirin'],
      dietFlags: [],
    },
    wearableSignals: {
      resting_hr_above: 78,
    },
    symptomMatches: {
      perfect: [],
      partial: ['leg swelling', 'fatigue'],
    },
    relatedGoals: ['goal_inflammation_1', 'goal_cardiovascular_1'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LIVER (2)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    issueId: 'LIV-ALT-01',
    title: 'Elevated ALT / NAFLD Risk',
    category: 'liver',
    basePriority: 72,
    threshold: 0.60,
    primaryBiomarkers: ['alt'],
    supportingBiomarkers: ['ast', 'ggt', 'albumin', 'bilirubin_total', 'ag_ratio'],
    labThresholds: {
      alt: { optimalMax: 25, normalMax: 40, critical: 100 },        // U/L
      ast: { optimalMax: 25, normalMax: 40, critical: 100 },        // U/L
    },
    questionnaireFlags: {
      conditions: ['fatty liver', 'nafld', 'nash', 'liver disease'],
      familyHistory: ['liver disease'],
      symptoms: ['abdominal pain'],
      medications: ['statin', 'acetaminophen'],
      dietFlags: [],
    },
    wearableSignals: {
      steps_below: 5000,
    },
    symptomMatches: {
      perfect: [],
      partial: ['fatigue', 'abdominal pain', 'nausea'],
    },
    relatedGoals: ['goal_liver_1'],
    useBMI: true,
    bmiThreshold: 28,
  },

  {
    issueId: 'LIV-GGT-01',
    title: 'Elevated GGT',
    category: 'liver',
    basePriority: 60,
    threshold: 0.60,
    primaryBiomarkers: ['ggt'],
    supportingBiomarkers: ['alt', 'ast', 'alp', 'bilirubin_total'],
    labThresholds: {
      ggt: { optimalMax: 25, normalMax: 50, critical: 120 },        // U/L
    },
    questionnaireFlags: {
      conditions: ['fatty liver', 'liver disease'],
      familyHistory: ['liver disease'],
      symptoms: [],
      medications: [],
      dietFlags: [],
    },
    wearableSignals: {},
    symptomMatches: {
      perfect: [],
      partial: ['fatigue', 'abdominal pain'],
    },
    relatedGoals: ['goal_liver_1'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // KIDNEY (2)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    issueId: 'KID-EGFR-01',
    title: 'Declining eGFR',
    category: 'kidney',
    basePriority: 80,
    threshold: 0.65,
    primaryBiomarkers: ['egfr'],
    supportingBiomarkers: ['creatinine', 'bun', 'bun_creatinine_ratio', 'potassium'],
    labThresholds: {
      egfr: { optimalMin: 90, normalMin: 60, criticalMin: 30 },     // mL/min/1.73m2
      creatinine: { optimalMax: 1.1, normalMax: 1.3, critical: 2.0 }, // mg/dL
    },
    questionnaireFlags: {
      conditions: ['chronic kidney disease', 'ckd', 'kidney disease'],
      familyHistory: ['kidney disease'],
      symptoms: ['swelling', 'frequent urination'],
      medications: ['ace inhibitor', 'arb'],
      dietFlags: [],
    },
    wearableSignals: {
      resting_hr_above: 80,
    },
    symptomMatches: {
      perfect: ['swelling'],
      partial: ['fatigue', 'frequent urination', 'foamy urine', 'nausea'],
    },
    relatedGoals: ['goal_kidney_1'],
  },

  {
    issueId: 'KID-UACR-01',
    title: 'Elevated UACR (Albumin-to-Creatinine Ratio)',
    category: 'kidney',
    basePriority: 75,
    threshold: 0.65,
    primaryBiomarkers: ['albumin', 'creatinine'],  // UACR not in normalizer; use albumin + creatinine as proxies
    supportingBiomarkers: ['egfr', 'bun', 'glucose_fasting', 'hba1c'],
    labThresholds: {
      albumin: { optimalMin: 4.0, normalMin: 3.5, criticalMin: 2.5 },  // g/dL
      egfr: { optimalMin: 90, normalMin: 60, criticalMin: 30 },
    },
    questionnaireFlags: {
      conditions: ['diabetes', 'hypertension', 'ckd'],
      familyHistory: ['kidney disease', 'diabetes'],
      symptoms: ['swelling', 'foamy urine'],
      medications: ['ace inhibitor', 'arb', 'metformin'],
      dietFlags: [],
    },
    wearableSignals: {},
    symptomMatches: {
      perfect: ['foamy urine'],
      partial: ['swelling', 'fatigue'],
    },
    relatedGoals: ['goal_kidney_1'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BODY COMPOSITION (1)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    issueId: 'BODY-OBESITY-01',
    title: 'Obesity with Metabolic Risk',
    category: 'body_composition',
    basePriority: 65,
    threshold: 0.55,
    primaryBiomarkers: ['glucose_fasting', 'triglycerides'],
    supportingBiomarkers: ['homa_ir', 'insulin_fasting', 'hscrp', 'alt', 'leptin', 'hdl'],
    labThresholds: {
      glucose_fasting: { optimalMax: 90, normalMax: 100, critical: 126 },
      triglycerides: { optimalMax: 100, normalMax: 150, critical: 500 },
      hscrp: { optimalMax: 1.0, normalMax: 3.0, critical: 10.0 },
      leptin: { optimalMax: 10, normalMax: 20, critical: 40 },       // ng/mL
    },
    questionnaireFlags: {
      conditions: ['obesity', 'metabolic syndrome'],
      familyHistory: ['diabetes', 'cvd', 'obesity'],
      symptoms: [],
      medications: ['glp-1', 'metformin'],
      dietFlags: [],
    },
    wearableSignals: {
      steps_below: 4000,
      sleep_below: 6,
    },
    symptomMatches: {
      perfect: [],
      partial: ['fatigue', 'joint pain', 'shortness of breath', 'snoring'],
    },
    relatedGoals: ['goal_body_comp_1', 'goal_metabolic_1'],
    useBMI: true,
    bmiThreshold: 30,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ENERGY (1)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    issueId: 'ENERGY-FATIGUE-01',
    title: 'Fatigue Multi-Signal Pattern',
    category: 'energy',
    basePriority: 58,
    threshold: 0.55,
    primaryBiomarkers: ['ferritin', 'vitamin_d', 'tsh'],
    supportingBiomarkers: ['vitamin_b12', 'hemoglobin', 'iron', 'cortisol', 'testosterone_total', 'hba1c', 't4_free'],
    labThresholds: {
      ferritin: { optimalMin: 50, normalMin: 20, criticalMin: 10 },
      vitamin_d: { optimalMin: 50, normalMin: 30, criticalMin: 15 },
      tsh: { optimalMax: 2.5, normalMax: 4.5, critical: 10.0 },
      vitamin_b12: { optimalMin: 500, normalMin: 300, criticalMin: 200 },
      hemoglobin: { optimalMin: 13.5, normalMin: 12.0, criticalMin: 8.0 },
    },
    questionnaireFlags: {
      conditions: ['chronic fatigue', 'fibromyalgia', 'hypothyroidism', 'anemia'],
      familyHistory: [],
      symptoms: ['fatigue', 'low energy', 'brain fog'],
      medications: [],
      dietFlags: ['vegan', 'vegetarian'],
    },
    wearableSignals: {
      hrv_below: 30,
      sleep_below: 6,
      resting_hr_above: 78,
      steps_below: 4000,
    },
    symptomMatches: {
      perfect: ['fatigue', 'low energy'],
      partial: ['brain fog', 'muscle weakness', 'dizziness', 'mood changes', 'poor sleep'],
    },
    relatedGoals: ['goal_nutrient_1', 'goal_thyroid_1'],
  },
]


module.exports = { ISSUE_TEMPLATES };
