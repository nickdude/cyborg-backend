// src/services/toolNarration.js
// Pure, provider-independent. Maps a tool call to a human "second-brain" line.
// persona: 'concierge' (warm, user-facing) | 'doctor' (peer-consultant).

const START = {
  concierge: {
    getMedicalData: (i) => {
      const inc = (i && i.include) || [];
      if (inc.includes("reports")) return "Pulling your latest lab panel…";
      if (inc.includes("onboarding")) return "Reviewing your health profile…";
      if (inc.includes("profile")) return "Checking your profile…";
      return "Reviewing your medical data…";
    },
    getWearableData: (i) =>
      (i && i.days >= 30)
        ? "Looking at your last month of recovery and sleep…"
        : "Reviewing your recent wearable trends…",
    getMealData: () => "Looking over your recent meals…",
    recallMemories: (i) =>
      (i && i.query) ? `Recalling what we've discussed about ${i.query}…`
                     : "Recalling what we've discussed before…",
    saveMemory: () => "Noting that for next time…",
    searchChatHistory: () => "Searching our past conversations…",
    fetchFullChat: () => "Reopening that earlier session…",
    searchMedicalEvidence: (i) =>
      (i && i.query) ? `Cross-referencing the evidence on ${i.query}…`
                     : "Cross-referencing peer-reviewed evidence…",
    webSearch: (i) =>
      (i && i.query) ? `Checking current sources on ${i.query}…`
                     : "Checking current sources…",
    suggestMedication: () => "Matching this to your protocol…",
    getSchemaInfo: () => "Checking what data I have on you…",
  },
  doctor: {
    getMedicalData: (i) => {
      const inc = (i && i.include) || [];
      if (inc.includes("reports")) return "Pulling the patient's flagged labs…";
      if (inc.includes("onboarding")) return "Reviewing the patient's intake…";
      return "Reviewing the patient's medical data…";
    },
    getWearableData: () => "Reviewing the patient's wearable trends…",
    searchChatHistory: () => "Searching the patient's prior sessions…",
    fetchFullChat: () => "Opening the referenced session…",
    searchMedicalEvidence: (i) =>
      (i && i.query) ? `Cross-referencing the evidence on ${i.query}…`
                     : "Cross-referencing the clinical evidence…",
    webSearch: (i) =>
      (i && i.query) ? `Checking current sources on ${i.query}…`
                     : "Checking current sources…",
    suggestMedication: () => "Checking the protocol options…",
    getSchemaInfo: () => "Checking the available patient data…",
  },
};

function narrateStart(name, input, persona = "concierge") {
  const table = START[persona] || START.concierge;
  const fn = table[name];
  if (fn) return fn(input || {});
  // Safe generic fallback so a new tool still narrates.
  return `Working on ${String(name).replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()}…`;
}

// Short, deterministic post-tool takeaway. Never echo raw JSON/ids.
function narrateEnd(name, result) {
  if (!result || result.error) return null; // no end-line on failure
  switch (name) {
    case "getWearableData":
      // 0-days means no data was found — say nothing rather than "Reviewed 0 day(s)"
      return (typeof result.daysFound === "number" && result.daysFound > 0)
        ? `Reviewed ${result.daysFound} day(s) of wearable data.` : null;
    case "getMealData":
      return (typeof result.totalMeals === "number" && result.totalMeals > 0)
        ? `Looked over ${result.totalMeals} logged meal(s).` : null;
    case "recallMemories": {
      const n = typeof result.result_count === "number"
        ? result.result_count
        : (Array.isArray(result.results) ? result.results.length : null);
      return (n != null && n > 0) ? `Recalled ${n} relevant note(s).` : null;
    }
    case "searchChatHistory": {
      const n = result.resultCount ?? result.result_count ?? (Array.isArray(result.results) ? result.results.length : null);
      return (n != null && n > 0) ? `Found ${n} related past chat(s).` : null;
    }
    case "searchMedicalEvidence":
    case "webSearch": {
      const c = Array.isArray(result.citations) ? result.citations.length : null;
      return (c != null && c > 0) ? `Pulled ${c} source(s).` : null;
    }
    case "saveMemory":
      return result.saved ? "Saved." : null;
    default:
      return null;
  }
}

module.exports = { narrateStart, narrateEnd };
