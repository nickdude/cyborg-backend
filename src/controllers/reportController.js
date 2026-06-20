const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mongoose = require("mongoose");
const ReportData = require("../models/ReportData");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { pdfParserSystemPrompt } = require("../prompts/pdfParser");
const { parseVision, extractJSON, getModelName } = require("../providers/ai");
const { normalizeTests } = require("../utils/labNormalizer");
const {
  computeDerivedBiomarkers,
  buildFullBiomarkerPanel,
} = require("../utils/derivedBiomarkers");
const { computeScores } = require("../utils/scoringEngine");
const reportStorage = require("../utils/reportStorage");
const storage = require("../services/storage");

const VISION_USER_PROMPT =
  "Extract every piece of data from this medical report into the JSON schema specified in your instructions. Be exhaustive — capture all tests, values, ranges, flags, patient details, and metadata.";

const VISION_BASE_MAX_TOKENS =
  Number(process.env.VISION_BASE_MAX_TOKENS) || 32768;
const VISION_RETRY_MAX_TOKENS =
  Number(process.env.VISION_RETRY_MAX_TOKENS) ||
  Math.min(VISION_BASE_MAX_TOKENS * 2, 64000);

/**
 * Extract reportDate from parsed data with fallback
 */
function extractReportDate(parsedData) {
  const dateStr =
    parsedData?.report?.reportDate ||
    parsedData?.report?.date ||
    parsedData?.reportDate;
  const parsed = dateStr ? new Date(dateStr) : null;
  return parsed && !isNaN(parsed) ? parsed : null;
}

/**
 * Parse a report via vision AI with truncation-aware retry.
 * On truncation: re-runs once with a larger token budget.
 * Returns { parsedData, usage, truncated } or throws.
 */
function writeFailedParseDump({ userId, filename, mimeType, truncated, usage, text, err, stage }) {
  try {
    const dumpDir = path.join("uploads", "failed-parses");
    fs.mkdirSync(dumpDir, { recursive: true });
    const safeName = String(filename || "unknown").replace(/[^a-z0-9.-]/gi, "_");
    const dumpPath = path.join(
      dumpDir,
      `${userId || "anon"}-${Date.now()}-${safeName}.txt`
    );
    fs.writeFileSync(
      dumpPath,
      [
        `# Failed parse @ ${new Date().toISOString()}`,
        `# stage: ${stage}`,
        `# userId: ${userId}`,
        `# filename: ${filename}`,
        `# mimeType: ${mimeType}`,
        `# truncated: ${truncated}`,
        `# usage: ${JSON.stringify(usage || null)}`,
        `# error: ${err?.message} (code=${err?.code || "n/a"})`,
        `# errorStack: ${err?.stack || "n/a"}`,
        `# rawLength: ${text?.length ?? 0}`,
        ``,
        text || "(no response text captured)",
      ].join("\n")
    );
    console.warn(`[Reports] Wrote failed-parse dump -> ${dumpPath}`);
    return dumpPath;
  } catch (dumpErr) {
    console.warn(`[Reports] dump-write-error: ${dumpErr.message}`);
    return null;
  }
}

async function parseReportResilient({ buffer, mimeType, filename, userId }) {
  const baseOpts = {
    buffer,
    mimeType,
    filename,
    systemPrompt: pdfParserSystemPrompt,
    userPrompt: VISION_USER_PROMPT,
  };

  let result = null;

  try {
    result = await parseVision({ ...baseOpts, maxTokens: VISION_BASE_MAX_TOKENS });
  } catch (visionErr) {
    const dumpPath = writeFailedParseDump({
      userId, filename, mimeType,
      truncated: false, usage: null, text: null,
      err: visionErr, stage: "parseVision-primary",
    });
    visionErr.dumpPath = dumpPath;
    throw visionErr;
  }

  if (result.truncated) {
    console.warn(
      `[Reports] Response truncated for user=${userId} file=${filename}. Retrying with maxTokens=${VISION_RETRY_MAX_TOKENS}`
    );
    try {
      const retry = await parseVision({ ...baseOpts, maxTokens: VISION_RETRY_MAX_TOKENS });
      if (retry?.text) result = retry;
    } catch (retryErr) {
      console.warn(
        `[Reports] Retry errored for user=${userId} file=${filename}: ${retryErr.message}. Using original response.`
      );
    }
  }

  try {
    const parsedData = extractJSON(result.text);
    return { parsedData, usage: result.usage, truncated: result.truncated };
  } catch (parseErr) {
    const dumpPath = writeFailedParseDump({
      userId, filename, mimeType,
      truncated: result.truncated, usage: result.usage, text: result.text,
      err: parseErr, stage: "extractJSON",
    });
    parseErr.dumpPath = dumpPath;
    throw parseErr;
  }
}

