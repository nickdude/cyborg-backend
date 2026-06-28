const mongoose = require("mongoose");
const User = require("../models/User");
const ReportData = require("../models/ReportData");
const ActionPlan = require("../models/ActionPlan");
const Goal = require("../models/Goal");

// Map numeric question keys (questionsVersion 2.0) to readable labels
const QUESTION_KEY_MAP = {
  '1.2': 'preferred_name',
  '1.3': 'biological_sex',
  '1.4': 'ethnicity',
  '1.5': 'weight_lbs',
  '1.6': 'height_ft_in',
  '1.7': 'occupation',
  '2.2': 'diet',
  '2.3': 'diet_other',
  '2.4': 'exercise_frequency',
  '2.5': 'exercise_types',
  '2.6': 'exercise_other',
  '2.7': 'sleep_hours_per_night',
  '2.8': 'sleep_quality',
  '2.9': 'smoking_status',
  '2.10': 'alcohol_use',
  '2.11': 'lifestyle_notes',
  '3.2': 'chronic_conditions',
  '3.3': 'conditions_other',
  '3.4': 'medical_history',
  '3.5': 'active_symptoms',
  '3.6': 'symptoms_other',
  '3.7': 'prescription_medications',
  '3.8': 'supplements',
  '3.9': 'surgeries',
  '3.10': 'family_history',
  '3.11': 'family_history_other',
  '3.12': 'family_history_notes',
  '3.13': 'medical_notes',
  '4.1': 'glp1_status',
  '4.2': 'rx_readiness',
  '4.3': 'rx_interest',
  '5.2': 'health_goals',
  '5.3': 'goals_other',
  '5.4': 'annual_health_budget',
  '5.5': 'focus_areas',
  '5.6': 'technical_level_preference',
};

function mapAnswerKeys(answers) {
  if (!answers || typeof answers !== 'object') return answers;
  const mapped = {};
  for (const [key, val] of Object.entries(answers)) {
    const label = QUESTION_KEY_MAP[key] || key;
    mapped[label] = val;
  }
  return mapped;
}

const definition = {
  name: 'getMedicalData',
  description: 'Retrieve the current user\'s complete medical profile: health questionnaire answers, lifestyle data, goals, and all parsed lab/medical reports with biomarker trends across reports. Always call this before giving personalized health advice or analysing the user\'s condition.',
  input_schema: {
    type: 'object',
    properties: {
      include: {
        type: 'array',
        items: { type: 'string', enum: ['profile', 'onboarding', 'reports'] },
        description: 'Sections to fetch. profile = basic account info, onboarding = full health questionnaire answers, reports = all uploaded lab results with cross-report biomarker trends.',
      },
      reportId: {
        type: 'string',
        description: 'Optional: specific report ID for full detail. If omitted, returns summaries of all reports.',
      },
    },
    required: ['include'],
  },
};

