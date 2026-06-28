const { narrateStart, narrateEnd } = require("../src/services/toolNarration");
const cases = [
  ["getMedicalData", { include: ["reports"] }, "concierge"],
  ["getWearableData", { days: 30 }, "doctor"],
  ["recallMemories", { query: "sleep" }, "concierge"],
  ["unknownTool", {}, "concierge"],
];
let ok = true;
for (const [name, input, persona] of cases) {
  const s = narrateStart(name, input, persona);
  if (!s || /undefined/.test(s)) { ok = false; console.log("FAIL start", name, s); }
  else console.log("ok start", persona, name, "->", s);
}
const meal = narrateEnd("getMealData", { totalMeals: 2 });
if (meal !== "Looked over 2 logged meal(s).") { ok = false; console.log("FAIL meal end:", meal); }
else console.log("ok end getMealData ->", meal);
const fail = narrateEnd("getMealData", { error: "x" });
if (fail !== null) { ok = false; console.log("FAIL error end should be null:", fail); }
else console.log("ok end on error -> null");
console.log(ok ? "ALL PASS" : "FAILURES");
process.exit(ok ? 0 : 1);