/**
 * Process a report in the background after the upload response has been sent.
 * Handles: AI parsing, normalization, scoring, user updates, and notifications.
 */
async function processReportInBackground(userId, reportId, buffer, mimeType, filename) {
  try {
    // 1. Update status to 'analyzing'
    await ReportData.findByIdAndUpdate(reportId, { status: "analyzing" });

    // 2. Parse with vision AI (truncation-aware retry + JSON repair)
    let parsedData, usage, truncated;
    try {
      const out = await parseReportResilient({
        buffer,
        mimeType,
        filename,
        userId,
      });
      parsedData = out.parsedData;
      usage = out.usage;
      truncated = out.truncated;
    } catch (parseErr) {
      console.error(
        `[Reports] parse-error stage=${parseErr.dumpPath ? "dumped" : "no-dump"} code=${parseErr.code || "n/a"} file=${filename} user=${userId} dump=${parseErr.dumpPath || "none"} msg=${parseErr.message}`
      );
      console.error("[Reports] LLM parse failed", {
        userId,
        filename,
        mimeType,
        model: getModelName(),
        code: parseErr.code || null,
        rawLength: parseErr.rawLength ?? null,
        rawSnippet: parseErr.rawSnippet ?? null,
        dumpPath: parseErr.dumpPath ?? null,
        message: parseErr.message,
        stack: parseErr.stack,
      });
      throw parseErr;
    }

    // 3. Notify analysis complete
    await Notification.create({
      userId,
      type: "analysis:ready",
      metadata: { reportId },
    });

    // 4. Fetch user sex for sex-aware biomarker ranges
    const userDoc = await User.findById(userId)
      .select("dateOfBirth onboardingData onboardingAnswers biologicalSex")
      .lean();
    let sex = userDoc?.biologicalSex || userDoc?.onboardingData?.sex || null;
    if (!sex && userDoc?.onboardingAnswers) {
      const oa = await mongoose.connection.db
        .collection("onboardinganswers")
        .findOne({ _id: userDoc.onboardingAnswers });
      sex = oa?.answers?.["1.3"] || null;
    }

    // 5. Normalize and compute biomarkers (sex-aware optimal ranges)
    const normalized = normalizeTests(parsedData, sex);
    const derived = computeDerivedBiomarkers(normalized);
    const allTests = [...normalized, ...derived];
    const biomarkerPanel = buildFullBiomarkerPanel(allTests);
    const reportDate = extractReportDate(parsedData) || new Date();

    // 6. Compute scores (non-blocking — report saves even if scoring fails)
    let scores = null;
    try {
      scores = computeScores(biomarkerPanel, {
        dateOfBirth: userDoc?.dateOfBirth,
        sex,
      });
    } catch (err) {
      console.error(
        "[Reports] Scoring failed, saving report without scores:",
        err.message
      );
    }

    // 7. Update ReportData with parsed results
    await ReportData.findByIdAndUpdate(reportId, {
      parsedData,
      biomarkerPanel,
      scores,
      reportDate,
      modelUsed: getModelName(),
      tokensUsed: usage,
      status: "ready",
    });

    // 8. Update user: push to bloodReports array, set latest bloodReport, and
    // flip latestReportReady so the dashboard switches to the Insights view.
    await User.findByIdAndUpdate(userId, {
      bloodReport: reportId,
      latestReportReady: true,
      $addToSet: { bloodReports: reportId },
    });

    // 9. Notify report ready + notify linked doctor
    await Notification.create({
      userId,
      type: "report:ready",
      metadata: { reportId, filename, testCount: biomarkerPanel.length },
    });
    const { notifyDoctor } = require("../utils/notificationHelper");
    await notifyDoctor(userId, "doctor:report_uploaded", { reportId, filename });

    // 10. Supersede any existing non-approved plans, then trigger fresh generation
    const { triggerGoalsAndActionPlan } = require("../services/actionPlanGenerator");
    const ActionPlan = require("../models/ActionPlan");
    await ActionPlan.updateMany(
      { userId, status: { $in: ["pending", "generating", "pending_review", "draft"] } },
      { $set: { status: "superseded" } }
    );
    ActionPlan.findOneAndUpdate(
      { userId, reportId },
      { $setOnInsert: { status: "pending" } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
      .then((plan) => {
        if (plan.status === "pending") {
          return triggerGoalsAndActionPlan(userId, reportId, plan._id);
        }
      })
      .catch((err) => console.error(`[ActionPlan] bg-gen trigger failed: ${err.message}`));
  } catch (err) {
    // On any error: mark report as failed and notify user
    console.error(
      `[Reports] Background processing failed for report=${reportId} user=${userId}: ${err.message}`
    );
    try {
      await ReportData.findByIdAndUpdate(reportId, { status: "failed" });
      await Notification.create({
        userId,
        type: "report:failed",
        metadata: { reportId, filename, error: err.message },
      });
    } catch (cleanupErr) {
      console.error(
        `[Reports] Failed to update status/notify after error for report=${reportId}: ${cleanupErr.message}`
      );
    }
  }
}

/**
 * Upload a blood report — persists the file and returns immediately.
 * AI parsing, normalization, and scoring happen in the background.
 */
const uploadReport = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.sendError("No file provided", 400);
    }

    // Validate MIME type (multer fileFilter is the primary gate, this is a belt-and-suspenders check)
    const ALLOWED_MIMES = ["application/pdf", "image/jpeg", "image/png", "image/jpg", "image/webp"];
    if (!ALLOWED_MIMES.includes(req.file.mimetype)) {
      return res.sendError("Only PDF and image files (JPG, PNG, WEBP) are allowed", 400);
    }

    // Multer is configured with memoryStorage — the buffer arrives in-memory.
    // No disk I/O, no temp file cleanup.
    const buffer = req.file.buffer;
    const filename = req.file.originalname;
    const mimeType = req.file.mimetype;

    // Dedupe: short-circuit if this exact file was already parsed for this user.
    // Computed pre-parse so duplicate uploads never burn LLM tokens.
    const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
    const existing = await ReportData.findOne({
      userId: req.user.id,
      fileHash,
    })
      .select("_id filename reportDate createdAt")
      .lean();
    if (existing) {
      const when = (existing.reportDate || existing.createdAt || new Date()).toISOString().slice(0, 10);
      return res.sendError(
        `This report was already uploaded on ${when}. Refresh to view it.`,
        409
      );
    }

    // Persist the raw upload to R2 so it can be viewed later. Key is derived
    // from userId + file hash so duplicate uploads (same user, same bytes)
    // land on the same object — complements the DB-level dedupe above.
    const reportObjectId = new mongoose.Types.ObjectId();
    let storageKey = null;
    let sourceUrl = `upload://${filename}`; // fallback if R2 isn't configured
    try {
      storageKey = await reportStorage.saveReport({
        userId: req.user.id,
        fileHash,
        buffer,
        mimeType,
      });
      const publicUrl = reportStorage.publicUrlFor(storageKey);
      if (publicUrl) sourceUrl = publicUrl;
    } catch (storageErr) {
      console.warn(
        `[Reports] Could not persist original file to R2 for report=${reportObjectId} user=${req.user.id}: ${storageErr.message}. Proceeding without storageKey.`
      );
    }

    // Create report document with 'uploaded' status — no parsed data yet
    const reportData = await ReportData.create({
      _id: reportObjectId,
      userId: req.user.id,
      sourceUrl,
      filename,
      mimeType,
      parsedData: {},
      reportDate: null,
      reportLabel: "",
      fileHash,
      storageKey,
      status: "uploaded",
    });

    // Create upload success notification
    await Notification.create({
      userId: req.user.id,
      type: "upload:success",
      metadata: { reportId: reportData._id, filename },
    });

    // Return 202 immediately — processing continues in the background
    res.sendSuccess(
      {
        _id: reportData._id,
        filename,
        status: "uploaded",
      },
      "Blood report uploaded. Processing will continue in the background.",
      202
    );

    // Fire-and-forget: process the report in the background
    processReportInBackground(req.user.id, reportData._id, buffer, mimeType, filename);
  } catch (error) {
    next(error);
  }
};

