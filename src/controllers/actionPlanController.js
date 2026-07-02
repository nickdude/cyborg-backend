const mongoose = require("mongoose");
const PDFDocument = require("pdfkit");
const ActionPlan = require("../models/ActionPlan");
const ReportData = require("../models/ReportData");
const User = require("../models/User");
const ProtocolAdherence = require("../models/ProtocolAdherence");
const { deduplicateProtocol } = require("../utils/protocolDedup");

const GOAL_FIELDS = "goalId title priority healthImpact category description whatThisMeans potentialCauses recommendedActions biomarkerEvidence protocolItems delta recoveryTimeWeeks status achievementCriteria";

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === String(id);
}

const createPlan = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { reportId } = req.body;

    if (!reportId || !isValidObjectId(reportId)) {
      return res.sendError("Valid reportId is required", 400);
    }

    const report = await ReportData.findOne({ _id: reportId, userId });
    if (!report) {
      return res.sendError("Report not found", 404);
    }

    // Atomic upsert prevents race condition on concurrent requests
    const plan = await ActionPlan.findOneAndUpdate(
      { userId, reportId },
      { $setOnInsert: { status: "pending" } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (plan.status !== "pending") {
      return res.sendSuccess(
        { planId: plan._id, status: plan.status },
        "Action plan already exists for this report"
      );
    }

    const { triggerGoalsAndActionPlan } = require("../services/actionPlanGenerator");
    triggerGoalsAndActionPlan(userId, reportId, plan._id).catch((err) =>
      console.error(`[ActionPlan] bg-gen failed: ${err.message}`)
    );

    res.status(202).json({
      success: true,
      statusCode: 202,
      message: "Action plan generation started",
      data: { planId: plan._id, status: "pending" },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

const getPlan = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { planId } = req.params;

    if (!isValidObjectId(planId)) {
      return res.sendError("Invalid plan ID", 400);
    }

    const plan = await ActionPlan.findOne({ _id: planId, userId })
      .populate({
        path: "goalIds",
        match: { deletedByDoctor: { $ne: true } },
        select: GOAL_FIELDS,
      });
    if (!plan) {
      return res.sendError("Action plan not found", 404);
    }

    const isPendingReview = plan.status === "pending_review" || plan.status === "draft";
    const deduplicatedProtocol = isPendingReview ? [] : deduplicateProtocol(plan.goalIds || []);

    res.sendSuccess(
      {
        _id: plan._id,
        status: isPendingReview ? "awaiting_review" : plan.status,
        errorMessage: plan.errorMessage,
        overview: plan.overview,
        healthReport: plan.healthReport,
        monitoredIssues: isPendingReview ? [] : plan.goalIds,
        protocol: isPendingReview ? null : plan.protocol,
        deduplicatedProtocol,
        clinicalThesis: plan.clinicalThesis,
        checkpoints: plan.checkpoints,
        watchOuts: plan.watchOuts,
        dailySchedule: plan.dailySchedule,
        trainingProtocol: plan.trainingProtocol,
        nextSteps: isPendingReview ? null : plan.nextSteps,
        planJson: isPendingReview ? null : plan.planJson,
        reportId: plan.reportId,
        generatedAt: plan.generatedAt,
        createdAt: plan.createdAt,
      },
      isPendingReview ? "Action plan is awaiting doctor review" : "Action plan retrieved"
    );
  } catch (error) {
    next(error);
  }
};

const getLatestPlan = async (req, res, next) => {
  try {
    const userId = req.user.id;

    let plan = await ActionPlan.findOne({ userId, status: { $in: ["ready", "approved"] } })
      .sort({ createdAt: -1 })
      .populate({
        path: "goalIds",
        match: { deletedByDoctor: { $ne: true } },
        select: GOAL_FIELDS,
      });

    // Ignore orphaned plans whose source blood report was deleted — the protocol /
    // goals views must reflect "no report uploaded", not stale data.
    if (plan && plan.reportId && !(await ReportData.exists({ _id: plan.reportId, userId }))) {
      plan = null;
    }

    if (!plan) {
      // Check if there's a plan in review or still generating
      let fallbackPlan = await ActionPlan.findOne({
        userId,
        status: { $in: ["pending_review", "draft", "pending", "generating"] },
      })
        .sort({ createdAt: -1 })
        .select("_id status healthReport overview reportId createdAt");

      // Same orphan guard for in-progress / awaiting-review plans.
      if (fallbackPlan && fallbackPlan.reportId && !(await ReportData.exists({ _id: fallbackPlan.reportId, userId }))) {
        fallbackPlan = null;
      }

      if (fallbackPlan) {
        const isGenerating = fallbackPlan.status === "pending" || fallbackPlan.status === "generating";
        const isPendingReview = fallbackPlan.status === "pending_review" || fallbackPlan.status === "draft";

        return res.sendSuccess(
          {
            _id: fallbackPlan._id,
            status: isGenerating ? fallbackPlan.status : "awaiting_review",
            overview: fallbackPlan.overview,
            healthReport: fallbackPlan.healthReport,
            monitoredIssues: [],
            protocol: null,
            nextSteps: null,
            reportId: fallbackPlan.reportId,
            createdAt: fallbackPlan.createdAt,
          },
          isGenerating
            ? "Action plan is being generated"
            : "Action plan is awaiting doctor review"
        );
      }

      return res.sendError("No action plan found. Upload a blood report first.", 404);
    }

    const deduplicatedProtocol = deduplicateProtocol(plan.goalIds || []);

    res.sendSuccess(
      {
        _id: plan._id,
        status: plan.status,
        overview: plan.overview,
        healthReport: plan.healthReport,
        monitoredIssues: plan.goalIds,
        protocol: plan.protocol,
        deduplicatedProtocol,
        clinicalThesis: plan.clinicalThesis,
        checkpoints: plan.checkpoints,
        watchOuts: plan.watchOuts,
        dailySchedule: plan.dailySchedule,
        trainingProtocol: plan.trainingProtocol,
        nextSteps: plan.nextSteps,
        planJson: plan.planJson,
        reportId: plan.reportId,
        generatedAt: plan.generatedAt,
        createdAt: plan.createdAt,
      },
      "Latest action plan retrieved"
    );
  } catch (error) {
    next(error);
  }
};

const retryPlan = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { planId } = req.params;

    if (!isValidObjectId(planId)) {
      return res.sendError("Invalid plan ID", 400);
    }

    const plan = await ActionPlan.findOne({ _id: planId, userId });
    if (!plan) {
      return res.sendError("Action plan not found", 404);
    }

    if (plan.status !== "failed") {
      return res.sendError("Only failed plans can be retried", 400);
    }

    if (plan.generationAttempts >= 3) {
      return res.sendError("Maximum retry attempts reached", 400);
    }

    plan.status = "pending";
    plan.errorMessage = null;
    await plan.save();

    const { triggerGoalsAndActionPlan } = require("../services/actionPlanGenerator");
    triggerGoalsAndActionPlan(userId, plan.reportId, plan._id).catch((err) =>
      console.error(`[ActionPlan] retry bg-gen failed: ${err.message}`)
    );

    res.sendSuccess({ planId: plan._id, status: "pending" }, "Retry started");
  } catch (error) {
    next(error);
  }
};

