const generateDoctorAIResponse = async (query, userId) => {
  // Simulate AI processing time
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // Mock responses based on query keywords for doctor-specific questions
  const queryLower = query.toLowerCase();

  if (queryLower.includes("patient") && (queryLower.includes("history") || queryLower.includes("record"))) {
    return {
      answer:
        "Based on the patient's medical history:\n\n**Recent Visits:**\n- Last consultation: 2 weeks ago for routine checkup\n- Previous visit: Blood work analysis showing elevated cholesterol\n\n**Current Medications:**\n- Atorvastatin 20mg daily\n- Metformin 500mg twice daily\n\n**Allergies:**\n- Penicillin (moderate reaction)\n- Sulfa drugs\n\n**Family History:**\n- Type 2 Diabetes (father)\n- Hypertension (mother)\n\nWould you like more detailed information about any specific aspect?",
      citations: [
        {
          chunk_id: "patient-001",
          url: "/medical_records/patient_history_2024.pdf",
          page: 3,
          section: "Medical History",
          text: "Patient presents with family history of Type 2 Diabetes and Hypertension. Currently managing cholesterol levels with Atorvastatin 20mg daily.",
        },
        {
          chunk_id: "patient-002",
          url: "/medical_records/allergy_records.pdf",
          page: 1,
          section: "Known Allergies",
          text: "Patient has documented allergies to Penicillin (moderate reaction, hives) and Sulfa-based medications. Alternative antibiotics recommended.",
        },
      ],
    };
  }

  if (queryLower.includes("drug") && (queryLower.includes("interaction") || queryLower.includes("contraindication"))) {
    return {
      answer:
        "**Drug Interaction Analysis:**\n\nFor the current medication regimen:\n\n**Major Interactions:**\n- None detected with current medications\n\n**Moderate Interactions:**\n- Atorvastatin + Grapefruit juice: May increase statin levels\n- Metformin + Alcohol: Increased risk of lactic acidosis\n\n**Recommendations:**\n- Advise patient to avoid grapefruit products\n- Limit alcohol consumption while on Metformin\n- Monitor liver function tests quarterly\n- Check renal function before adjusting Metformin dosage\n\n**Alternative Options:**\nIf interactions become problematic, consider Rosuvastatin as alternative statin.",
      citations: [
        {
          chunk_id: "drug-001",
          url: "/guidelines/drug_interactions_database.pdf",
          page: 156,
          section: "Statin Interactions",
          text: "Atorvastatin metabolism is significantly affected by CYP3A4 inhibitors including grapefruit juice. Plasma concentrations may increase by 40-80% leading to increased risk of myopathy.",
        },
        {
          chunk_id: "drug-002",
          url: "/guidelines/metformin_prescribing.pdf",
          page: 12,
          section: "Contraindications and Warnings",
          text: "Metformin should be used with caution in patients consuming alcohol. Excessive alcohol intake increases risk of lactic acidosis. Regular monitoring of renal function is essential.",
        },
      ],
    };
  }

  if (queryLower.includes("treatment") && (queryLower.includes("protocol") || queryLower.includes("guideline"))) {
    return {
      answer:
        "**Current Treatment Guidelines:**\n\n**For Type 2 Diabetes Management:**\n1. First-line: Metformin (unless contraindicated)\n2. If HbA1c >7% after 3 months, add:\n   - GLP-1 agonist (if cardiovascular disease/risk)\n   - SGLT2 inhibitor (if heart failure/CKD)\n   - DPP-4 inhibitor (alternative)\n\n**For Dyslipidemia:**\n- LDL target: <70 mg/dL (high cardiovascular risk)\n- Statin therapy: High-intensity recommended\n- Consider ezetimibe if target not met\n\n**Monitoring Schedule:**\n- HbA1c: Every 3 months until stable, then every 6 months\n- Lipid panel: Every 3-6 months\n- Renal function: Every 6-12 months\n- Annual comprehensive metabolic panel",
      citations: [
        {
          chunk_id: "treatment-001",
          url: "/guidelines/ADA_diabetes_standards_2024.pdf",
          page: 45,
          section: "Pharmacologic Approaches to Glycemic Treatment",
          text: "Metformin remains the preferred first-line agent for type 2 diabetes. If HbA1c target not achieved after 3 months of metformin therapy, combination therapy should be initiated based on patient comorbidities and preferences.",
        },
        {
          chunk_id: "treatment-002",
          url: "/guidelines/ACC_lipid_management.pdf",
          page: 28,
          section: "Cholesterol Treatment Guidelines",
          text: "For patients with established cardiovascular disease or diabetes with additional risk factors, LDL-C goal is <70 mg/dL. High-intensity statin therapy is recommended as initial treatment.",
        },
      ],
    };
  }

  if (queryLower.includes("diagnos") || queryLower.includes("symptom") || queryLower.includes("differential")) {
    return {
      answer:
        "**Differential Diagnosis Approach:**\n\nBased on presenting symptoms, consider:\n\n**Primary Considerations:**\n1. Metabolic disorders (diabetes, thyroid dysfunction)\n2. Cardiovascular causes (hypertension, heart disease)\n3. Medication side effects\n\n**Red Flags to Assess:**\n- Sudden onset of symptoms\n- Progressive neurological deficits\n- Unexplained weight loss >10% body weight\n- Severe pain or functional impairment\n\n**Recommended Workup:**\n- Comprehensive metabolic panel\n- Lipid panel\n- HbA1c\n- TSH, free T4\n- CBC with differential\n- Urinalysis\n\n**Next Steps:**\n1. Complete history and physical examination\n2. Order baseline laboratory tests\n3. Consider specialist referral if indicated\n4. Schedule follow-up in 2-4 weeks to review results",
    };
  }

  if (queryLower.includes("lab") && (queryLower.includes("result") || queryLower.includes("interpretation"))) {
    return {
      answer:
        "**Laboratory Results Interpretation:**\n\n**Metabolic Panel:**\n- Glucose: Elevated (consistent with diabetes diagnosis)\n- Creatinine: Within normal limits (renal function stable)\n- eGFR: >60 mL/min/1.73m² (no dose adjustment needed)\n\n**Lipid Panel:**\n- Total cholesterol: 220 mg/dL (elevated)\n- LDL-C: 145 mg/dL (above target for diabetic patient)\n- HDL-C: 38 mg/dL (low, increases CV risk)\n- Triglycerides: 185 mg/dL (borderline high)\n\n**HbA1c:**\n- 7.8% (above target of <7%)\n- Average glucose ~180 mg/dL\n- Suggests need for treatment intensification\n\n**Clinical Implications:**\n- Diabetes control suboptimal - consider adding second agent\n- Lipid management inadequate - increase statin dose or add ezetimibe\n- Low HDL - emphasize lifestyle modifications (exercise, weight loss)",
      citations: [
        {
          chunk_id: "lab-001",
          url: "/patient_labs/recent_results.pdf",
          page: 2,
          section: "Lipid Panel Results",
          text: "Total cholesterol: 220 mg/dL, LDL-C: 145 mg/dL, HDL-C: 38 mg/dL, Triglycerides: 185 mg/dL. Results indicate dyslipidemia requiring intervention.",
        },
      ],
    };
  }

  // Default response for general medical queries
  return {
    answer:
      "**Medical AI Assistant for Physicians**\n\nI can help you with:\n\n- Patient medical history and records review\n- Drug interaction and contraindication checks\n- Treatment protocol and clinical guideline references\n- Laboratory result interpretation\n- Differential diagnosis support\n- Evidence-based medicine references\n- Clinical decision support\n\nPlease provide more specific details about your query for accurate medical information. Remember, this AI is designed to support clinical decision-making, not replace professional medical judgment.\n\nWhat specific aspect would you like to explore?",
  };
};

module.exports = {
  generateDoctorAIResponse,
};