/**
 * List all reports for the authenticated user
 */
const listReports = async (req, res, next) => {
  try {
    const ActionPlan = require("../models/ActionPlan");

    const [reports, actionPlans] = await Promise.all([
      ReportData.find({ userId: req.user.id })
        .select(
          "filename sourceUrl parsedData reportDate reportLabel biomarkerPanel status createdAt"
        )
        .sort({ reportDate: -1, createdAt: -1 })
        .lean(),
      ActionPlan.find({ userId: req.user.id })
        .select("reportId status")
        .lean(),
    ]);

    const planMap = {};
    for (const plan of actionPlans) {
      planMap[plan.reportId.toString()] = { _id: plan._id, status: plan.status };
    }

    const result = reports.map((r) => {
      const plan = planMap[r._id.toString()];
      return {
        _id: r._id,
        filename: r.filename || r.sourceUrl,
        sourceUrl: r.sourceUrl && /^https?:\/\//i.test(r.sourceUrl) ? r.sourceUrl : null,
        reportDate: r.reportDate || r.createdAt,
        reportLabel: r.reportLabel || "",
        flaggedCount:
          r.biomarkerPanel?.filter(
            (t) => t.numericValue !== null && t.flag !== "normal"
          ).length || 0,
        testCount:
          r.biomarkerPanel?.filter((t) => t.numericValue !== null).length || 0,
        parsedData: r.parsedData,
        status: r.status || "ready",
        uploadedAt: r.createdAt,
        actionPlan: plan ? true : false,
        actionPlanId: plan?._id || null,
        actionPlanStatus: plan?.status || null,
      };
    });

    res.sendSuccess(result, "Reports retrieved successfully");
  } catch (error) {
    next(error);
  }
};

