/**
 * Goal Templates
 *
 * Each template maps detected health issues to a patient-facing Goal
 * with actionable protocol items from the Semalix product lines and
 * clinically relevant supplements.
 */

const GOAL_TEMPLATES = [
  // ── 1. Cardiovascular ────────────────────────────────────────────
  {
    goalId: 'goal_cardiovascular_1',
    title: 'Protect your heart and arteries',
    healthImpact: 'Heart protection',
    category: 'cardiovascular',
    recoveryTimeWeeks: [8, 12],
    linkedIssues: ['CV-LPA-01', 'CV-HSCRP-01', 'NUT-HOMOCYS-01'],
    protocolItems: [
      {
        productName: 'MITOHEART (CoQ10 + Omega-3)',
        triggerBiomarkers: ['hscrp', 'apob', 'triglycerides'],
        contraindications: { medications: ['anticoagulant', 'warfarin'], allergies: [] },
        dosing: '1 serving daily with food.',
      },
      {
        productName: 'Pro-Resolve Omega (EPA/DHA)',
        triggerBiomarkers: ['triglycerides', 'hscrp'],
        contraindications: { medications: ['anticoagulant', 'warfarin'], allergies: ['fish', 'shellfish'] },
        dosing: '2 g EPA+DHA daily with a meal.',
      },
      {
        productName: 'Magnesium Glycinate',
        triggerBiomarkers: ['magnesium'],
        contraindications: { medications: [], allergies: [] },
        dosing: '400 mg elemental magnesium at bedtime.',
      },
    ],
    goalAlignmentKeywords: ['heart', 'cardiovascular', 'blood pressure', 'longevity', 'arteries'],
  },

  {
    goalId: 'goal_cardiovascular_2',
    title: 'Lower atherogenic cholesterol',
    healthImpact: 'Cholesterol management',
    category: 'cardiovascular',
    recoveryTimeWeeks: [8, 16],
    linkedIssues: ['CV-LDL-01', 'CV-HDL-01', 'CV-TG-01'],
    protocolItems: [
      {
        productName: 'Red Yeast Rice + CoQ10',
        triggerBiomarkers: ['ldl', 'apob', 'cholesterol_total'],
        contraindications: { medications: ['statin', 'atorvastatin', 'rosuvastatin', 'simvastatin'], allergies: [] },
        dosing: '1200 mg Red Yeast Rice + 100 mg CoQ10 daily with dinner.',
      },
      {
        productName: 'Berberine',
        triggerBiomarkers: ['ldl', 'triglycerides', 'cholesterol_total'],
        contraindications: { medications: ['metformin', 'cyclosporine'], allergies: [] },
        dosing: '500 mg twice daily before meals.',
      },
      {
        productName: 'Pro-Resolve Omega (EPA/DHA)',
        triggerBiomarkers: ['triglycerides', 'ldl_particle_number'],
        contraindications: { medications: ['anticoagulant', 'warfarin'], allergies: ['fish', 'shellfish'] },
        dosing: '2 g EPA+DHA daily with a meal.',
      },
    ],
    goalAlignmentKeywords: ['cholesterol', 'lipids', 'heart', 'cardiovascular', 'ldl'],
  },

  // ── 2. Metabolic ─────────────────────────────────────────────────
  {
    goalId: 'goal_metabolic_1',
    title: 'Reverse insulin resistance',
    healthImpact: 'Metabolic health',
    category: 'metabolic',
    recoveryTimeWeeks: [12, 24],
    linkedIssues: ['MET-IR-01', 'MET-HBA1C-01', 'MET-SYNDROME-01'],
    protocolItems: [
      {
        productName: 'Berberine',
        triggerBiomarkers: ['glucose_fasting', 'hba1c', 'insulin_fasting', 'homa_ir'],
        contraindications: { medications: ['metformin', 'cyclosporine'], allergies: [] },
        dosing: '500 mg twice daily before meals.',
      },
      {
        productName: 'Magnesium Glycinate',
        triggerBiomarkers: ['glucose_fasting', 'magnesium', 'hba1c'],
        contraindications: { medications: [], allergies: [] },
        dosing: '400 mg elemental magnesium at bedtime.',
      },
      {
        productName: 'Alpha-Lipoic Acid',
        triggerBiomarkers: ['glucose_fasting', 'insulin_fasting', 'homa_ir'],
        contraindications: { medications: ['thyroid_hormone'], allergies: [] },
        dosing: '600 mg daily on an empty stomach.',
      },
      {
        productName: 'Chromium Picolinate',
        triggerBiomarkers: ['glucose_fasting', 'hba1c'],
        contraindications: { medications: [], allergies: [] },
        dosing: '200-400 mcg daily with food.',
      },
    ],
    goalAlignmentKeywords: ['blood sugar', 'insulin', 'metabolic', 'diabetes', 'glucose', 'weight loss'],
  },

  // ── 3. Inflammation ──────────────────────────────────────────────
  {
    goalId: 'goal_inflammation_1',
    title: 'Reduce chronic inflammation',
    healthImpact: 'Inflammation control',
    category: 'inflammation',
    recoveryTimeWeeks: [6, 12],
    linkedIssues: ['INF-CHRONIC-01', 'INF-FIBRIN-01', 'CV-HSCRP-01'],
    protocolItems: [
      {
        productName: 'MITOHEART (CoQ10 + Omega-3)',
        triggerBiomarkers: ['hscrp', 'esr'],
        contraindications: { medications: ['anticoagulant', 'warfarin'], allergies: [] },
        dosing: '1 serving daily with food.',
      },
      {
        productName: 'Pro-Resolve Omega (EPA/DHA)',
        triggerBiomarkers: ['hscrp', 'esr'],
        contraindications: { medications: ['anticoagulant', 'warfarin'], allergies: ['fish', 'shellfish'] },
        dosing: '2 g EPA+DHA daily with a meal.',
      },
      {
        productName: 'Curcumin (BCM-95)',
        triggerBiomarkers: ['hscrp', 'esr'],
        contraindications: { medications: ['anticoagulant', 'warfarin', 'antiplatelet'], allergies: [] },
        dosing: '500 mg twice daily with food containing fat.',
      },
      {
        productName: 'NAC (N-Acetyl Cysteine)',
        triggerBiomarkers: ['hscrp', 'homocysteine'],
        contraindications: { medications: ['nitroglycerin'], allergies: [] },
        dosing: '600 mg twice daily.',
      },
    ],
    goalAlignmentKeywords: ['inflammation', 'pain', 'autoimmune', 'recovery', 'longevity', 'anti-inflammatory'],
  },

  // ── 4. Hormonal ──────────────────────────────────────────────────
  {
    goalId: 'goal_hormonal_1',
    title: 'Increase free testosterone by reducing SHBG',
    healthImpact: 'Hormonal balance',
    category: 'hormonal',
    recoveryTimeWeeks: [8, 16],
    linkedIssues: ['HOR-TESTO-01', 'HOR-SHBG-01', 'HOR-DHEAS-01'],
    protocolItems: [
      {
        productName: 'Zinc Bisglycinate',
        triggerBiomarkers: ['shbg', 'testosterone_free', 'testosterone_total'],
        contraindications: { medications: ['penicillamine', 'tetracycline'], allergies: [] },
        dosing: '30 mg elemental zinc daily with food.',
      },
      {
        productName: 'DHEA (low dose)',
        triggerBiomarkers: ['dhea_s', 'testosterone_free', 'shbg'],
        contraindications: { medications: ['hormone_replacement', 'tamoxifen'], allergies: [] },
        dosing: '10-25 mg daily in the morning. Requires physician supervision.',
      },
      {
        productName: 'Ashwagandha (KSM-66)',
        triggerBiomarkers: ['cortisol', 'testosterone_free', 'shbg'],
        contraindications: { medications: ['thyroid_hormone', 'immunosuppressant'], allergies: ['nightshade'] },
        dosing: '600 mg daily (300 mg twice daily) with food.',
      },
      {
        productName: 'Magnesium Glycinate',
        triggerBiomarkers: ['magnesium', 'testosterone_free'],
        contraindications: { medications: [], allergies: [] },
        dosing: '400 mg elemental magnesium at bedtime.',
      },
    ],
    goalAlignmentKeywords: ['testosterone', 'hormones', 'energy', 'muscle', 'libido', 'hormonal'],
  },

  // ── 5. Thyroid ───────────────────────────────────────────────────
  {
    goalId: 'goal_thyroid_1',
    title: 'Optimize thyroid function',
    healthImpact: 'Thyroid health',
    category: 'thyroid',
    recoveryTimeWeeks: [8, 16],
    linkedIssues: ['HOR-THYROID-01'],
    protocolItems: [
      {
        productName: 'Selenium (Selenomethionine)',
        triggerBiomarkers: ['tsh', 't4_free', 't3_free', 'tpo_ab'],
        contraindications: { medications: [], allergies: [] },
        dosing: '200 mcg daily with food. Do not exceed 400 mcg/day.',
      },
      {
        productName: 'Zinc Bisglycinate',
        triggerBiomarkers: ['tsh', 't3_free'],
        contraindications: { medications: ['penicillamine', 'tetracycline'], allergies: [] },
        dosing: '30 mg elemental zinc daily with food.',
      },
      {
        productName: 'Vitamin D3 + K2',
        triggerBiomarkers: ['vitamin_d', 'tsh', 'tpo_ab'],
        contraindications: { medications: ['thiazide_diuretic'], allergies: [] },
        dosing: '5000 IU D3 + 100 mcg K2 (MK-7) daily with a fat-containing meal.',
      },
    ],
    goalAlignmentKeywords: ['thyroid', 'energy', 'metabolism', 'fatigue', 'weight'],
  },

  // ── 6. Nutrient — Iron / Energy ──────────────────────────────────
  {
    goalId: 'goal_nutrient_1',
    title: 'Fix iron deficiency to restore energy',
    healthImpact: 'Energy restoration',
    category: 'nutrient',
    recoveryTimeWeeks: [8, 16],
    linkedIssues: ['NUT-IRON-01', 'ENERGY-FATIGUE-01'],
    protocolItems: [
      {
        productName: 'Iron Bisglycinate',
        triggerBiomarkers: ['ferritin', 'iron', 'tibc', 'transferrin_saturation', 'hemoglobin'],
        contraindications: { medications: ['antacid', 'proton_pump_inhibitor', 'tetracycline', 'levothyroxine'], allergies: [] },
        dosing: '25-50 mg elemental iron daily on an empty stomach with vitamin C. Take 2 hours away from thyroid meds, antacids, or calcium.',
      },
      {
        productName: 'B-Complex with Methylfolate',
        triggerBiomarkers: ['vitamin_b12', 'folate', 'hemoglobin', 'mcv'],
        contraindications: { medications: [], allergies: [] },
        dosing: '1 capsule daily with food.',
      },
    ],
    goalAlignmentKeywords: ['energy', 'fatigue', 'iron', 'anemia', 'tiredness'],
  },

  // ── 7. Nutrient — Vitamin D ──────────────────────────────────────
  {
    goalId: 'goal_nutrient_2',
    title: 'Raise vitamin D in the optimal zone',
    healthImpact: 'Nutrient optimization',
    category: 'nutrient',
    recoveryTimeWeeks: [8, 12],
    linkedIssues: ['NUT-VITD-01'],
    protocolItems: [
      {
        productName: 'Vitamin D3 + K2',
        triggerBiomarkers: ['vitamin_d', 'calcium'],
        contraindications: { medications: ['thiazide_diuretic'], allergies: [] },
        dosing: '5000 IU D3 + 100 mcg K2 (MK-7) daily with a fat-containing meal. Retest at 12 weeks.',
      },
      {
        productName: 'Magnesium Glycinate',
        triggerBiomarkers: ['magnesium', 'vitamin_d'],
        contraindications: { medications: [], allergies: [] },
        dosing: '400 mg elemental magnesium at bedtime. Magnesium is required for vitamin D activation.',
      },
    ],
    goalAlignmentKeywords: ['vitamin d', 'bones', 'immune', 'energy', 'sun', 'deficiency'],
  },

  // ── 8. Nutrient — DNA / Longevity ────────────────────────────────
  {
    goalId: 'goal_nutrient_3',
    title: 'Optimize DNA health and longevity markers',
    healthImpact: 'Longevity',
    category: 'nutrient',
    recoveryTimeWeeks: [12, 24],
    linkedIssues: ['NUT-B12-01', 'NUT-HOMOCYS-01'],
    protocolItems: [
      {
        productName: 'B-Complex with Methylfolate',
        triggerBiomarkers: ['homocysteine', 'vitamin_b12', 'folate'],
        contraindications: { medications: [], allergies: [] },
        dosing: '1 capsule daily with food.',
      },
      {
        productName: 'MITOHEART (CoQ10 + Omega-3)',
        triggerBiomarkers: ['homocysteine', 'hscrp'],
        contraindications: { medications: ['anticoagulant', 'warfarin'], allergies: [] },
        dosing: '1 serving daily with food.',
      },
      {
        productName: 'NAC (N-Acetyl Cysteine)',
        triggerBiomarkers: ['homocysteine'],
        contraindications: { medications: ['nitroglycerin'], allergies: [] },
        dosing: '600 mg twice daily.',
      },
    ],
    goalAlignmentKeywords: ['longevity', 'aging', 'dna', 'methylation', 'homocysteine', 'anti-aging'],
  },

  // ── 9. Liver ─────────────────────────────────────────────────────
  {
    goalId: 'goal_liver_1',
    title: 'Protect liver function',
    healthImpact: 'Liver health',
    category: 'liver',
    recoveryTimeWeeks: [8, 16],
    linkedIssues: ['LIV-ALT-01', 'LIV-GGT-01'],
    protocolItems: [
      {
        productName: 'NAC (N-Acetyl Cysteine)',
        triggerBiomarkers: ['alt', 'ast', 'ggt', 'alp'],
        contraindications: { medications: ['nitroglycerin'], allergies: [] },
        dosing: '600 mg twice daily.',
      },
      {
        productName: 'Milk Thistle (Silymarin)',
        triggerBiomarkers: ['alt', 'ast', 'ggt'],
        contraindications: { medications: ['methotrexate'], allergies: ['ragweed', 'daisy'] },
        dosing: '200-400 mg standardized silymarin daily with food.',
      },
      {
        productName: 'Pro-Resolve Omega (EPA/DHA)',
        triggerBiomarkers: ['alt', 'ast', 'triglycerides'],
        contraindications: { medications: ['anticoagulant', 'warfarin'], allergies: ['fish', 'shellfish'] },
        dosing: '2 g EPA+DHA daily with a meal.',
      },
    ],
    goalAlignmentKeywords: ['liver', 'detox', 'fatty liver', 'enzymes', 'alcohol'],
  },

  // ── 10. Kidney ───────────────────────────────────────────────────
  {
    goalId: 'goal_kidney_1',
    title: 'Protect kidney function',
    healthImpact: 'Kidney health',
    category: 'kidney',
    recoveryTimeWeeks: [12, 24],
    linkedIssues: ['KID-EGFR-01', 'KID-UACR-01'],
    protocolItems: [
      {
        productName: 'Pro-Resolve Omega (EPA/DHA, reduced dose)',
        triggerBiomarkers: ['creatinine', 'egfr', 'bun'],
        contraindications: { medications: ['anticoagulant', 'warfarin'], allergies: ['fish', 'shellfish'] },
        dosing: '1 g EPA+DHA daily with a meal. Use reduced dose for renal caution.',
      },
      {
        productName: 'CoQ10 (Ubiquinol)',
        triggerBiomarkers: ['creatinine', 'egfr'],
        contraindications: { medications: ['anticoagulant', 'warfarin'], allergies: [] },
        dosing: '100-200 mg ubiquinol daily with food.',
      },
    ],
    goalAlignmentKeywords: ['kidney', 'renal', 'creatinine', 'filtration'],
  },

  // ── 11. Body Composition ─────────────────────────────────────────
  {
    goalId: 'goal_body_comp_1',
    title: 'Improve body composition',
    healthImpact: 'Body composition',
    category: 'body_composition',
    recoveryTimeWeeks: [12, 24],
    linkedIssues: ['BODY-OBESITY-01', 'MET-SYNDROME-01'],
    protocolItems: [
      {
        productName: 'AMINO9 (Essential Amino Acids)',
        triggerBiomarkers: ['bmi'],
        contraindications: { medications: [], allergies: [] },
        dosing: '1 scoop (10 g EAAs) peri-workout or between meals.',
      },
      {
        productName: 'Creatine Monohydrate',
        triggerBiomarkers: [],
        contraindications: { medications: [], allergies: [] },
        dosing: '5 g daily, any time. Mix with water or a shake.',
      },
      {
        productName: 'Whey Protein Isolate',
        triggerBiomarkers: ['albumin', 'total_protein'],
        contraindications: { medications: [], allergies: ['dairy', 'lactose'] },
        dosing: '25-30 g per serving, 1-2 times daily to meet protein targets.',
      },
    ],
    goalAlignmentKeywords: ['body composition', 'muscle', 'fat loss', 'weight', 'lean', 'strength', 'fitness'],
  },
];


module.exports = { GOAL_TEMPLATES };
