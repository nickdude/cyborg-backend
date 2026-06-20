/**
 * Seed script: Creates a fully populated test user with all related data
 * in the cyborg_merger database.
 *
 * Usage: node scripts/seedTestUser.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const bcryptjs = require("bcryptjs");

async function seed() {
  console.log("[Seed] Connecting to MongoDB...");
  await mongoose.connect(process.env.MONGO_URI);
  console.log("[Seed] Connected to:", mongoose.connection.name);

  // Load models
  const User = require("../src/models/User");
  const OnboardingAnswer = require("../src/models/OnboardingAnswer");
  const ReferralSource = require("../src/models/ReferralSource");
  const Notification = require("../src/models/Notification");
  const Subscription = require("../src/models/Subscription");
  const Questionnaire = require("../src/models/Questionnaire");
  const ReportData = require("../src/models/ReportData");
  const Chat = require("../src/models/Chat");
  const WearableData = require("../src/models/WearableData");
  const SchemaInfo = require("../src/models/SchemaInfo");

  // Clean existing data
  console.log("[Seed] Clearing existing data...");
  await Promise.all([
    User.deleteMany({}),
    OnboardingAnswer.deleteMany({}),
    ReferralSource.deleteMany({}),
    Notification.deleteMany({}),
    Subscription.deleteMany({}),
    Questionnaire.deleteMany({}),
    ReportData.deleteMany({}),
    Chat.deleteMany({}),
    WearableData.deleteMany({}),
    SchemaInfo.deleteMany({}),
  ]);

  // ============================================================
  // 1. QUESTIONNAIRE (seeded first, referenced by onboarding)
  // ============================================================
  console.log("[Seed] Creating questionnaire...");
  const questionnaire = await Questionnaire.create({
    questionary: {
      version: "2.0",
      sections: [
        {
          id: "personal",
          title: "Personal Information",
          questions: [
            { id: "1.1", label: "First Name", type: "text" },
            { id: "1.2", label: "Last Name", type: "text" },
            { id: "1.3", label: "Biological Sex", type: "select", options: ["Male", "Female", "Other"] },
            { id: "1.4", label: "Ethnicity", type: "text" },
            { id: "1.5", label: "Weight (kg)", type: "number" },
            { id: "1.6", label: "Height (cm)", type: "number" },
            { id: "1.7", label: "Occupation", type: "text" },
          ],
        },
        {
          id: "lifestyle",
          title: "Lifestyle",
          questions: [
            { id: "2.1", label: "Diet Type", type: "select", options: ["Omnivore", "Vegetarian", "Vegan", "Keto", "Paleo", "Mediterranean"] },
            { id: "2.2", label: "Exercise Frequency", type: "select", options: ["Sedentary", "1-2x/week", "3-4x/week", "5+x/week"] },
            { id: "2.3", label: "Exercise Types", type: "multiselect", options: ["Cardio", "Weight Training", "Yoga", "Swimming", "Running", "Cycling"] },
            { id: "2.4", label: "Sleep Hours", type: "number" },
            { id: "2.5", label: "Sleep Quality", type: "select", options: ["Poor", "Fair", "Good", "Excellent"] },
            { id: "2.6", label: "Smoking", type: "select", options: ["Never", "Former", "Current"] },
            { id: "2.7", label: "Alcohol", type: "select", options: ["None", "Occasional", "Moderate", "Heavy"] },
          ],
        },
        {
          id: "medical",
          title: "Medical History",
          questions: [
            { id: "3.1", label: "Current Conditions", type: "multiselect", options: ["Diabetes", "Hypertension", "Heart Disease", "Thyroid", "None"] },
            { id: "3.2", label: "Allergies", type: "text" },
            { id: "3.3", label: "Current Medications", type: "text" },
            { id: "3.4", label: "Supplements", type: "text" },
            { id: "3.5", label: "Symptoms", type: "multiselect", options: ["Fatigue", "Joint Pain", "Brain Fog", "Weight Gain", "Insomnia", "None"] },
            { id: "3.6", label: "Family History", type: "multiselect", options: ["Heart Disease", "Diabetes", "Cancer", "Hypertension", "None"] },
          ],
        },
        {
          id: "rx",
          title: "RX Interests",
          questions: [
            { id: "4.1", label: "GLP-1 Status", type: "select", options: ["Not interested", "Interested", "Currently on GLP-1", "Previously used"] },
            { id: "4.2", label: "RX Interest", type: "select", options: ["None", "Weight Management", "Metabolic Health", "Longevity"] },
            { id: "4.3", label: "RX Readiness", type: "select", options: ["Exploring", "Ready to start", "Already using"] },
          ],
        },
        {
          id: "goals",
          title: "Health Goals",
          questions: [
            { id: "5.1", label: "Primary Goals", type: "multiselect", options: ["Lose Weight", "Build Muscle", "Improve Sleep", "Reduce Stress", "Longevity", "Heart Health", "Metabolic Health"] },
            { id: "5.2", label: "Monthly Budget", type: "select", options: ["Under $50", "$50-$100", "$100-$200", "$200+"] },
            { id: "5.3", label: "Focus Areas", type: "multiselect", options: ["Cardiovascular", "Metabolic", "Hormonal", "Inflammatory", "Nutritional"] },
            { id: "5.4", label: "Technical Level", type: "select", options: ["Beginner", "Intermediate", "Advanced"] },
          ],
        },
      ],
    },
  });

  // ============================================================
  // 2. TEST USER (patient)
  // ============================================================
  console.log("[Seed] Creating test user...");
  const salt = await bcryptjs.genSalt(10);
  const hashedPassword = await bcryptjs.hash("TestUser@123", salt);

  const user = await User.create({
    firstName: "Alex",
    lastName: "Morgan",
    email: "alex.morgan@test.com",
    phone: "9876543210",
    password: hashedPassword,
    userType: "user",
    emailVerified: true,
    phoneVerified: true,
    onboardingCompleted: true,
    hasSeenWelcome: true,
    whereYouHeardAboutUs: "Search Engine",
    profilePicture: "",
    bio: "Health-conscious software engineer focused on longevity and metabolic optimization.",
    biologicalSex: "Male",
    dateOfBirth: new Date("1990-05-15"),
    gender: "Male",
    addressLine1: "42 Wellness Drive",
    addressLine2: "Suite 301",
    city: "San Francisco",
    state: "California",
    zipCode: "94105",
    onboardingData: {
      "1.1": "Alex",
      "1.2": "Morgan",
      "1.3": "Male",
      "1.4": "Caucasian",
      "1.5": 82,
      "1.6": 178,
      "1.7": "Software Engineer",
      "2.1": "Mediterranean",
      "2.2": "3-4x/week",
      "2.3": ["Weight Training", "Running", "Cycling"],
      "2.4": 7,
      "2.5": "Good",
      "2.6": "Never",
      "2.7": "Occasional",
      "3.1": [],
      "3.2": "None",
      "3.3": "None",
      "3.4": "Vitamin D, Omega-3, Magnesium",
      "3.5": ["Fatigue"],
      "3.6": ["Heart Disease", "Diabetes"],
      "4.1": "Interested",
      "4.2": "Metabolic Health",
      "4.3": "Exploring",
      "5.1": ["Longevity", "Heart Health", "Metabolic Health"],
      "5.2": "$100-$200",
      "5.3": ["Cardiovascular", "Metabolic"],
      "5.4": "Intermediate",
      sex: "Male",
      conditions: [],
      medications: [],
      supplements: ["Vitamin D", "Omega-3", "Magnesium"],
      allergies: [],
      symptoms: ["Fatigue"],
      diet: "Mediterranean",
      exerciseFreq: "3-4x/week",
      exerciseTypes: ["Weight Training", "Running", "Cycling"],
      sleepHours: 7,
      sleepQuality: "Good",
      smoking: "Never",
      alcohol: "Occasional",
      goals: ["Longevity", "Heart Health", "Metabolic Health"],
      focusAreas: ["Cardiovascular", "Metabolic"],
      familyHistory: ["Heart Disease", "Diabetes"],
      technicalLevel: "Intermediate",
      glp1Status: "Interested",
      weight: 82,
      height: 178,
    },
    isActive: true,
    isDeleted: false,
  });

  // ============================================================
  // 3. ONBOARDING ANSWERS
  // ============================================================
  console.log("[Seed] Creating onboarding answers...");
  const onboardingAnswer = await OnboardingAnswer.create({
    userId: user._id,
    answers: {
      "1.1": "Alex",
      "1.2": "Morgan",
      "1.3": "Male",
      "1.4": "Caucasian",
      "1.5": 82,
      "1.6": 178,
      "1.7": "Software Engineer",
      "2.1": "Mediterranean",
      "2.2": "3-4x/week",
      "2.3": ["Weight Training", "Running", "Cycling"],
      "2.4": 7,
      "2.5": "Good",
      "2.6": "Never",
      "2.7": "Occasional",
      "3.1": [],
      "3.2": "None",
      "3.3": "None",
      "3.4": "Vitamin D, Omega-3, Magnesium",
      "3.5": ["Fatigue"],
      "3.6": ["Heart Disease", "Diabetes"],
      "4.1": "Interested",
      "4.2": "Metabolic Health",
      "4.3": "Exploring",
      "5.1": ["Longevity", "Heart Health", "Metabolic Health"],
      "5.2": "$100-$200",
      "5.3": ["Cardiovascular", "Metabolic"],
      "5.4": "Intermediate",
    },
    questionsVersion: "2.0",
  });

  user.onboardingAnswers = onboardingAnswer._id;

  // ============================================================
  // 4. REFERRAL SOURCE
  // ============================================================
  console.log("[Seed] Creating referral source...");
  await ReferralSource.create({
    userId: user._id,
    socialMediaOrAd: { platforms: [], otherText: "" },
    wordOfMouth: { sources: [], otherText: "" },
    podcast: { note: "" },
    creator: { note: "" },
    webSearch: { engines: ["Google"], otherText: "" },
    email: { sources: [], otherText: "" },
  });

  // ============================================================
  // 5. BLOOD REPORT (ReportData) — 2 reports
  // ============================================================
  console.log("[Seed] Creating blood reports...");

  // Report 1 — 3 months ago
  const report1 = await ReportData.create({
    userId: user._id,
    sourceUrl: "upload://blood_panel_jan_2026.pdf",
    filename: "blood_panel_jan_2026.pdf",
    parsedData: {
      patient: { name: "Alex Morgan", age: 35, sex: "Male", dateOfBirth: "1990-05-15" },
      report: { reportDate: "2026-01-15", reportType: "Complete Blood Panel", lab: { name: "LabCorp", address: "San Francisco, CA" } },
      tests: [
        { name: "Total Cholesterol", value: "215", numericValue: 215, unit: "mg/dL", referenceRange: "125-200", flag: "high" },
        { name: "LDL Cholesterol", value: "138", numericValue: 138, unit: "mg/dL", referenceRange: "0-100", flag: "high" },
        { name: "HDL Cholesterol", value: "52", numericValue: 52, unit: "mg/dL", referenceRange: "40-60", flag: "normal" },
        { name: "Triglycerides", value: "125", numericValue: 125, unit: "mg/dL", referenceRange: "0-150", flag: "normal" },
        { name: "Fasting Glucose", value: "98", numericValue: 98, unit: "mg/dL", referenceRange: "70-99", flag: "normal" },
        { name: "HbA1c", value: "5.6", numericValue: 5.6, unit: "%", referenceRange: "4.0-5.6", flag: "normal" },
        { name: "hsCRP", value: "2.4", numericValue: 2.4, unit: "mg/L", referenceRange: "0-1.0", flag: "high" },
        { name: "Vitamin D", value: "28", numericValue: 28, unit: "ng/mL", referenceRange: "30-100", flag: "low" },
        { name: "TSH", value: "2.1", numericValue: 2.1, unit: "mIU/L", referenceRange: "0.4-4.0", flag: "normal" },
        { name: "Free T4", value: "1.2", numericValue: 1.2, unit: "ng/dL", referenceRange: "0.8-1.8", flag: "normal" },
        { name: "Testosterone Total", value: "485", numericValue: 485, unit: "ng/dL", referenceRange: "300-1000", flag: "normal" },
        { name: "ApoB", value: "112", numericValue: 112, unit: "mg/dL", referenceRange: "0-90", flag: "high" },
        { name: "Lp(a)", value: "45", numericValue: 45, unit: "nmol/L", referenceRange: "0-75", flag: "normal" },
        { name: "Ferritin", value: "95", numericValue: 95, unit: "ng/mL", referenceRange: "30-400", flag: "normal" },
        { name: "Iron", value: "85", numericValue: 85, unit: "mcg/dL", referenceRange: "60-170", flag: "normal" },
        { name: "Creatinine", value: "1.0", numericValue: 1.0, unit: "mg/dL", referenceRange: "0.7-1.3", flag: "normal" },
        { name: "ALT", value: "28", numericValue: 28, unit: "U/L", referenceRange: "0-40", flag: "normal" },
        { name: "AST", value: "24", numericValue: 24, unit: "U/L", referenceRange: "0-40", flag: "normal" },
        { name: "WBC", value: "6.2", numericValue: 6.2, unit: "x10^3/uL", referenceRange: "4.5-11.0", flag: "normal" },
        { name: "Hemoglobin", value: "15.2", numericValue: 15.2, unit: "g/dL", referenceRange: "13.5-17.5", flag: "normal" },
      ],
    },
    reportDate: new Date("2026-01-15"),
    reportLabel: "Full Panel - January 2026",
    biomarkerPanel: [
      { canonicalName: "cholesterol_total", displayName: "Total Cholesterol", category: "heart_vascular", numericValue: 215, unit: "mg/dL", referenceMin: 125, referenceMax: 200, optimalMin: 150, optimalMax: 180, flag: "high", optimalFlag: "high", panelTag: "Core Panel", isDerived: false },
      { canonicalName: "ldl", displayName: "LDL Cholesterol", category: "heart_vascular", numericValue: 138, unit: "mg/dL", referenceMin: 0, referenceMax: 100, optimalMin: 0, optimalMax: 70, flag: "high", optimalFlag: "high", panelTag: "Core Panel", isDerived: false },
      { canonicalName: "hdl", displayName: "HDL Cholesterol", category: "heart_vascular", numericValue: 52, unit: "mg/dL", referenceMin: 40, referenceMax: 60, optimalMin: 50, optimalMax: 90, flag: "normal", optimalFlag: "normal", panelTag: "Core Panel", isDerived: false },
      { canonicalName: "triglycerides", displayName: "Triglycerides", category: "heart_vascular", numericValue: 125, unit: "mg/dL", referenceMin: 0, referenceMax: 150, optimalMin: 0, optimalMax: 100, flag: "normal", optimalFlag: "high", panelTag: "Core Panel", isDerived: false },
      { canonicalName: "glucose_fasting", displayName: "Fasting Glucose", category: "metabolic", numericValue: 98, unit: "mg/dL", referenceMin: 70, referenceMax: 99, optimalMin: 72, optimalMax: 86, flag: "normal", optimalFlag: "high", panelTag: "Core Panel", isDerived: false },
      { canonicalName: "hba1c", displayName: "HbA1c", category: "metabolic", numericValue: 5.6, unit: "%", referenceMin: 4.0, referenceMax: 5.6, optimalMin: 4.5, optimalMax: 5.2, flag: "normal", optimalFlag: "high", panelTag: "Core Panel", isDerived: false },
      { canonicalName: "hscrp", displayName: "hs-CRP", category: "inflammation", numericValue: 2.4, unit: "mg/L", referenceMin: 0, referenceMax: 3.0, optimalMin: 0, optimalMax: 1.0, flag: "normal", optimalFlag: "high", panelTag: "Core Panel", isDerived: false },
      { canonicalName: "vitamin_d", displayName: "Vitamin D", category: "nutrients", numericValue: 28, unit: "ng/mL", referenceMin: 30, referenceMax: 100, optimalMin: 50, optimalMax: 80, flag: "low", optimalFlag: "low", panelTag: "Core Panel", isDerived: false },
      { canonicalName: "tsh", displayName: "TSH", category: "thyroid", numericValue: 2.1, unit: "mIU/L", referenceMin: 0.4, referenceMax: 4.0, optimalMin: 0.5, optimalMax: 2.5, flag: "normal", optimalFlag: "normal", panelTag: "Core Panel", isDerived: false },
      { canonicalName: "free_t4", displayName: "Free T4", category: "thyroid", numericValue: 1.2, unit: "ng/dL", referenceMin: 0.8, referenceMax: 1.8, optimalMin: 1.0, optimalMax: 1.5, flag: "normal", optimalFlag: "normal", panelTag: "Core Panel", isDerived: false },
      { canonicalName: "testosterone_total", displayName: "Total Testosterone", category: "sex_hormones", numericValue: 485, unit: "ng/dL", referenceMin: 300, referenceMax: 1000, optimalMin: 500, optimalMax: 900, flag: "normal", optimalFlag: "low", panelTag: "Core Panel", isDerived: false },
      { canonicalName: "apob", displayName: "ApoB", category: "heart_vascular", numericValue: 112, unit: "mg/dL", referenceMin: 0, referenceMax: 130, optimalMin: 0, optimalMax: 80, flag: "normal", optimalFlag: "high", panelTag: "Core Panel", isDerived: false },
      { canonicalName: "lpa", displayName: "Lipoprotein(a)", category: "heart_vascular", numericValue: 45, unit: "nmol/L", referenceMin: 0, referenceMax: 75, optimalMin: 0, optimalMax: 30, flag: "normal", optimalFlag: "high", panelTag: "Core Panel", isDerived: false },
      { canonicalName: "ferritin", displayName: "Ferritin", category: "nutrients", numericValue: 95, unit: "ng/mL", referenceMin: 30, referenceMax: 400, optimalMin: 50, optimalMax: 200, flag: "normal", optimalFlag: "normal", panelTag: "Core Panel", isDerived: false },
      { canonicalName: "creatinine", displayName: "Creatinine", category: "kidney", numericValue: 1.0, unit: "mg/dL", referenceMin: 0.7, referenceMax: 1.3, optimalMin: 0.7, optimalMax: 1.1, flag: "normal", optimalFlag: "normal", panelTag: "Core Panel", isDerived: false },
      { canonicalName: "alt", displayName: "ALT", category: "liver", numericValue: 28, unit: "U/L", referenceMin: 0, referenceMax: 40, optimalMin: 0, optimalMax: 25, flag: "normal", optimalFlag: "high", panelTag: "Core Panel", isDerived: false },
      { canonicalName: "ast", displayName: "AST", category: "liver", numericValue: 24, unit: "U/L", referenceMin: 0, referenceMax: 40, optimalMin: 0, optimalMax: 25, flag: "normal", optimalFlag: "normal", panelTag: "Core Panel", isDerived: false },
      { canonicalName: "wbc", displayName: "White Blood Cells", category: "immune", numericValue: 6.2, unit: "x10^3/uL", referenceMin: 4.5, referenceMax: 11.0, optimalMin: 4.5, optimalMax: 7.0, flag: "normal", optimalFlag: "normal", panelTag: "Core Panel", isDerived: false },
      { canonicalName: "hemoglobin", displayName: "Hemoglobin", category: "energy", numericValue: 15.2, unit: "g/dL", referenceMin: 13.5, referenceMax: 17.5, optimalMin: 14.0, optimalMax: 16.0, flag: "normal", optimalFlag: "normal", panelTag: "Core Panel", isDerived: false },
    ],
    scores: {
      cyborgScore: 72,
      bioAge: 37,
      paceOfAging: 1.06,
      categoryGrades: {
        heart_vascular: { grade: "C", score: 58 },
        metabolic: { grade: "B", score: 76 },
        inflammation: { grade: "C", score: 55 },
        nutrients: { grade: "B", score: 70 },
        thyroid: { grade: "A", score: 92 },
        liver: { grade: "B", score: 80 },
        kidney: { grade: "A", score: 95 },
        immune: { grade: "A", score: 90 },
        energy: { grade: "A", score: 93 },
        sex_hormones: { grade: "B", score: 75 },
      },
      criticalFlags: [],
    },
    modelUsed: "claude-sonnet-4-6",
    tokensUsed: { input: 4500, output: 2800 },
  });

  // Report 2 — recent (1 week ago)
  const report2 = await ReportData.create({
    userId: user._id,
    sourceUrl: "upload://blood_panel_apr_2026.pdf",
    filename: "blood_panel_apr_2026.pdf",
    parsedData: {
      patient: { name: "Alex Morgan", age: 35, sex: "Male", dateOfBirth: "1990-05-15" },
      report: { reportDate: "2026-04-07", reportType: "Complete Blood Panel", lab: { name: "Quest Diagnostics", address: "San Francisco, CA" } },
      tests: [
        { name: "Total Cholesterol", value: "198", numericValue: 198, unit: "mg/dL", referenceRange: "125-200", flag: "normal" },
        { name: "LDL Cholesterol", value: "118", numericValue: 118, unit: "mg/dL", referenceRange: "0-100", flag: "high" },
        { name: "HDL Cholesterol", value: "58", numericValue: 58, unit: "mg/dL", referenceRange: "40-60", flag: "normal" },
        { name: "Triglycerides", value: "110", numericValue: 110, unit: "mg/dL", referenceRange: "0-150", flag: "normal" },
        { name: "Fasting Glucose", value: "92", numericValue: 92, unit: "mg/dL", referenceRange: "70-99", flag: "normal" },
        { name: "HbA1c", value: "5.3", numericValue: 5.3, unit: "%", referenceRange: "4.0-5.6", flag: "normal" },
        { name: "hsCRP", value: "1.5", numericValue: 1.5, unit: "mg/L", referenceRange: "0-1.0", flag: "high" },
        { name: "Vitamin D", value: "45", numericValue: 45, unit: "ng/mL", referenceRange: "30-100", flag: "normal" },
        { name: "ApoB", value: "98", numericValue: 98, unit: "mg/dL", referenceRange: "0-90", flag: "high" },
        { name: "Testosterone Total", value: "520", numericValue: 520, unit: "ng/dL", referenceRange: "300-1000", flag: "normal" },
      ],
    },
    reportDate: new Date("2026-04-07"),
    reportLabel: "Follow-up Panel - April 2026",
    biomarkerPanel: [
      { canonicalName: "cholesterol_total", displayName: "Total Cholesterol", category: "heart_vascular", numericValue: 198, unit: "mg/dL", referenceMin: 125, referenceMax: 200, optimalMin: 150, optimalMax: 180, flag: "normal", optimalFlag: "high", panelTag: "Core Panel", isDerived: false },
      { canonicalName: "ldl", displayName: "LDL Cholesterol", category: "heart_vascular", numericValue: 118, unit: "mg/dL", referenceMin: 0, referenceMax: 100, optimalMin: 0, optimalMax: 70, flag: "high", optimalFlag: "high", panelTag: "Core Panel", isDerived: false },
      { canonicalName: "hdl", displayName: "HDL Cholesterol", category: "heart_vascular", numericValue: 58, unit: "mg/dL", referenceMin: 40, referenceMax: 60, optimalMin: 50, optimalMax: 90, flag: "normal", optimalFlag: "normal", panelTag: "Core Panel", isDerived: false },
      { canonicalName: "triglycerides", displayName: "Triglycerides", category: "heart_vascular", numericValue: 110, unit: "mg/dL", referenceMin: 0, referenceMax: 150, optimalMin: 0, optimalMax: 100, flag: "normal", optimalFlag: "high", panelTag: "Core Panel", isDerived: false },
      { canonicalName: "glucose_fasting", displayName: "Fasting Glucose", category: "metabolic", numericValue: 92, unit: "mg/dL", referenceMin: 70, referenceMax: 99, optimalMin: 72, optimalMax: 86, flag: "normal", optimalFlag: "high", panelTag: "Core Panel", isDerived: false },
      { canonicalName: "hba1c", displayName: "HbA1c", category: "metabolic", numericValue: 5.3, unit: "%", referenceMin: 4.0, referenceMax: 5.6, optimalMin: 4.5, optimalMax: 5.2, flag: "normal", optimalFlag: "high", panelTag: "Core Panel", isDerived: false },
      { canonicalName: "hscrp", displayName: "hs-CRP", category: "inflammation", numericValue: 1.5, unit: "mg/L", referenceMin: 0, referenceMax: 3.0, optimalMin: 0, optimalMax: 1.0, flag: "normal", optimalFlag: "high", panelTag: "Core Panel", isDerived: false },
      { canonicalName: "vitamin_d", displayName: "Vitamin D", category: "nutrients", numericValue: 45, unit: "ng/mL", referenceMin: 30, referenceMax: 100, optimalMin: 50, optimalMax: 80, flag: "normal", optimalFlag: "low", panelTag: "Core Panel", isDerived: false },
      { canonicalName: "apob", displayName: "ApoB", category: "heart_vascular", numericValue: 98, unit: "mg/dL", referenceMin: 0, referenceMax: 130, optimalMin: 0, optimalMax: 80, flag: "normal", optimalFlag: "high", panelTag: "Core Panel", isDerived: false },
      { canonicalName: "testosterone_total", displayName: "Total Testosterone", category: "sex_hormones", numericValue: 520, unit: "ng/dL", referenceMin: 300, referenceMax: 1000, optimalMin: 500, optimalMax: 900, flag: "normal", optimalFlag: "normal", panelTag: "Core Panel", isDerived: false },
    ],
    scores: {
      cyborgScore: 78,
      bioAge: 35,
      paceOfAging: 1.0,
      categoryGrades: {
        heart_vascular: { grade: "B", score: 72 },
        metabolic: { grade: "B", score: 82 },
        inflammation: { grade: "B", score: 70 },
        nutrients: { grade: "B", score: 78 },
        sex_hormones: { grade: "A", score: 90 },
      },
      criticalFlags: [],
    },
    modelUsed: "claude-sonnet-4-6",
    tokensUsed: { input: 3800, output: 2200 },
  });

  // Update user with report refs
  user.bloodReport = report2._id;
  user.bloodReports = [report1._id, report2._id];
  await user.save();

  // ============================================================
  // 6. SUBSCRIPTION
  // ============================================================
  console.log("[Seed] Creating subscription...");
  await Subscription.create({
    userId: user._id,
    planType: "advanced",
    planName: "Advanced",
    amount: 1500000,
    durationMonths: 1,
    currency: "INR",
    status: "active",
    razorpayOrderId: "order_test_abc123",
    razorpayPaymentId: "pay_test_xyz789",
    razorpaySignature: "sig_test_placeholder",
    purchaseDate: new Date("2026-03-01"),
    expiryDate: new Date("2026-04-01"),
    autoRenew: true,
    transactionNotes: "Test subscription for cyborg_merger database",
  });

  // ============================================================
  // 7. NOTIFICATIONS
  // ============================================================
  console.log("[Seed] Creating notifications...");
  await Notification.insertMany([
    { userId: user._id, type: "report_ready", metadata: { reportId: report2._id, message: "Your blood report analysis is ready!" }, read: false },
    { userId: user._id, type: "goal_update", metadata: { message: "New health goals generated based on your latest report." }, read: false },
    { userId: user._id, type: "subscription_active", metadata: { planName: "Advanced", expiryDate: "2026-04-01" }, read: true },
    { userId: user._id, type: "welcome", metadata: { message: "Welcome to Cyborg Healthcare! Start by uploading your blood report." }, read: true },
  ]);

  // ============================================================
  // 8. CHAT (patient chat with sample conversation)
  // ============================================================
  console.log("[Seed] Creating chat...");
  await Chat.create({
    userId: user._id,
    title: "How are my cholesterol levels?",
    chatType: "patient",
    messages: [
      { role: "user", content: "How are my cholesterol levels looking? Should I be worried?" },
      {
        role: "assistant",
        content: "Based on your latest report from April 2026, your **Total Cholesterol** is at **198 mg/dL** — right at the upper edge of normal (reference: 125-200). The good news is it dropped from 215 in January!\n\nHere's the breakdown:\n- **LDL**: 118 mg/dL (still high, was 138 — trending down)\n- **HDL**: 58 mg/dL (healthy range, up from 52)\n- **Triglycerides**: 110 mg/dL (normal, down from 125)\n- **ApoB**: 98 mg/dL (still elevated above optimal <80)\n\nThe trend is encouraging — your Mediterranean diet and exercise seem to be working. Your ApoB is the main marker I'd watch. Given your family history of heart disease, keeping ApoB under 80 would be ideal.\n\nWould you like me to look into specific dietary changes or supplements that could help lower your ApoB further?",
        toolUses: [{ name: "getMedicalData", input: { include: ["reports"] } }],
        thinking: null,
      },
      { role: "user", content: "Yes, what supplements could help with ApoB?" },
      {
        role: "assistant",
        content: "Great question. For ApoB reduction, here are evidence-based options that align with your current supplement stack:\n\n**1. Omega-3 (EPA/DHA)** — You're already taking this! Make sure your dose provides at least **2g EPA+DHA combined**. EPA specifically helps lower ApoB particles.\n\n**2. Berberine** (500mg 2x/day) — Acts similarly to statins, can reduce LDL and ApoB by 10-15%. Well-studied and pairs safely with your current stack.\n\n**3. Citrus Bergamot** (500-1000mg/day) — Supports LDL receptor activity, helping clear ApoB particles. Good synergy with Mediterranean diet.\n\n**4. Plant Sterols** (2g/day) — Block cholesterol absorption. Easy to add via fortified foods or supplements.\n\n⚠️ *Important: These are informational suggestions — discuss with your doctor before adding new supplements, especially given your family history.*\n\nYour current Vitamin D and Magnesium are solid foundational supplements. Would you like me to search for clinical evidence on any of these?",
        toolUses: [
          { name: "getMedicalData", input: { include: ["profile", "onboarding"] } },
          { name: "searchMedicalEvidence", input: { query: "ApoB reduction supplements omega-3 berberine citrus bergamot" } },
        ],
        thinking: null,
      },
    ],
  });

  // ============================================================
  // 9. WEARABLE DATA (30 days)
  // ============================================================
  console.log("[Seed] Creating wearable data (30 days)...");
  const wearableRecords = [];
  const today = new Date("2026-04-14");

  for (let i = 29; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);

    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const baseSteps = isWeekend ? 6000 : 9000;
    const jitter = () => Math.floor(Math.random() * 2000) - 1000;
    const smallJitter = () => +(Math.random() * 4 - 2).toFixed(1);

    wearableRecords.push({
      userId: user._id,
      date,
      source: "apple_watch",
      metrics: {
        steps: baseSteps + jitter(),
        heartRate: {
          resting: 58 + Math.floor(Math.random() * 6),
          avg: 72 + Math.floor(Math.random() * 8),
          max: 145 + Math.floor(Math.random() * 25),
        },
        hrv: 42 + Math.floor(Math.random() * 15),
        spo2: 97 + +(Math.random() * 2).toFixed(1),
        caloriesBurned: 2200 + Math.floor(Math.random() * 600),
        activeMinutes: isWeekend ? 25 + Math.floor(Math.random() * 20) : 40 + Math.floor(Math.random() * 30),
        sleep: {
          totalHours: +(6.5 + Math.random() * 1.5).toFixed(1),
          deepHours: +(1.0 + Math.random() * 0.8).toFixed(1),
          remHours: +(1.2 + Math.random() * 0.6).toFixed(1),
          lightHours: +(3.0 + Math.random() * 1.0).toFixed(1),
          awakeHours: +(0.3 + Math.random() * 0.4).toFixed(1),
        },
        workouts: isWeekend
          ? []
          : i % 2 === 0
            ? [{ type: "Weight Training", durationMinutes: 55 + Math.floor(Math.random() * 15), avgHeartRate: 125 + Math.floor(Math.random() * 15), caloriesBurned: 350 + Math.floor(Math.random() * 100) }]
            : [{ type: "Running", durationMinutes: 30 + Math.floor(Math.random() * 15), avgHeartRate: 145 + Math.floor(Math.random() * 15), caloriesBurned: 280 + Math.floor(Math.random() * 80) }],
      },
    });
  }
  await WearableData.insertMany(wearableRecords);

  // ============================================================
  // 10. DOCTOR USER
  // ============================================================
  console.log("[Seed] Creating doctor user...");
  const doctorPassword = await bcryptjs.hash("DoctorTest@123", salt);
  await User.create({
    firstName: "Dr. Sarah",
    lastName: "Chen",
    email: "dr.chen@test.com",
    phone: "9876543211",
    password: doctorPassword,
    userType: "doctor",
    emailVerified: true,
    phoneVerified: true,
    onboardingCompleted: false,
    hasSeenWelcome: true,
    biologicalSex: "Female",
    dateOfBirth: new Date("1985-09-22"),
    gender: "Female",
    bio: "Board-certified internal medicine physician specializing in preventive cardiology and metabolic health.",
    city: "San Francisco",
    state: "California",
    zipCode: "94105",
    isActive: true,
    isDeleted: false,
  });

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log("\n========================================");
  console.log("[Seed] COMPLETE — cyborg_merger database populated");
  console.log("========================================");
  console.log(`Database:        ${mongoose.connection.name}`);
  console.log(`Questionnaire:   1 (version 2.0, 5 sections)`);
  console.log(`Users:           2 (1 patient + 1 doctor)`);
  console.log(`OnboardingAnswers: 1`);
  console.log(`ReferralSources: 1`);
  console.log(`ReportData:      2 (Jan + Apr 2026)`);
  console.log(`Subscriptions:   1 (advanced, active)`);
  console.log(`Notifications:   4`);
  console.log(`Chats:           1 (4 messages, patient chat)`);
  console.log(`WearableData:    30 days (Apple Watch)`);
  console.log("========================================");
  console.log("\nTest Patient:");
  console.log(`  Email:    alex.morgan@test.com`);
  console.log(`  Password: TestUser@123`);
  console.log(`  ID:       ${user._id}`);
  console.log("\nTest Doctor:");
  console.log(`  Email:    dr.chen@test.com`);
  console.log(`  Password: DoctorTest@123`);
  console.log("========================================\n");

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error("[Seed] FATAL:", err);
  process.exit(1);
});
