const { querySonar } = require("../services/perplexity");

const MEDICAL_DOMAINS = [
  'ncbi.nlm.nih.gov',
  'pubmed.ncbi.nlm.nih.gov',
  'nejm.org',
  'thelancet.com',
  'jamanetwork.com',
  'nature.com',
  'bmj.com',
  'journals.plos.org',
  'diabetes.diabetesjournals.org',
  'ahajournals.org',
  'who.int',
];

const definition = {
  name: 'searchMedicalEvidence',
  description: 'Search peer-reviewed medical literature (PubMed, NEJM, Lancet, JAMA, Nature) for clinical trial data, treatment guidelines, and evidence-based recommendations. Use for any clinical or medical question. Returns a synthesized answer with citations from medical journals. ALWAYS prefer this over webSearch for clinical questions.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The clinical or medical research question (e.g. "cardiovascular outcomes of semaglutide", "GLP-1 dose escalation evidence", "semaglutide weight loss SELECT trial")',
      },
    },
    required: ['query'],
  },
};

async function execute(input, userId, chatId) {
  return querySonar({
    model: 'sonar-pro',
    query: input.query,
    systemPrompt: 'You are a medical research assistant. Search peer-reviewed medical literature. Cite specific studies, trial names, sample sizes, and key statistics. Be precise and evidence-based.',
    searchDomainFilter: MEDICAL_DOMAINS,
    searchContextSize: 'high',
  });
}

module.exports = { definition, execute };
