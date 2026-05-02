const mongoose = require("mongoose");

const supplementSchema = new mongoose.Schema(
  {
    name: { type: String },
    dose: { type: String },
    whatItIs: { type: String },
    whyItMatters: { type: String },
    howToTake: { type: String },
    timing: {
      type: String,
      enum: ["morning_fasted", "with_breakfast", "pre_workout", "with_dinner", "bedtime", "with_food", "anytime"],
      default: "with_food",
    },
  },
  { _id: false }
);

const diagnosticTestSchema = new mongoose.Schema(
  {
    name: { type: String },
    whatItIs: { type: String },
    whyTestIt: { type: String },
  },
  { _id: false }
);

const recommendedProductSchema = new mongoose.Schema(
  {
    productName: { type: String },
    dose: { type: String },
    price: { type: Number, default: null },
    imageUrl: { type: String, default: null },
  },
  { _id: false }
);

const checkpointSchema = new mongoose.Schema(
  {
    weekNumber: { type: Number },
    label: { type: String },
    description: { type: String },
    targetBiomarkers: [{
      name: { type: String },
      currentValue: { type: Number },
      targetValue: { type: Number },
      unit: { type: String },
    }],
  },
  { _id: false }
);

const watchOutSchema = new mongoose.Schema(
  {
    title: { type: String },
    risk: { type: String },
    mitigation: { type: String },
    severity: { type: String, enum: ["info", "warning", "critical"], default: "warning" },
  },
  { _id: false }
);

const exerciseSchema = new mongoose.Schema(
  {
    name: { type: String },
    sets: { type: Number },
    reps: { type: String },
    cue: { type: String },
  },
  { _id: false }
);

const trainingDaySchema = new mongoose.Schema(
  {
    dayLabel: { type: String },
    focus: { type: String },
    exercises: [exerciseSchema],
  },
  { _id: false }
);

const trainingPhaseSchema = new mongoose.Schema(
  {
    phaseNumber: { type: Number },
    weeks: { type: String },
    focus: { type: String },
    tempo: { type: String },
    rest: { type: String },
    days: [trainingDaySchema],
  },
  { _id: false }
);

const scheduleItemSchema = new mongoose.Schema(
  {
    productName: { type: String },
    dose: { type: String },
    reason: { type: String },
  },
  { _id: false }
);

const actionPlanSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    reportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ReportData",
      required: true,
      index: true,
    },
    previousPlanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ActionPlan",
      default: null,
    },
    goalIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Goal",
      },
    ],
    status: {
      type: String,
      enum: ["pending", "generating", "ready", "pending_review", "draft", "approved", "failed", "superseded"],
      default: "pending",
    },
    errorMessage: { type: String, default: null },
    generationAttempts: { type: Number, default: 0 },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    approvedAt: { type: Date, default: null },
    draftSavedAt: { type: Date, default: null },

    // Section 1: Overview
    overview: {
      intro: { type: String, default: "" },
      dataSources: [{ type: String }],
    },

    // Section 2: Health Report
    healthReport: {
      cyborgScore: { type: Number, default: null },
      bioAge: {
        phenoAge: { type: Number, default: null },
        delta: { type: Number, default: null },
      },
      markerCounts: {
        total: { type: Number, default: 0 },
        optimal: { type: Number, default: 0 },
        inRange: { type: Number, default: 0 },
        outOfRange: { type: Number, default: 0 },
      },
      categoryGrades: { type: mongoose.Schema.Types.Mixed, default: null },
    },

    // Section 4: Protocol
    protocol: {
      lifestyle: {
        sleep: [{ text: { type: String } }],
        exercise: [{ text: { type: String } }],
        stress: [{ text: { type: String } }],
      },
      nutrition: [{ text: { type: String } }],
      supplements: [supplementSchema],
      diagnosticTests: [diagnosticTestSchema],
    },

    // Section 5: Next Steps
    nextSteps: {
      followUpTimeline: { type: String, default: "" },
      text: { type: String, default: "" },
      checklist: [{ text: { type: String } }],
      recommendedProducts: [recommendedProductSchema],
      disclaimer: {
        type: String,
        default:
          "This report is not intended to diagnose or treat disease, or to substitute a physician's consultation. Review these results with your doctor.",
      },
    },

    // Section 6: Clinical Thesis
    clinicalThesis: {
      title: { type: String, default: "" },
      reasoning: { type: String, default: "" },
    },

    // Section 7: Phased Checkpoints
    checkpoints: [checkpointSchema],

    // Section 8: Clinical Watch-Outs
    watchOuts: [watchOutSchema],

    // Section 9: Daily Supplement Schedule
    dailySchedule: {
      morningFasted: [scheduleItemSchema],
      withBreakfast: [scheduleItemSchema],
      preWorkout: [scheduleItemSchema],
      withDinner: [scheduleItemSchema],
      bedtime: [scheduleItemSchema],
    },

    // Section 10: Training Protocol
    trainingProtocol: {
      goal: { type: String, default: "" },
      weeklySchedule: { type: String, default: "" },
      phases: [trainingPhaseSchema],
      zone2: {
        protocol: { type: String },
        intensity: { type: String },
        options: [{ type: String }],
        reasoning: { type: String },
      },
      warmUp: [{ type: String }],
      coolDown: [{ type: String }],
    },

    // Backward compat for current frontend
    planJson: { type: mongoose.Schema.Types.Mixed, default: null },

    generatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

actionPlanSchema.index({ userId: 1, createdAt: -1 });
actionPlanSchema.index({ userId: 1, reportId: 1 }, { unique: true });
actionPlanSchema.index({ status: 1 });
actionPlanSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model("ActionPlan", actionPlanSchema);
