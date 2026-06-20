// Product catalogue — hardcoded until store DB is live.
// To connect a real DB: replace the CATALOGUE lookup with a mongoose query.

const CATALOGUE = {
  'AMINO9': {
    name: 'AMINO9',
    tagline: 'Essential Amino Acid Complex',
    category: 'Lean Mass Preservation',
    description: 'A clinically-formulated 9-EAA blend designed to prevent GLP-1-induced muscle loss and support muscle protein synthesis during caloric restriction or metabolic optimisation.',
    keyBenefits: [
      'Prevents 30-45% lean mass loss during GLP-1 therapy',
      'Triggers muscle protein synthesis without extra calories',
      'Bioavailable EAA ratio optimised for sarcopenia prevention',
    ],
    standardDose: '1 serving (9g) post-resistance training daily',
    enhancedDose: '2 servings/day (morning + post-training) for confirmed lean mass deficit',
    bestFor: ['GLP-1 therapy', 'Sarcopenia prevention', 'Body recomposition', 'Protein-deficient diet'],
    brand: 'Cyborg',
  },
  'MITOHEART': {
    name: 'MITOHEART',
    tagline: 'Mitochondrial + Cardiovascular Complex',
    category: 'Cardiovascular & Longevity',
    description: 'A precision stack combining CoQ10, EPA/DHA omega-3, and mitochondrial cofactors — formulated for atherogenic risk reduction, mitochondrial rejuvenation, and vascular inflammation.',
    keyBenefits: [
      'EPA/DHA 4g: Level 1 RCT evidence for TG reduction (15-30%) and CRP reduction',
      'CoQ10 200mg: replenishes statin-induced depletion (statins reduce CoQ10 by 40-50%)',
      'Full mitochondrial stack for accelerated biological aging',
    ],
    standardDose: 'Full stack daily with food',
    enhancedDose: 'Omega-3 2g only if eGFR < 60 (CKD G3+ caution)',
    bestFor: ['Elevated triglycerides', 'High LDL/ApoB', 'Statin users', 'Elevated hsCRP', 'Biological age acceleration'],
    brand: 'Cyborg',
  },
};

// Fuzzy match — allows AI to pass slightly different names
function resolveProduct(name) {
  if (!name) return null;
  // Exact match first
  if (CATALOGUE[name]) return CATALOGUE[name];
  // Case-insensitive match
  const lower = name.toLowerCase();
  const key = Object.keys(CATALOGUE).find(k => k.toLowerCase() === lower);
  if (key) return CATALOGUE[key];
  // Partial match (e.g. "amino9" -> "AMINO9")
  const partial = Object.keys(CATALOGUE).find(k => lower.includes(k.toLowerCase()) || k.toLowerCase().includes(lower));
  return partial ? CATALOGUE[partial] : null;
}

const definition = {
  name: 'suggestMedication',
  description: 'Recommend a product when a clinical trigger condition is met. Use the exact product name: "AMINO9" or "MITOHEART". Always include a personalised reason derived from the user\'s data.',
  input_schema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        enum: ['AMINO9', 'MITOHEART'],
        description: 'Exact product name.',
      },
      reason: {
        type: 'string',
        description: 'Personalised 1-2 sentence explanation of why this product is indicated for this specific user based on their data, labs, or GLP-1 status.',
      },
      dose: {
        type: 'string',
        description: 'Which dose applies to this user: "standard" or "enhanced". Omit if not applicable (e.g. GLP-1 products).',
      },
    },
    required: ['name', 'reason'],
  },
};

async function execute(input, userId, chatId) {
  const product = resolveProduct(input.name);

  if (!product) {
    return {
      error: `Unknown product "${input.name}". Available: AMINO9, MITOHEART.`,
    };
  }

  const useEnhanced = input.dose === 'enhanced' && product.enhancedDose;
  const dosing = useEnhanced ? product.enhancedDose : product.standardDose;

  return {
    name: product.name,
    tagline: product.tagline,
    category: product.category,
    brand: product.brand,
    description: product.description,
    keyBenefits: product.keyBenefits,
    dosing,
    bestFor: product.bestFor,
    reason: input.reason,
    // Store fields — populated when catalogue DB is live
    price: null,
    inStock: true,
    imageUrl: null,
    storeUrl: null,
  };
}

module.exports = { definition, execute };