/**
 * Get a single report by ID
 */
const getReport = async (req, res, next) => {
  try {
    const report = await ReportData.findOne({
      _id: req.params.reportId,
      userId: req.user.id,
    }).lean();

    if (!report) {
      return res.sendError("Report not found", 404);
    }

    if (report.biomarkerPanel) {
      report.biomarkerPanel = report.biomarkerPanel.filter(
        (b) => b.numericValue != null
      );
    }

    res.sendSuccess(report, "Report retrieved successfully");
  } catch (error) {
    next(error);
  }
};

/**
 * Return a URL to the original uploaded file. Gated by JWT + ownership.
 *
 * Prefers a public r2.dev URL (fast, cacheable). Falls back to a signed URL
 * if the bucket isn't configured for public access. Responds with a 302
 * redirect so <a href>/<iframe src> usage "just works" from the frontend.
 */
const getReportFile = async (req, res, next) => {
  try {
    const report = await ReportData.findOne({
      _id: req.params.reportId,
      userId: req.user.id,
    })
      .select("storageKey mimeType filename sourceUrl")
      .lean();

    if (!report) return res.sendError("Report not found", 404);
    if (!report.storageKey) {
      // Legacy rows without storageKey have nothing to stream.
      return res.sendError("Original file not stored for this report", 404);
    }

    // Stream the object through the backend so browsers never cross-origin to
    // R2 (the public r2.dev bucket has no CORS headers, so XHR/fetch calls
    // followed through a 302 redirect get blocked).
    try {
      const { body, contentType, contentLength } = await reportStorage.fetchReport(
        report.storageKey
      );
      res.setHeader("Content-Type", contentType || report.mimeType || "application/octet-stream");
      if (contentLength) res.setHeader("Content-Length", contentLength);
      if (report.filename) {
        res.setHeader(
          "Content-Disposition",
          `inline; filename="${report.filename.replace(/"/g, "")}"`
        );
      }
      body.on("error", (err) => {
        console.error(`[Reports] Stream error for ${report.storageKey}: ${err.message}`);
        if (!res.headersSent) res.sendError("File unavailable", 500);
        else res.destroy(err);
      });
      return body.pipe(res);
    } catch (err) {
      console.error(`[Reports] Failed to fetch ${report.storageKey}: ${err.message}`);
      return res.sendError("File unavailable", 500);
    }
  } catch (err) {
    next(err);
  }
};

