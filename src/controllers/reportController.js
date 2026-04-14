const fs = require("fs");
const mongoose = require("mongoose");
const ReportData = require("../models/ReportData");
const User = require("../models/User");
const { pdfParserSystemPrompt } = require("../prompts/pdfParser");
const { parseVision, extractJSON, getModelName } = require("../providers/ai");
const { normalizeTests } = require("../utils/labNormalizer");
const {
  computeDerivedBiomarkers,
  buildFullBiomarkerPanel,
} = require("../utils/derivedBiomarkers");
const { computeScores } = require("../utils/scoringEngine");

const VISION_USER_PROMPT =
  "Extract every piece of data from this medical report into the JSON schema specified in your instructions. Be exhaustive — capture all tests, values, ranges, flags, patient details, and metadata.";

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
 * Upload and parse a blood report via vision AI
 */
const uploadReport = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.sendError("No file provided", 400);
    }

    // Validate MIME type
    const ALLOWED_MIMES = ["application/pdf", "image/jpeg", "image/png", "image/jpg", "image/webp"];
    if (!ALLOWED_MIMES.includes(req.file.mimetype)) {
      // Clean up temp file
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.sendError("Only PDF and image files (JPG, PNG, WEBP) are allowed", 400);
    }

    const buffer = fs.readFileSync(req.file.path);
    const filename = req.file.originalname;
    const mimeType = req.file.mimetype;

    // Clean up temp file after reading into memory
    try { fs.unlinkSync(req.file.path); } catch (_) {}

    // Parse with vision AI
    const { text, usage } = await parseVision({
      buffer,
      mimeType,
      filename,
      systemPrompt: pdfParserSystemPrompt,
      userPrompt: VISION_USER_PROMPT,
    });

    const parsedData = extractJSON(text);

    // Normalize and compute biomarkers
    const normalized = normalizeTests(parsedData);
    const derived = computeDerivedBiomarkers(normalized);
    const allTests = [...normalized, ...derived];
    const biomarkerPanel = buildFullBiomarkerPanel(allTests);
    const reportDate = extractReportDate(parsedData) || new Date();

    // Compute scores (non-blocking — report saves even if scoring fails)
    let scores = null;
    try {
      const userDoc = await User.findById(req.user.id)
        .select("dateOfBirth onboardingData onboardingAnswers")
        .lean();
      let sex = userDoc?.onboardingData?.sex || null;
      if (!sex && userDoc?.onboardingAnswers) {
        const oa = await mongoose.connection.db
          .collection("onboardinganswers")
          .findOne({ _id: userDoc.onboardingAnswers });
        sex = oa?.answers?.["1.3"] || null;
      }
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

    // Create report document
    const reportData = await ReportData.create({
      userId: req.user.id,
      sourceUrl: `upload://${filename}`,
      filename,
      parsedData,
      reportDate,
      reportLabel: "",
      biomarkerPanel,
      scores,
      modelUsed: getModelName(),
      tokensUsed: usage,
    });

    // Update user: push to bloodReports array and set latest bloodReport
    await User.findByIdAndUpdate(req.user.id, {
      bloodReport: reportData._id,
      $addToSet: { bloodReports: reportData._id },
    });

    res.sendSuccess(
      {
        _id: reportData._id,
        filename,
        mimeType,
        reportDate,
        parsedData,
        biomarkerPanel,
        scores,
        uploadedAt: reportData.createdAt,
      },
      "Blood report uploaded and parsed successfully",
      201
    );
  } catch (error) {
    next(error);
  }
};

/**
 * List all reports for the authenticated user
 */
const listReports = async (req, res, next) => {
  try {
    const reports = await ReportData.find({ userId: req.user.id })
      .select(
        "filename sourceUrl parsedData reportDate reportLabel biomarkerPanel createdAt"
      )
      .sort({ reportDate: -1, createdAt: -1 })
      .lean();

    const result = reports.map((r) => ({
      _id: r._id,
      filename: r.filename || r.sourceUrl,
      reportDate: r.reportDate || r.createdAt,
      reportLabel: r.reportLabel || "",
      flaggedCount:
        r.biomarkerPanel?.filter(
          (t) => t.numericValue !== null && t.flag !== "normal"
        ).length || 0,
      testCount:
        r.biomarkerPanel?.filter((t) => t.numericValue !== null).length || 0,
      parsedData: r.parsedData,
      uploadedAt: r.createdAt,
    }));

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

    res.sendSuccess(report, "Report retrieved successfully");
  } catch (error) {
    next(error);
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

    const tested = report.biomarkerPanel.filter((b) => b.numericValue !== null);
    const missing = report.biomarkerPanel.filter(
      (b) => b.numericValue === null
    );

    res.sendSuccess(
      {
        reportId: report._id,
        reportDate: report.reportDate || report.createdAt,
        reportLabel: report.reportLabel || "",
        filename: report.filename,
        scores: report.scores,
        summary: {
          totalBiomarkers: report.biomarkerPanel.length,
          tested: tested.length,
          missing: missing.length,
          flagged: tested.filter((b) => b.flag !== "normal").length,
          optimal: tested.filter((b) => b.optimalFlag === "optimal").length,
        },
        biomarkerPanel: report.biomarkerPanel,
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

module.exports = {
  uploadReport,
  listReports,
  getReport,
  updateReport,
  deleteReport,
  getBiomarkers,
  getBiomarkerPanel,
  getBiomarkerTimeline,
};
