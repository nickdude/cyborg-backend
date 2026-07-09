/**
 * Goal Citations — grounded medical-literature references per goal.
 *
 * Fetches real citations from Perplexity Sonar (restricted to peer-reviewed
 * medical domains) for each goal's finding, at generation time. Citations are
 * template-level (the evidence for a given goalId is the same for every patient),
 * so we reuse citations already stored on ANY prior goal with the same goalId —
 * making steady-state cost ~0. Never throws: any failure yields an empty list so
 * goal generation is never blocked.
 */

const { querySonar } = require("./perplexity");
const Goal = require("../models/Goal");

// Same restricted set used by tools/searchMedicalEvidence.js.
const MEDICAL_DOMAINS = [
  "ncbi.nlm.nih.gov",
  "pubmed.ncbi.nlm.nih.gov",
  "nejm.org",
  "thelancet.com",
  "jamanetwork.com",
  "nature.com",
  "bmj.com",
  "journals.plos.org",
  "diabetes.diabetesjournals.org",
  "ahajournals.org",
  "who.int",
];

const DOMAIN_LABELS = {
  "pubmed.ncbi.nlm.nih.gov": "PubMed",
  "ncbi.nlm.nih.gov": "NCBI",
  "nejm.org": "NEJM",
  "thelancet.com": "The Lancet",
  "jamanetwork.com": "JAMA",
  "nature.com": "Nature",
  "bmj.com": "BMJ",
  "who.int": "WHO",
  "ahajournals.org": "AHA Journals",
  "journals.plos.org": "PLOS",
  "diabetes.diabetesjournals.org": "Diabetes Journals",
};

const labelFor = (d) => DOMAIN_LABELS[d] || String(d || "").replace(/^www\./, "");

function buildQuery(goal) {
  const markers = (goal.biomarkerEvidence || [])
    .slice(0, 3)
    .map((b) => b.name)
    .filter(Boolean)
    .join(", ");
  return (
    `Summarize the peer-reviewed clinical evidence on ${goal.title}` +
    (markers ? ` and the biomarkers ${markers}` : "") +
    `: associated health risks and evidence-based interventions. Cite specific studies.`
  );
}

// Reuse citations already stored on ANY goal sharing this goalId (cross-patient cache).
async function fromCache(goalId) {
  try {
    const hit = await Goal.findOne({ goalId, "citations.0": { $exists: true } })
      .select("citations")
      .sort({ createdAt: -1 })
      .lean();
    return hit?.citations?.length ? hit.citations : null;
  } catch {
    return null;
  }
}

async function fetchGoalCitations(goal) {
  try {
    const cached = await fromCache(goal.goalId);
    if (cached) return cached;

    const res = await querySonar({
      model: "sonar-pro",
      query: buildQuery(goal),
      systemPrompt:
        "You are a medical research assistant. Cite peer-reviewed studies only.",
      searchDomainFilter: MEDICAL_DOMAINS,
      searchContextSize: "high",
    });
    if (!res || res.error || !Array.isArray(res.citations)) return []; // graceful

    const seen = new Set();
    return res.citations
      .filter((c) => c?.url && !seen.has(c.url) && seen.add(c.url))
      .slice(0, 5)
      .map((c) => ({
        url: c.url,
        domain: c.domain || "",
        source: labelFor(c.domain),
        title: c.title || labelFor(c.domain),
      }));
  } catch {
    return []; // NEVER break goal generation
  }
}

// Fan out across goals; a single goal's failure is isolated.
async function attachCitations(goals) {
  const results = await Promise.allSettled((goals || []).map(fetchGoalCitations));
  (goals || []).forEach((g, i) => {
    g.citations = results[i].status === "fulfilled" ? results[i].value : [];
  });
  return goals;
}

module.exports = { attachCitations, fetchGoalCitations };