const exportPlanPDF = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { planId } = req.params;

    if (!isValidObjectId(planId)) {
      return res.sendError("Invalid plan ID", 400);
    }

    const plan = await ActionPlan.findOne({ _id: planId, userId }).populate({
      path: "goalIds",
      match: { deletedByDoctor: { $ne: true } },
      select: GOAL_FIELDS,
    });

    if (!plan) {
      return res.sendError("Action plan not found", 404);
    }

    if (!["ready", "approved"].includes(plan.status)) {
      return res.sendError("Action plan is not ready for export", 400);
    }

    const user = await User.findById(userId).select("firstName lastName email");
    const patientName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Patient";
    const planDate = plan.generatedAt || plan.createdAt;

    // ---------- PDF Setup ----------
    const doc = new PDFDocument({ size: "A4", margins: { top: 50, bottom: 50, left: 50, right: 50 } });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="action-plan-${planId}.pdf"`);
    doc.pipe(res);

    const PAGE_WIDTH = doc.page.width - 100; // usable width with 50pt margins

    // ---------- Color helpers ----------
    const COLORS = {
      primary: "#1a1a2e",
      accent: "#0f3460",
      muted: "#555555",
      border: "#cccccc",
      priorityHigh: "#cc0000",
      priorityMedium: "#e67e00",
      priorityLow: "#2e8b57",
      severityCritical: "#cc0000",
      severityWarning: "#e67e00",
      severityInfo: "#336699",
    };

    function priorityColor(p) {
      if (p === "High") return COLORS.priorityHigh;
      if (p === "Medium") return COLORS.priorityMedium;
      return COLORS.priorityLow;
    }

    function severityTag(s) {
      if (s === "critical") return "[CRITICAL]";
      if (s === "warning") return "[WARNING]";
      return "[INFO]";
    }

    function severityColor(s) {
      if (s === "critical") return COLORS.severityCritical;
      if (s === "warning") return COLORS.severityWarning;
      return COLORS.severityInfo;
    }

    // ---------- Layout helpers ----------
    function sectionHeader(text) {
      ensureSpace(60);
      doc.moveDown(1);
      doc.fontSize(14).fillColor(COLORS.accent).font("Helvetica-Bold").text(text.toUpperCase(), { underline: true });
      doc.moveDown(0.5);
      doc.fillColor(COLORS.primary).font("Helvetica");
    }

    function label(text) {
      doc.fontSize(10).font("Helvetica-Bold").fillColor(COLORS.primary).text(text, { continued: true });
    }

    function value(text) {
      doc.font("Helvetica").text(`  ${text ?? "N/A"}`);
    }

    function bodyText(text) {
      if (!text) return;
      doc.fontSize(10).font("Helvetica").fillColor(COLORS.primary).text(text, { lineGap: 2 });
    }

    function bulletItem(text) {
      if (!text) return;
      ensureSpace(16);
      doc.fontSize(10).font("Helvetica").fillColor(COLORS.primary).text(`  •  ${text}`, { indent: 10, lineGap: 2 });
    }

    function numberedItem(num, text) {
      if (!text) return;
      ensureSpace(16);
      doc.fontSize(10).font("Helvetica").fillColor(COLORS.primary).text(`  ${num}.  ${text}`, { indent: 10, lineGap: 2 });
    }

    function horizontalRule() {
      ensureSpace(12);
      const y = doc.y;
      doc.strokeColor(COLORS.border).lineWidth(0.5).moveTo(50, y).lineTo(50 + PAGE_WIDTH, y).stroke();
      doc.moveDown(0.4);
    }

    function ensureSpace(needed) {
      if (doc.y + needed > doc.page.height - 60) {
        doc.addPage();
      }
    }

    // ---------- a. Header ----------
    doc.fontSize(20).font("Helvetica-Bold").fillColor(COLORS.primary).text("Cyborg.Men Clinical Action Plan", { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(10).font("Helvetica").fillColor(COLORS.muted).text(`Prepared for: ${patientName}`, { align: "center" });
    doc.text(`Date: ${planDate ? new Date(planDate).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" }) : "N/A"}`, { align: "center" });
    doc.moveDown(0.3);
    horizontalRule();

    // Overview intro
    if (plan.overview?.intro) {
      doc.moveDown(0.3);
      bodyText(plan.overview.intro);
      if (plan.overview.dataSources?.length) {
        doc.moveDown(0.3);
        doc.fontSize(9).fillColor(COLORS.muted).font("Helvetica-Oblique").text(`Data sources: ${plan.overview.dataSources.join(", ")}`);
      }
      doc.moveDown(0.3);
    }

    // ---------- b. Health Report Summary ----------
    const hr = plan.healthReport;
    if (hr) {
      sectionHeader("Health Report Summary");

      const scoreText = hr.cyborgScore != null ? `${hr.cyborgScore}/100` : "N/A";
      const phenoAgeText = hr.bioAge?.phenoAge != null ? `${hr.bioAge.phenoAge} yrs` : "N/A";
      const deltaText = hr.bioAge?.delta != null ? `${hr.bioAge.delta > 0 ? "+" : ""}${hr.bioAge.delta} yrs` : "";
      const mc = hr.markerCounts || {};

      label("Cyborg Score:"); value(scoreText);
      label("Biological Age:"); value(`${phenoAgeText}${deltaText ? `  (delta: ${deltaText})` : ""}`);
      label("Biomarkers:"); value(`${mc.total || 0} total  |  ${mc.optimal || 0} optimal  |  ${mc.inRange || 0} in range  |  ${mc.outOfRange || 0} out of range`);

      if (hr.categoryGrades && typeof hr.categoryGrades === "object") {
        doc.moveDown(0.3);
        doc.fontSize(10).font("Helvetica-Bold").text("Category Grades:");
        const gradeEntries = Object.entries(hr.categoryGrades);
        for (const [cat, grade] of gradeEntries) {
          doc.fontSize(10).font("Helvetica").text(`    ${cat}: ${grade}`);
        }
      }
    }

    // ---------- c. Clinical Thesis ----------
    if (plan.clinicalThesis?.title || plan.clinicalThesis?.reasoning) {
      sectionHeader("Clinical Thesis");
      if (plan.clinicalThesis.title) {
        doc.fontSize(11).font("Helvetica-Bold").fillColor(COLORS.primary).text(plan.clinicalThesis.title);
        doc.moveDown(0.3);
      }
      if (plan.clinicalThesis.reasoning) {
        bodyText(plan.clinicalThesis.reasoning);
      }
    }

    // ---------- d. Phased Timeline (Checkpoints) ----------
    if (plan.checkpoints?.length) {
      sectionHeader("Phased Timeline");

      for (const cp of plan.checkpoints) {
        ensureSpace(50);
        doc.fontSize(11).font("Helvetica-Bold").fillColor(COLORS.accent)
          .text(`Week ${cp.weekNumber ?? "?"}: ${cp.label || "Checkpoint"}`);
        if (cp.description) {
          doc.fontSize(10).font("Helvetica").fillColor(COLORS.primary).text(cp.description, { lineGap: 2 });
        }
        if (cp.targetBiomarkers?.length) {
          doc.moveDown(0.2);
          doc.fontSize(9).font("Helvetica-Bold").fillColor(COLORS.muted).text("  Target Biomarkers:");
          for (const tb of cp.targetBiomarkers) {
            doc.fontSize(9).font("Helvetica").fillColor(COLORS.primary)
              .text(`    ${tb.name || "?"}:  current ${tb.currentValue ?? "?"} -> target ${tb.targetValue ?? "?"}  ${tb.unit || ""}`);
          }
        }
        doc.moveDown(0.5);
      }
    }

    // ---------- e. Monitored Issues (Goals) ----------
    const goals = (plan.goalIds || []).filter(Boolean);
    if (goals.length) {
      sectionHeader("Monitored Issues");

      for (let gi = 0; gi < goals.length; gi++) {
        const goal = goals[gi];
        ensureSpace(80);

        // Title + priority badge
        const pColor = priorityColor(goal.priority);
        doc.fontSize(12).font("Helvetica-Bold").fillColor(COLORS.primary)
          .text(`${gi + 1}. ${goal.title}`, { continued: true });
        doc.fontSize(9).font("Helvetica-Bold").fillColor(pColor)
          .text(`  [${goal.priority || "Medium"}]`);

        // Health impact
        if (goal.healthImpact) {
          doc.moveDown(0.2);
          doc.fontSize(10).font("Helvetica-Oblique").fillColor(COLORS.muted).text(goal.healthImpact);
        }

        // Biomarker evidence table
        if (goal.biomarkerEvidence?.length) {
          doc.moveDown(0.3);
          doc.fontSize(9).font("Helvetica-Bold").fillColor(COLORS.accent).text("Biomarker Evidence:");
          doc.moveDown(0.1);
          // Header row
          const colX = [60, 210, 290, 370, 440];
          let rowY = doc.y;
          doc.fontSize(8).font("Helvetica-Bold").fillColor(COLORS.muted);
          doc.text("Name", colX[0], rowY);
          doc.text("Value", colX[1], rowY);
          doc.text("Target", colX[2], rowY);
          doc.text("Unit", colX[3], rowY);
          doc.text("Flag", colX[4], rowY);
          doc.moveDown(0.3);

          doc.font("Helvetica").fontSize(8).fillColor(COLORS.primary);
          for (const be of goal.biomarkerEvidence) {
            ensureSpace(14);
            rowY = doc.y;
            doc.text(be.name || be.canonicalName || "?", colX[0], rowY, { width: 145 });
            doc.text(be.value != null ? String(be.value) : "?", colX[1], rowY, { width: 70 });
            doc.text(be.targetValue != null ? String(be.targetValue) : "-", colX[2], rowY, { width: 70 });
            doc.text(be.unit || "", colX[3], rowY, { width: 60 });
            doc.text(be.flag || "-", colX[4], rowY, { width: 60 });
            doc.moveDown(0.3);
          }
        }

        // Recommended actions
        if (goal.recommendedActions?.length) {
          doc.moveDown(0.3);
          doc.fontSize(9).font("Helvetica-Bold").fillColor(COLORS.accent).text("Recommended Actions:");
          for (const ra of goal.recommendedActions) {
            numberedItem(ra.number || "?", `${ra.label ? ra.label + ": " : ""}${ra.detail || ""}`);
          }
        }

        // Protocol items
        if (goal.protocolItems?.length) {
          doc.moveDown(0.3);
          doc.fontSize(9).font("Helvetica-Bold").fillColor(COLORS.accent).text("Protocol Items:");
          for (const pi of goal.protocolItems) {
            bulletItem(`${pi.productName || "?"}  —  ${pi.dosing || ""}${pi.triggerBiomarkers?.length ? `  (triggers: ${pi.triggerBiomarkers.join(", ")})` : ""}`);
          }
        }

        if (gi < goals.length - 1) {
          doc.moveDown(0.3);
          horizontalRule();
        }
      }
    }

    // ---------- f. Daily Supplement Schedule ----------
    const ds = plan.dailySchedule;
    const scheduleSlots = [
      { key: "morningFasted", label: "Morning (Fasted)" },
      { key: "withBreakfast", label: "With Breakfast" },
      { key: "preWorkout", label: "Pre-Workout" },
      { key: "withDinner", label: "With Dinner" },
      { key: "bedtime", label: "Bedtime" },
    ];
    const hasSchedule = ds && scheduleSlots.some((s) => ds[s.key]?.length);

    if (hasSchedule) {
      sectionHeader("Daily Supplement Schedule");

      for (const slot of scheduleSlots) {
        const items = ds[slot.key];
        if (!items?.length) continue;

        ensureSpace(30);
        doc.fontSize(10).font("Helvetica-Bold").fillColor(COLORS.accent).text(slot.label);
        for (const item of items) {
          bulletItem(`${item.productName || "?"}  ${item.dose ? "— " + item.dose : ""}${item.reason ? "  (" + item.reason + ")" : ""}`);
        }
        doc.moveDown(0.3);
      }
    }

    // ---------- g. Clinical Watch-Outs ----------
    if (plan.watchOuts?.length) {
      sectionHeader("Clinical Watch-Outs");

      for (const wo of plan.watchOuts) {
        ensureSpace(50);
        const sevColor = severityColor(wo.severity);
        const sevTag = severityTag(wo.severity);

        doc.fontSize(10).font("Helvetica-Bold").fillColor(sevColor).text(`${sevTag} ${wo.title || "Watch-Out"}`);
        if (wo.risk) {
          doc.fontSize(10).font("Helvetica").fillColor(COLORS.primary);
          label("Risk: "); value(wo.risk);
        }
        if (wo.mitigation) {
          label("Mitigation: "); value(wo.mitigation);
        }
        doc.moveDown(0.5);
      }
    }

    // ---------- h. Training Protocol ----------
    const tp = plan.trainingProtocol;
    if (tp && (tp.goal || tp.phases?.length)) {
      sectionHeader("Training Protocol");

      if (tp.goal) { label("Goal:"); value(tp.goal); }
      if (tp.weeklySchedule) { label("Weekly Schedule:"); value(tp.weeklySchedule); }

      // Phases
      if (tp.phases?.length) {
        doc.moveDown(0.3);
        for (const phase of tp.phases) {
          ensureSpace(50);
          doc.fontSize(11).font("Helvetica-Bold").fillColor(COLORS.accent)
            .text(`Phase ${phase.phaseNumber ?? "?"} — ${phase.focus || ""}  (${phase.weeks || ""})`);
          if (phase.tempo) { doc.fontSize(9).font("Helvetica").fillColor(COLORS.muted).text(`Tempo: ${phase.tempo}   Rest: ${phase.rest || ""}`); }

          // Days with exercises
          if (phase.days?.length) {
            for (const day of phase.days) {
              ensureSpace(30);
              doc.moveDown(0.2);
              doc.fontSize(10).font("Helvetica-Bold").fillColor(COLORS.primary).text(`  ${day.dayLabel || "Day"} — ${day.focus || ""}`);
              if (day.exercises?.length) {
                // Exercise table header
                const eColX = [70, 280, 330, 380];
                let eRowY = doc.y + 2;
                doc.fontSize(8).font("Helvetica-Bold").fillColor(COLORS.muted);
                doc.text("Exercise", eColX[0], eRowY);
                doc.text("Sets", eColX[1], eRowY);
                doc.text("Reps", eColX[2], eRowY);
                doc.text("Cue", eColX[3], eRowY);
                doc.moveDown(0.2);

                doc.font("Helvetica").fontSize(8).fillColor(COLORS.primary);
                for (const ex of day.exercises) {
                  ensureSpace(14);
                  eRowY = doc.y;
                  doc.text(ex.name || "?", eColX[0], eRowY, { width: 200 });
                  doc.text(ex.sets != null ? String(ex.sets) : "-", eColX[1], eRowY, { width: 40 });
                  doc.text(ex.reps || "-", eColX[2], eRowY, { width: 45 });
                  doc.text(ex.cue || "", eColX[3], eRowY, { width: 150 });
                  doc.moveDown(0.3);
                }
              }
            }
          }
          doc.moveDown(0.4);
        }
      }

      // Zone 2
      if (tp.zone2?.protocol) {
        doc.moveDown(0.2);
        doc.fontSize(10).font("Helvetica-Bold").fillColor(COLORS.accent).text("Zone 2 Cardio");
        if (tp.zone2.protocol) { label("Protocol:"); value(tp.zone2.protocol); }
        if (tp.zone2.intensity) { label("Intensity:"); value(tp.zone2.intensity); }
        if (tp.zone2.options?.length) {
          doc.fontSize(9).font("Helvetica").fillColor(COLORS.primary).text(`  Options: ${tp.zone2.options.join(", ")}`);
        }
        if (tp.zone2.reasoning) {
          doc.fontSize(9).font("Helvetica-Oblique").fillColor(COLORS.muted).text(tp.zone2.reasoning);
        }
      }

      // Warm-up / Cool-down
      if (tp.warmUp?.length) {
        doc.moveDown(0.3);
        doc.fontSize(10).font("Helvetica-Bold").fillColor(COLORS.accent).text("Warm-Up");
        for (const w of tp.warmUp) bulletItem(w);
      }
      if (tp.coolDown?.length) {
        doc.moveDown(0.3);
        doc.fontSize(10).font("Helvetica-Bold").fillColor(COLORS.accent).text("Cool-Down");
        for (const c of tp.coolDown) bulletItem(c);
      }
    }

    // ---------- i. Protocol Summary ----------
    const proto = plan.protocol;
    if (proto) {
      const hasLifestyle = proto.lifestyle && (proto.lifestyle.sleep?.length || proto.lifestyle.exercise?.length || proto.lifestyle.stress?.length);
      const hasNutrition = proto.nutrition?.length;
      const hasSupplements = proto.supplements?.length;
      const hasDiagnostic = proto.diagnosticTests?.length;

      if (hasLifestyle || hasNutrition || hasSupplements || hasDiagnostic) {
        sectionHeader("Protocol Summary");

        // Lifestyle
        if (hasLifestyle) {
          doc.fontSize(11).font("Helvetica-Bold").fillColor(COLORS.accent).text("Lifestyle");
          if (proto.lifestyle.sleep?.length) {
            doc.moveDown(0.2);
            doc.fontSize(10).font("Helvetica-Bold").fillColor(COLORS.primary).text("  Sleep:");
            for (const s of proto.lifestyle.sleep) bulletItem(s.text);
          }
          if (proto.lifestyle.exercise?.length) {
            doc.moveDown(0.2);
            doc.fontSize(10).font("Helvetica-Bold").fillColor(COLORS.primary).text("  Exercise:");
            for (const e of proto.lifestyle.exercise) bulletItem(e.text);
          }
          if (proto.lifestyle.stress?.length) {
            doc.moveDown(0.2);
            doc.fontSize(10).font("Helvetica-Bold").fillColor(COLORS.primary).text("  Stress Management:");
            for (const s of proto.lifestyle.stress) bulletItem(s.text);
          }
          doc.moveDown(0.3);
        }

        // Nutrition
        if (hasNutrition) {
          doc.fontSize(11).font("Helvetica-Bold").fillColor(COLORS.accent).text("Nutrition");
          for (const n of proto.nutrition) bulletItem(n.text);
          doc.moveDown(0.3);
        }

        // Supplements
        if (hasSupplements) {
          doc.fontSize(11).font("Helvetica-Bold").fillColor(COLORS.accent).text("Supplements");
          for (const supp of proto.supplements) {
            ensureSpace(30);
            doc.fontSize(10).font("Helvetica-Bold").fillColor(COLORS.primary)
              .text(`  ${supp.name || "?"}`, { continued: true });
            doc.font("Helvetica").text(`  — ${supp.dose || ""}`);
            if (supp.whyItMatters) {
              doc.fontSize(9).font("Helvetica-Oblique").fillColor(COLORS.muted).text(`    ${supp.whyItMatters}`);
            }
            if (supp.howToTake) {
              doc.fontSize(9).font("Helvetica").fillColor(COLORS.primary).text(`    How to take: ${supp.howToTake}`);
            }
          }
          doc.moveDown(0.3);
        }

        // Diagnostic Tests
        if (hasDiagnostic) {
          doc.fontSize(11).font("Helvetica-Bold").fillColor(COLORS.accent).text("Recommended Diagnostic Tests");
          for (const dt of proto.diagnosticTests) {
            ensureSpace(24);
            doc.fontSize(10).font("Helvetica-Bold").fillColor(COLORS.primary).text(`  ${dt.name || "?"}`);
            if (dt.whyTestIt) {
              doc.fontSize(9).font("Helvetica").fillColor(COLORS.muted).text(`    ${dt.whyTestIt}`);
            }
          }
        }
      }
    }

    // ---------- j. Next Steps ----------
    const ns = plan.nextSteps;
    if (ns && (ns.followUpTimeline || ns.text || ns.checklist?.length)) {
      sectionHeader("Next Steps");

      if (ns.followUpTimeline) {
        label("Follow-up Timeline:"); value(ns.followUpTimeline);
        doc.moveDown(0.2);
      }
      if (ns.text) {
        bodyText(ns.text);
        doc.moveDown(0.3);
      }
      if (ns.checklist?.length) {
        doc.fontSize(10).font("Helvetica-Bold").fillColor(COLORS.primary).text("Checklist:");
        for (const item of ns.checklist) {
          bulletItem(item.text);
        }
        doc.moveDown(0.3);
      }
      if (ns.disclaimer) {
        doc.moveDown(0.3);
        doc.fontSize(8).font("Helvetica-Oblique").fillColor(COLORS.muted).text(ns.disclaimer, { lineGap: 1 });
      }
    }

    // ---------- k. Footer ----------
    doc.moveDown(1.5);
    horizontalRule();
    doc.moveDown(0.3);
    doc.fontSize(8).font("Helvetica").fillColor(COLORS.muted)
      .text("Generated by Cyborg.Men  |  This is not medical advice  |  Review with your doctor", { align: "center" });

    // ---------- Finalize ----------
    doc.end();
  } catch (error) {
    // If headers already sent (streaming started), we can't send JSON error
    if (res.headersSent) {
      console.error("[ActionPlan PDF] Error during PDF stream:", error.message);
      res.end();
      return;
    }
    next(error);
  }
};

