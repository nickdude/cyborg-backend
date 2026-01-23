const generateMockAIResponse = async (query, userId) => {
  // Simulate AI processing time
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // Mock responses based on query keywords
  const queryLower = query.toLowerCase();

  if (queryLower.includes("glp-1") || queryLower.includes("glp1")) {
    return {
      answer:
        "GLP-1 references from the provided source include:\n- Trujillo JM, Nuffer W, Smith BA. \"GLP-1 receptor agonists: an updated review of head-to-head clinical studies.\" Ther Adv Endocrinol Metab. 2021;12:1–15.\n- Jain Ab, Ali A, Gorgojo Martínez JJ, et al. \"Switching between GLP-1 receptor agonists in clinical practice: expert consensus and practical guidance.\" Int J Clin Pract. 2021;75(2):e13731.\n- Kanoski SE, Hayes MR, Skibicka KP. \"GLP-1 and weight loss: unraveling the diverse neural circuitry.\" Am J Physiol Regul Integr Comp Physiol. 2016;310(10):R885–R895.\n- \"GLP-1 receptor agonists in the treatment of type 2 diabetes - state-of-the-art.\" Mol Metab. 2021;46:101102.",
      citations: [
        {
          chunk_id: "aa0a0505-fd9e-4fce-8342-4831aed35c2b",
          url: "/research/papers/Managing_gastrointestinal.pdf",
          page: 7,
          section: null,
          text: "18. Trujillo JM, Nuffer W, Smith BA. GLP-1 receptor agonists: an updated review of head-to-head clinical studies. Ther Adv Endocrinol Metab. 2021;12:1–15.\n27. Jain Ab, Ali A, Gorgojo Martínez JJ, et al. Switching between GLP-1",
        },
        {
          chunk_id: "72749907-de71-4f7f-989f-2ddd506dab99",
          url: "/research/papers/Managing_gastrointestinal.pdf",
          page: 7,
          section: null,
          text: "27. Jain Ab, Ali A, Gorgojo Martínez JJ, et al. Switching between GLP-1 receptor agonists in clinical practice: expert consensus and practical guidance. Int J Clin Pract. 2021;75(2):e13731.\n19.Kanoski SE, Hayes MR, Skibicka KP. GLP-1 and weight loss: unraveling the diverse neural circuitry. Am J Physiol Regul Integr Comp Physiol. 2016;310(10):R885–R895.",
        },
        {
          chunk_id: "c5d11b0b-8739-4a41-8d9d-eaed0aafa59d",
          url: "/research/papers/Managing_gastrointestinal.pdf",
          page: 6,
          section: null,
          text: "al. GLP-1 receptor agonists in the treatment of type 2 diabetes - state-of-the-art. Mol Metab. 2021;46:101102.",
        },
      ],
    };
  }

  if (queryLower.includes("blood") || queryLower.includes("test")) {
    return {
      answer:
        "Based on your recent blood work, I recommend focusing on these key areas:\n\n1. **Vitamin D Levels**: Your results show suboptimal vitamin D levels. Consider supplementation with 4000 IU daily and increase sun exposure.\n\n2. **Cholesterol Management**: LDL cholesterol is slightly elevated. Focus on omega-3 rich foods like fatty fish 3x per week.\n\n3. **Blood Sugar**: Fasting glucose is within normal range. Continue current dietary habits.\n\nWould you like more specific recommendations for any of these areas?",
      citations: [
        {
          chunk_id: "blood-001",
          url: "/reports/blood_analysis_2024.pdf",
          page: 3,
          section: "Vitamin D Analysis",
          text: "Vitamin D deficiency is common and can be addressed with supplementation. Recommended dosage: 4000 IU daily for adults with levels below 30 ng/mL.",
        },
      ],
    };
  }

  if (queryLower.includes("diet") || queryLower.includes("nutrition")) {
    return {
      answer:
        "Based on your health profile and goals:\n\n**Macronutrient Recommendations:**\n- Protein: 1.8-2.2g per kg of body weight\n- Healthy fats: 25-35% of total calories (focus on omega-3s)\n- Complex carbohydrates: 45-55% of total calories\n\n**Key Foods to Include:**\n- Fatty fish (salmon, mackerel) 3x per week\n- Leafy greens daily\n- Nuts and seeds\n- Whole grains\n- Lean proteins\n\n**Foods to Limit:**\n- Processed foods\n- Added sugars\n- Refined carbohydrates",
    };
  }

  if (queryLower.includes("exercise") || queryLower.includes("workout")) {
    return {
      answer:
        "Based on your fitness level and goals, here's a recommended exercise plan:\n\n**Weekly Structure:**\n- 3x strength training (full-body or upper/lower split)\n- 2x cardiovascular exercise (Zone 2, 30-45 minutes)\n- 1x HIIT session (20-30 minutes)\n- Daily: 10-15 minutes mobility work\n\n**Key Principles:**\n- Progressive overload: increase weight/reps by 2-5% every 2 weeks\n- Adequate rest: 1-2 complete rest days per week\n- Focus on compound movements (squats, deadlifts, presses)\n- Maintain proper form over heavy weights",
      citations: [
        {
          chunk_id: "exercise-001",
          url: "/research/exercise_recommendations.pdf",
          page: 12,
          section: "Strength Training Guidelines",
          text: "Progressive resistance training with compound movements has been shown to improve both strength and metabolic health. Recommended frequency: 3-4 sessions per week.",
        },
      ],
    };
  }

  // Default response for general queries
  return {
    answer:
      "Thank you for your question. I'm here to help with:\n\n- Blood work analysis and interpretation\n- Nutrition and supplementation guidance\n- Exercise and fitness recommendations\n- Understanding your health metrics\n- GLP-1 and medication information\n\nCould you please provide more specific details about what you'd like to know? For complex medical questions, I recommend consulting with your care team for personalized advice.",
  };
};

module.exports = {
  generateMockAIResponse,
};