async function execute(input, userId, chatId) {
  const result = {};

  if (input.include.includes('profile') || input.include.includes('onboarding')) {
    const user = await User.findById(userId)
      .select('email firstName lastName dateOfBirth biologicalSex gender onboardingCompleted onboardingData onboardingAnswers createdAt')
      .lean();

    if (user) {
      if (input.include.includes('profile')) {
        result.profile = {
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          dateOfBirth: user.dateOfBirth,
          biologicalSex: user.biologicalSex || null,
          gender: user.gender || null,
          memberSince: user.createdAt,
          onboardingCompleted: user.onboardingCompleted,
        };
      }

      if (input.include.includes('onboarding')) {
        // Source the questionnaire answers: new onboardingData format first
        // (keyed by field id like "sex"), then the numeric-keyed OnboardingAnswer
        // doc (mapped to readable labels).
        let ob = {};
        if (user.onboardingData && Object.keys(user.onboardingData).length > 0) {
          ob = { ...user.onboardingData };
        } else if (user.onboardingAnswers) {
          const oa = await mongoose.connection.db
            .collection('onboardinganswers')
            .findOne({ _id: new mongoose.Types.ObjectId(user.onboardingAnswers) });
          if (oa) ob = { ...mapAnswerKeys(oa.answers), _questionsVersion: oa.questionsVersion };
        }

        // Sync the canonical profile fields into onboarding so the AI always has
        // the key facts even when the questionnaire answers are sparse or empty
        // (profile <-> onboarding stay consistent). Only fill what's missing.
        if (ob.biological_sex == null && user.biologicalSex) ob.biological_sex = user.biologicalSex;
        if (ob.gender == null && user.gender) ob.gender = user.gender;
        if (ob.age == null && user.dateOfBirth) {
          const age = Math.floor((Date.now() - new Date(user.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
          if (age >= 0 && age < 150) ob.age = age;
        }

        result.onboarding = ob;
      }
    }
  }

  if (input.include.includes('reports')) {
    // If a specific reportId is requested, return full detail
    if (input.reportId) {
      const report = await ReportData.findOne({
        _id: input.reportId,
        userId: new mongoose.Types.ObjectId(userId),
      }).lean();

      if (report) {
        result.report = {
          source: 'parsed',
          filename: report.filename || report.sourceUrl,
          reportDate: report.reportDate,
          reportLabel: report.reportLabel,
          uploadedAt: report.createdAt,
          modelUsed: report.modelUsed,
          data: report.parsedData,
          biomarkerPanel: report.biomarkerPanel?.filter(t => t.numericValue !== null) || [],
        };
      } else {
        result.report = null;
      }
    } else {
      // Return summaries of all reports + cross-report trends
      const reports = await ReportData.find({ userId: new mongoose.Types.ObjectId(userId) })
        .sort({ reportDate: -1, createdAt: -1 })
        .lean();

      if (reports.length > 0) {
        result.reportCount = reports.length;
        result.reports = reports.map(r => ({
          reportId: r._id,
          filename: r.filename || r.sourceUrl,
          reportDate: r.reportDate,
          reportLabel: r.reportLabel,
          uploadedAt: r.createdAt,
          flaggedTests: (r.biomarkerPanel || [])
            .filter(t => t.numericValue !== null && t.flag !== 'normal')
            .map(t => ({ name: t.displayName, value: t.numericValue, unit: t.unit, flag: t.flag })),
          testCount: r.biomarkerPanel?.filter(t => t.numericValue !== null).length || 0,
        }));

        // Compute cross-report biomarker trends for biomarkers appearing in 2+ reports
        if (reports.length >= 2) {
          const biomarkerHistory = new Map();
          for (const r of reports) {
            for (const t of (r.biomarkerPanel || []).filter(b => b.numericValue !== null)) {
              if (!biomarkerHistory.has(t.canonicalName)) {
                biomarkerHistory.set(t.canonicalName, {
                  displayName: t.displayName,
                  category: t.category,
                  unit: t.unit,
                  dataPoints: [],
                });
              }
              biomarkerHistory.get(t.canonicalName).dataPoints.push({
                date: r.reportDate || r.createdAt,
                value: t.numericValue,
                flag: t.flag,
              });
            }
          }

          const trends = {};
          for (const [name, data] of biomarkerHistory) {
            if (data.dataPoints.length < 2) continue;
            // Sort chronologically
            data.dataPoints.sort((a, b) => new Date(a.date) - new Date(b.date));
            const first = data.dataPoints[0].value;
            const last = data.dataPoints[data.dataPoints.length - 1].value;
            const changePct = first !== 0 ? Math.round(((last - first) / first) * 1000) / 10 : null;

            trends[name] = {
              displayName: data.displayName,
              category: data.category,
              unit: data.unit,
              firstValue: first,
              latestValue: last,
              changePct,
              direction: changePct == null ? 'unknown'
                : Math.abs(changePct) < 5 ? 'stable'
                : changePct > 0 ? 'increasing' : 'decreasing',
              latestFlag: data.dataPoints[data.dataPoints.length - 1].flag,
              dataPoints: data.dataPoints,
            };
          }

          if (Object.keys(trends).length > 0) {
            result.biomarkerTrends = trends;
          }
        }
      } else {
        // Fall back to bloodreports collection (raw upload metadata)
        const userDoc = await User.findById(userId).select('bloodReport bloodReports').lean();
        const bloodReportIds = userDoc?.bloodReports || (userDoc?.bloodReport ? [userDoc.bloodReport] : []);
        if (bloodReportIds.length > 0) {
          const bloodReport = await mongoose.connection.db
            .collection('bloodreports')
            .findOne({ _id: new mongoose.Types.ObjectId(bloodReportIds[0]) });
          result.report = bloodReport
            ? {
                source: 'uploaded_not_parsed',
                filename: bloodReport.fileName,
                uploadedAt: bloodReport.uploadedAt,
                mimeType: bloodReport.mimeType,
                note: 'This report has been uploaded but not yet AI-parsed. No lab values are available.',
              }
            : null;
        } else {
          result.report = null;
          result.reportCount = 0;
        }
      }
    }
  }

  // Action plan + goals (if approved/ready)
  try {
    const plan = await ActionPlan.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      status: { $in: ["ready", "approved"] },
    })
      .sort({ createdAt: -1 })
      .lean();

    if (plan) {
      const goals = await Goal.find({
        userId: new mongoose.Types.ObjectId(userId),
        reportId: plan.reportId,
        deletedByDoctor: { $ne: true },
      }).lean();

      result.actionPlan = {
        status: plan.status,
        generatedAt: plan.generatedAt,
        clinicalThesis: plan.clinicalThesis || null,
        checkpoints: (plan.checkpoints || []).map(cp => ({
          weekNumber: cp.weekNumber,
          label: cp.label,
          description: cp.description,
          targetBiomarkers: cp.targetBiomarkers,
        })),
        watchOuts: plan.watchOuts || [],
        dailySchedule: plan.dailySchedule || null,
        protocol: plan.protocol || null,
        nextSteps: plan.nextSteps || null,
      };

      result.goals = goals.map(g => ({
        title: g.title,
        priority: g.priority,
        status: g.status,
        category: g.category,
        healthImpact: g.healthImpact,
        description: g.description,
        whatThisMeans: g.whatThisMeans,
        recommendedActions: g.recommendedActions,
        achievementCriteria: g.achievementCriteria,
        biomarkerEvidence: (g.biomarkerEvidence || []).map(bm => ({
          name: bm.name,
          value: bm.value,
          unit: bm.unit,
          flag: bm.flag,
          targetValue: bm.targetValue,
        })),
        protocolItems: (g.protocolItems || []).map(pi => ({
          productName: pi.productName,
          dosing: pi.dosing,
        })),
      }));
    }
  } catch (err) {
    console.warn("[getMedicalData] Failed to fetch action plan:", err.message);
  }

  return result;
}

module.exports = { definition, execute };