/**
 * Update report label and/or date
 */
const updateReport = async (req, res, next) => {
  try {
    const { reportLabel, reportDate } = req.body || {};
    const update = {};
    if (reportLabel !== undefined) update.reportLabel = reportLabel;
    if (reportDate !== undefined) update.reportDate = new Date(reportDate);

    const report = await ReportData.findOneAndUpdate(
      { _id: req.params.reportId, userId: req.user.id },
      { $set: update },
      { new: true }
    );

    if (!report) {
      return res.sendError("Report not found", 404);
    }

    res.sendSuccess(report, "Report updated successfully");
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a report
 */
const deleteReport = async (req, res, next) => {
  try {
    const report = await ReportData.findOneAndDelete({
      _id: req.params.reportId,
      userId: req.user.id,
    });

    if (!report) {
      return res.sendError("Report not found", 404);
    }

    // Best-effort remove of the stored original file from R2. Non-throwing.
    await reportStorage.deleteReport(report.storageKey);

    // Pull from user's bloodReports array
    await User.findByIdAndUpdate(req.user.id, {
      $pull: { bloodReports: report._id },
    });

    // Update bloodReport to latest remaining report
    const latest = await ReportData.findOne({ userId: req.user.id })
      .sort({ reportDate: -1 })
      .select("_id");
    await User.findByIdAndUpdate(req.user.id, {
      bloodReport: latest?._id || null,
    });

    res.sendSuccess(null, "Report deleted successfully");
  } catch (error) {
    next(error);
  }
};

/**
 * Get unique biomarker canonical names across all user's reports
 */
const getBiomarkers = async (req, res, next) => {
  try {
    const reports = await ReportData.find({ userId: req.user.id })
      .select("biomarkerPanel")
      .lean();

    const biomarkerMap = new Map();
    for (const r of reports) {
      for (const t of (r.biomarkerPanel || []).filter(
        (b) => b.numericValue !== null
      )) {
        if (!biomarkerMap.has(t.canonicalName)) {
          biomarkerMap.set(t.canonicalName, {
            canonicalName: t.canonicalName,
            displayName: t.displayName,
            category: t.category,
            unit: t.unit,
            reportCount: 0,
          });
        }
        biomarkerMap.get(t.canonicalName).reportCount++;
      }
    }

    res.sendSuccess(
      [...biomarkerMap.values()].sort((a, b) => b.reportCount - a.reportCount),
      "Biomarkers retrieved successfully"
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Get the full biomarker panel from the user's latest report
 */
const getBiomarkerPanel = async (req, res, next) => {
  try {
    const report = await ReportData.findOne({ userId: req.user.id })
      .sort({ reportDate: -1, createdAt: -1 })
      .select(
        "biomarkerPanel scores reportDate reportLabel filename createdAt"
      )
      .lean();

    if (!report) {
      return res.sendError(
        "No reports found. Upload a lab report first.",
        404
      );
    }

    const tested = report.biomarkerPanel.filter((b) => b.numericValue != null);
    const missing = report.biomarkerPanel.filter(
      (b) => b.numericValue == null
    );

    res.sendSuccess(
      {
        reportId: report._id,
        reportDate: report.reportDate || report.createdAt,
        reportLabel: report.reportLabel || "",
        filename: report.filename,
        scores: report.scores,
        summary: {
          totalBiomarkers: tested.length,
          tested: tested.length,
          missing: missing.length,
          flagged: tested.filter((b) => b.flag !== "normal").length,
          optimal: tested.filter((b) => b.optimalFlag === "optimal").length,
        },
        biomarkerPanel: tested,
      },
      "Biomarker panel retrieved successfully"
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Get timeline for a specific biomarker across all reports
 */
const getBiomarkerTimeline = async (req, res, next) => {
  try {
    const { canonicalName } = req.params;
    const reports = await ReportData.find({
      userId: req.user.id,
      "biomarkerPanel.canonicalName": canonicalName,
    })
      .select("biomarkerPanel reportDate reportLabel createdAt")
      .sort({ reportDate: 1, createdAt: 1 })
      .lean();

    const dataPoints = [];
    for (const r of reports) {
      const test = r.biomarkerPanel.find(
        (t) => t.canonicalName === canonicalName && t.numericValue !== null
      );
      if (test) {
        dataPoints.push({
          date: (r.reportDate || r.createdAt).toISOString().slice(0, 10),
          value: test.numericValue,
          unit: test.unit,
          flag: test.flag,
          referenceMin: test.referenceMin,
          referenceMax: test.referenceMax,
          reportId: r._id,
          reportLabel: r.reportLabel || "",
        });
      }
    }

    // Compute simple trend
    let trend = "insufficient_data";
    let trendAlert = null;
    if (dataPoints.length >= 2) {
      const first = dataPoints[0].value;
      const last = dataPoints[dataPoints.length - 1].value;
      const changePct = ((last - first) / first) * 100;
      if (Math.abs(changePct) < 5) trend = "stable";
      else trend = changePct > 0 ? "increasing" : "decreasing";

      // Alert if latest value is flagged
      const latestFlag = dataPoints[dataPoints.length - 1].flag;
      if (latestFlag !== "normal" && dataPoints.length >= 2) {
        const bioName = dataPoints[0].unit
          ? `${canonicalName.replace(/_/g, " ")} (${dataPoints[0].unit})`
          : canonicalName.replace(/_/g, " ");
        trendAlert = `${bioName} is ${latestFlag} and ${trend} over ${dataPoints.length} reports.`;
      }
    }

    res.sendSuccess(
      {
        biomarker: canonicalName,
        dataPoints,
        trend,
        trendAlert,
      },
      "Biomarker timeline retrieved successfully"
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Batch trends: returns historical values for all tested biomarkers across reports.
 * One API call instead of N individual timeline calls.
 */
const getBiomarkerTrends = async (req, res, next) => {
  try {
    const reports = await ReportData.find({ userId: req.user.id })
      .select("biomarkerPanel reportDate createdAt")
      .sort({ reportDate: 1, createdAt: 1 })
      .lean();

    if (reports.length === 0) {
      return res.sendSuccess({ trends: {} }, "No reports found");
    }

    const trends = {};

    for (const r of reports) {
      const date = (r.reportDate || r.createdAt).toISOString().slice(0, 10);
      for (const bm of r.biomarkerPanel) {
        if (bm.numericValue == null) continue;
        if (!trends[bm.canonicalName]) {
          trends[bm.canonicalName] = [];
        }
        trends[bm.canonicalName].push({
          date,
          value: bm.numericValue,
          reportId: r._id,
        });
      }
    }

    res.sendSuccess({ trends, reportCount: reports.length }, "Biomarker trends retrieved");
  } catch (error) {
    next(error);
  }
};

module.exports = {
  uploadReport,
  listReports,
  getReport,
  getReportFile,
  updateReport,
  deleteReport,
  getBiomarkers,
  getBiomarkerPanel,
  getBiomarkerTimeline,
  getBiomarkerTrends,
};