/**
 * Daily protocol adherence — which "Today's plan" items the user has marked as
 * taken on a given day. Date is the user's local "YYYY-MM-DD" (sent by the client).
 */
function normalizeDate(d) {
  const s = String(d || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : new Date().toISOString().slice(0, 10);
}

const getAdherence = async (req, res, next) => {
  try {
    const date = normalizeDate(req.query.date);
    const doc = await ProtocolAdherence.findOne({ userId: req.user.id, date }).lean();
    res.sendSuccess({ date, taken: doc?.taken || [] });
  } catch (error) {
    next(error);
  }
};

const toggleAdherence = async (req, res, next) => {
  try {
    const itemKey = String(req.body?.itemKey || "").trim();
    if (!itemKey) return res.sendError("itemKey is required", 400);
    const date = normalizeDate(req.body?.date);

    let doc = await ProtocolAdherence.findOne({ userId: req.user.id, date });
    if (!doc) doc = new ProtocolAdherence({ userId: req.user.id, date, taken: [] });

    const idx = doc.taken.indexOf(itemKey);
    if (idx >= 0) doc.taken.splice(idx, 1);
    else doc.taken.push(itemKey);
    await doc.save();

    res.sendSuccess({ date, taken: doc.taken });
  } catch (error) {
    next(error);
  }
};

module.exports = { createPlan, getPlan, getLatestPlan, retryPlan, exportPlanPDF, getAdherence, toggleAdherence };
