const Questionnaire = require("../src/models/Questionnaire");

const QUESTIONARY_DATA = [
  {
    id: "1",
    questions: [
      {
        code: "1.1",
        title: "Health is personal.",
        description:
          "Your health isn't one-size-fits-all. Understanding your story helps us provide the best care tailored to you. Complete the survey in one go for the best experience - it takes about 15 minutes.",
        type: "intro",
      },
      { code: "1.2", title: "What do you like to be called?", type: "text", placeholder: "Tell us here..." },
      { code: "1.3", title: "What biological sex were you assigned at birth?", type: "single", options: ["Male", "Female"] },
      {
        code: "1.4",
        title: "What is your ethnicity?",
        subtitle:
          "This information helps us better understand health patterns across different communities and provide more personalized care.",
        type: "multi",
        options: [
          "American Indian or Alaska Native",
          "Asian",
          "Black or African American",
          "Hispanic or Latino",
          "Native Hawaiian or Other Pacific Islander",
          "White",
          "Other (please specify)",
          "Prefer not to say",
        ],
      },
      { code: "1.5", title: "What is your weight (lbs)?", type: "text", placeholder: "Tell us here..." },
      { code: "1.6", title: "What is your height (ft/in)?", type: "height" },
      { code: "1.7", title: "What do you do for work?", type: "text", placeholder: "Tell us here..." },
    ],
  },
  {
    id: "2",
    questions: [
      {
        code: "2.1",
        title: "Habits are the building blocks of a healthy life.",
        description:
          "Let's take a look at how you eat, move and sleep so we can craft the most effective plan for you.",
        type: "intro",
      },
      {
        code: "2.2",
        title: "Do you follow any of the following diets (≥70% of the time)?",
        type: "multi",
        options: [
          "No specific diet",
          "Vegetarian",
          "Vegan",
          "Pescatarian",
          "Keto",
          "Paleo",
          "Carnivore",
          "Animal-Based (70% animal protein/fats)",
          "Low Carb",
          "Mediterranean",
          "AIP",
          "Low FODMAP",
          "Other (please specify)",
        ],
      },
      { code: "2.3", title: "If you selected Other, please specify", type: "text", placeholder: "Tell us here..." },
      {
        code: "2.4",
        title: "How often do you exercise?",
        type: "single",
        options: [
          "Sedentary (0-1 times per week)",
          "Light (1-2 times per week)",
          "Moderate (2-3 times per week)",
          "Regular (4+ times per week)",
          "Intensive (athlete-level, near-daily)",
        ],
      },
      {
        code: "2.5",
        title: "Which types of exercise or activities do you do most frequently?",
        subtitle: "Select all that apply.",
        type: "multi",
        options: [
          "Cardio (running, cycling, swimming)",
          "Strength / Weights",
          "HIIT",
          "Yoga / Pilates",
          "Sports (basketball, tennis, soccer)",
          "Low-impact (walking, hiking, stretching)",
          "Other (please specify)",
        ],
      },
      { code: "2.6", title: "If you selected Other, please specify", type: "text", placeholder: "Tell us here..." },
      {
        code: "2.7",
        title: "On average, how many hours of sleep do you get per night?",
        type: "single",
        options: ["8+", "7 - 8", "6 - 7", "5 - 6", "<5"],
      },
      {
        code: "2.8",
        title: "How would you describe your typical sleep quality?",
        type: "single",
        options: [
          "Excellent: Easy to fall asleep, restful",
          "Good: Minor issues",
          "Fair: Occasional difficulty",
          "Poor: Frequent issues",
          "Very poor: Severe insomnia / unrestful",
        ],
      },
      {
        code: "2.9",
        title: "Which of the following best describes your cigarette or tobacco use?",
        type: "single",
        options: [
          "I have never smoked",
          "I used to smoke but quit",
          "I smoke occasionally (less than daily)",
          "I smoke daily - less than 5 cigarettes per day",
          "I smoke daily - 5 to 10 cigarettes per day",
          "I smoke daily - more than 10 cigarettes per day",
          "I only smoke non-tobacco products (i.e. vapes, marijuana)",
        ],
      },
      {
        code: "2.10",
        title: "On average, how often do you drink alcohol?",
        type: "single",
        options: [
          "Never",
          "Used to drink but stopped",
          "Occasionally (less than once per week)",
          "1-5 drinks per week",
          "1-2 drinks per day",
          "More than 3 drinks per day",
        ],
      },
      {
        code: "2.11",
        title: "Is there anything about your lifestyle (diet, exercise, sleep, etc) you want to add or that we didn't cover?",
        type: "textarea",
        placeholder: "Tell us here...",
      },
    ],
  },
  {
    id: "3",
    questions: [
      {
        code: "3.1",
        title: "Your health journey is uniquely yours.",
        description:
          "Tell us about any diagnoses, symptoms and medications you use. Any details are helpful so we can make effective recommendations. The more we know, the better we can support you.",
        type: "intro",
      },
      {
        code: "3.2",
        title: "What chronic condition(s) do you have?",
        subtitle: "Select all that apply.",
        type: "multi",
        options: [
          "Digestive/gut issues (IBS, IBD, reflux, etc)",
          "Heart disease (incl. hypertension, high cholesterol)",
          "Diabetes / Prediabetes",
          "Autoimmune disease (Celiac, Hashimoto's, RA, etc)",
          "Kidney disease",
          "Skin conditions (eczema, psoriasis, acne, rashes)",
          "Mental health (anxiety, depression, ADHD, etc)",
          "Neurodegenerative disease (Alzheimer's, Parkinson's, dementia)",
          "Allergies (seasonal, food, chemical)",
          "Other (please specify)",
        ],
      },
      { code: "3.3", title: "If you selected Other, please specify", type: "text", placeholder: "Tell us here..." },
      {
        code: "3.4",
        title: "Tell us more about your medical history - the more detail, the better",
        type: "textarea",
        placeholder: "Tell us here...",
      },
      {
        code: "3.5",
        title: "Do you currently have any active symptoms affecting your health day-to-day?",
        subtitle: "Select all that apply.",
        type: "multi",
        options: [
          "Fatigue",
          "Digestive issues (bloating, constipation, diarrhea)",
          "Heart/circulation issues (high BP, cholesterol, poor circulation)",
          "Weight/metabolism (weight change, cravings, blood sugar swings)",
          "Sleep, hormone issues (PMS, irregular cycles, low libido, hot flashes, poor sleep)",
          "Inflammation/pain (joints, muscles, headaches, chronic pain)",
          "Skin/hair issues (rashes, acne, thinning, loss)",
          "Frequent illness (colds, infections, low immunity)",
          "Other (please specify)",
        ],
      },
      { code: "3.6", title: "If you selected Other, please specify", type: "text", placeholder: "Tell us here..." },
      {
        code: "3.7",
        title: "Please list any prescription medications you are currently taking, including the dose and frequency.",
        type: "textarea",
        placeholder: "For example: Metformin, 500mg once per day",
      },
      { code: "3.8", title: "Please list any vitamins and / or supplements you are currently taking.", type: "textarea" },
      { code: "3.9", title: "Please list any surgeries you've had, including the year it was performed.", type: "textarea" },
      {
        code: "3.10",
        title:
          "Do you have any significant health conditions that run in your family? This will help us personalize proactive recommendations & insights to help mitigate risk.",
        subtitle: "Select all that apply.",
        type: "multi",
        options: [
          "Heart disease / high cholesterol / high BP",
          "Diabetes / blood sugar issues",
          "Thyroid disorders",
          "Autoimmune conditions",
          "Cancer",
          "Neurodegenerative disease",
          "None",
          "Other (please specify)",
        ],
      },
      { code: "3.11", title: "If you selected Other, please specify", type: "text", placeholder: "Tell us here..." },
      { code: "3.12", title: "Please add any details you want us to know (for example: \"family history of breast cancer\" or \"my dad has high blood pressure\"). Try to include as much detail as possible.", type: "textarea" },
      { code: "3.13", title: "Is there anything about your medical history you want to add or that we didn't cover?", type: "textarea", placeholder: "Tell us here..." },
    ],
  },
  {
    id: "4",
    questions: [
      {
        code: "4.1",
        title:
          "Are you interested in discussing any of the following RX (prescription) treatments with your Superpower clinical team?",
        subtitle:
          "Note: You will not be charged for any services by selecting any of the options below. It will only notify your clinician of your interest in the service.",
        type: "multi",
        options: [
          "Metabolic health (GLP-1s, blood sugar, insulin resistance, weight)",
          "Skin health (topical peptides, complexion, aging)",
          "Longevity (NAD+, glutathione, rapamycin, metformin, LDN, etc)",
          "Hair loss (finasteride, dutasteride, minoxidil)",
          "Women's hormone health (oral/topical, personalized)",
          "Men's hormone health (testosterone stimulation)",
          "None",
        ],
      },
      {
        code: "4.2",
        title: "How interested are you in pursuing treatment?",
        type: "single",
        options: [
          "I'm currently taking treatment for this issue",
          "Very interested (I'm actively seeking help)",
          "Curious (I just want to learn more)",
          "Not interested",
        ],
      },
    ],
  },
  {
    id: "5",
    questions: [
      {
        code: "5.1",
        title: "Tell us about what you want to achieve so we can help you get there.",
        description:
          "It's time to get clear on what truly drives you. Think of this as your \"why.\" The more we understand your motivations and challenges, the better health guidance you'll achieve.",
        type: "intro",
      },
      {
        code: "5.2",
        title: "What are you most hoping to accomplish with Superpower?",
        subtitle: "Select all that apply.",
        type: "multi",
        options: [
          "Get root-cause insights into a health challenge or symptom",
          "Screen my risk for conditions & work on prevention",
          "Unlock new ways to optimize my health",
          "Understand my health at a deeper level",
          "Other (please specify)",
        ],
      },
      { code: "5.3", title: "If you selected Other, please specify", type: "text", placeholder: "Tell us here..." },
      {
        code: "5.4",
        title: "Over the course of a year, how much do you budget for health? (excluding insurance)",
        type: "single",
        options: ["<$1,000", "1,000 - 2,000", "2,000 - 5,000", "5,000 - 15,000", "15,000+"],
      },
      {
        code: "5.5",
        title: "Are there any areas you want to focus on for improving your health?",
        subtitle: "Select all that apply.",
        type: "multi",
        options: ["Products", "Medications", "Nutrition", "Exercise", "Lifestyle", "Other"],
      },
      {
        code: "5.6",
        title:
          "We craft your results in language you can understand. How technical would you like your results presented to you?",
        type: "scale",
        options: ["1", "2", "3", "4", "5"],
      },
    ],
  },
];

const seedQuestionnaire = async () => {
  try {
    const existing = await Questionnaire.findOne();

    if (existing) {
      console.log("✓ Questionnaire already seeded");
      return;
    }

    await Questionnaire.create({ questionary: QUESTIONARY_DATA });
    console.log("✓ Questionnaire seeded successfully");
  } catch (error) {
    console.error("✗ Error seeding questionnaire:", error.message);
  }
};

module.exports = seedQuestionnaire;
