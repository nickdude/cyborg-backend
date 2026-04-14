const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const User = require("../models/User");
const ReportData = require("../models/ReportData");
const { parseVision, extractJSON, getModelName } = require("../providers/ai");
const { pdfParserSystemPrompt } = require("../prompts/pdfParser");
const { normalizeTests } = require("../utils/labNormalizer");
const {
  computeDerivedBiomarkers,
  buildFullBiomarkerPanel,
} = require("../utils/derivedBiomarkers");
const { computeScores } = require("../utils/scoringEngine");

const BACKEND_ROOT = path.resolve(__dirname, "../../");

const VISION_USER_PROMPT =
  "Extract every piece of data from this medical report into the JSON schema specified in your instructions. Be exhaustive — capture all tests, values, ranges, flags, patient details, and metadata.";

/**
 * Resolve a file URL / path to a buffer.
 *
 * Accepted fileUrl formats:
 *   backend/uploads/bloodreport.pdf   → relative to project root
 *   /uploads/blood-reports/file.jpg   → relative to BACKEND_ROOT
 *   https://...                       → fetched from S3 / remote URL
 */
async function resolveFile(fileUrl) {
  const UPLOADS_DIR = path.join(BACKEND_ROOT, "uploads");

  // backend/uploads/ prefix — relative to monorepo/project root
  if (fileUrl.startsWith("backend/")) {
    const filePath = path.resolve(BACKEND_ROOT, "..", fileUrl);
    if (!filePath.startsWith(UPLOADS_DIR))
      throw new Error("Path outside allowed directory");
    if (!fs.existsSync(filePath)) throw new Error("File not found");
    return readLocalFile(filePath);
  }

  // /uploads/ prefix — relative to the backend root
  if (fileUrl.startsWith("/uploads/")) {
    const filePath = path.resolve(BACKEND_ROOT, fileUrl.slice(1));
    if (!filePath.startsWith(UPLOADS_DIR))
      throw new Error("Path outside allowed directory");
    if (!fs.existsSync(filePath)) throw new Error("File not found");
    return readLocalFile(filePath);
  }

  // Reject other local paths — no arbitrary filesystem access
  if (
    fileUrl.startsWith("/") ||
    fileUrl.startsWith("./") ||
    fileUrl.startsWith("../")
  ) {
    throw new Error("Local file paths must be within backend/uploads/");
  }

  // Remote URL — fetch from S3 or CDN
  const response = await fetch(fileUrl);
  if (!response.ok)
    throw new Error(
      `Failed to fetch file from ${fileUrl}: ${response.status}`
    );
  const buffer = Buffer.from(await response.arrayBuffer());
  const filename = path.basename(new URL(fileUrl).pathname) || "report";
  const contentType = response.headers.get("content-type") || "application/pdf";
  return { buffer, mimeType: contentType, filename };
}

function readLocalFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
  };
  return {
    buffer,
    mimeType: mimeMap[ext] || "application/pdf",
    filename: path.basename(filePath),
  };
}

/**
 * POST /api/agent/parse-report
 *
 * Server-to-server endpoint. Accepts { userId, fileUrl } or { userId, bloodReportId }.
 * Parses the report through the full pipeline and persists the result.
 */
const parseReport = async (req, res, next) => {
  try {
    const { userId, fileUrl, bloodReportId } = req.body || {};

    if (!userId) {
      return res.sendError("userId is required", 400);
    }
    if (!fileUrl && !bloodReportId) {
      return res.sendError("fileUrl or bloodReportId is required", 400);
    }

    // Validate user exists
    const user = await User.findById(userId).lean();
    if (!user) {
      return res.sendError("User not found", 404);
    }

    // Resolve file — either from bloodReportId lookup or direct fileUrl
    let resolvedFileUrl = fileUrl;
    let bloodReportDoc = null;

    if (bloodReportId) {
      bloodReportDoc = await mongoose.connection.db
        .collection("bloodreports")
        .findOne({ _id: new mongoose.Types.ObjectId(bloodReportId) });

      if (!bloodReportDoc) {
        return res.sendError("Blood report not found", 404);
      }
      if (bloodReportDoc.userId.toString() !== userId) {
        return res.sendError("Report does not belong to this user", 403);
      }

      resolvedFileUrl = bloodReportDoc.filePath || bloodReportDoc.fileUrl;
      if (!resolvedFileUrl) {
        return res.sendError("Blood report has no filePath or fileUrl", 400);
      }
    }

    // Resolve and parse the file
    let fileData;
    try {
      fileData = await resolveFile(resolvedFileUrl);
    } catch (err) {
      console.error(`[ReportAgent] File read failed:`, err.message);
      return res.sendError("Could not read file", 400);
    }

    const { buffer, mimeType, filename } = fileData;

    console.log(
      `[ReportAgent] Parsing ${filename} (${mimeType}) for user ${userId}`
    );

    // --- Vision parsing ---
    let parsedData, usage, truncated;
    try {
      const result = await parseVision({
        buffer,
        mimeType,
        filename,
        systemPrompt: pdfParserSystemPrompt,
        userPrompt: VISION_USER_PROMPT,
      });
      usage = result.usage;
      truncated = result.truncated || false;

      if (truncated) {
        console.warn(
          `[ReportAgent] Response was truncated for ${filename} — JSON extraction may be partial`
        );
      }

      parsedData = extractJSON(result.text);
    } catch (err) {
      console.error(
        `[ReportAgent] Parse failed for ${filename}:`,
        err.message
      );
      return res.sendError("Report parsing failed", 422);
    }

    // --- Normalize, derive, score, and persist ---
    let reportData;
    try {
      const normalized = normalizeTests(parsedData);
      const derived = computeDerivedBiomarkers(normalized);
      const allTests = [...normalized, ...derived];
      const biomarkerPanel = buildFullBiomarkerPanel(allTests);
      const dateStr =
        parsedData?.report?.reportDate ||
        parsedData?.report?.date ||
        parsedData?.reportDate;
      const reportDate =
        dateStr && !isNaN(new Date(dateStr)) ? new Date(dateStr) : new Date();

      // Compute scores — non-blocking (report saves even if scoring fails)
      let scores = null;
      try {
        const userDoc = await User.findById(userId)
          .select("dateOfBirth onboardingData onboardingAnswers")
          .lean();
        let sex = userDoc?.onboardingData?.sex || null;
        if (!sex && userDoc?.onboardingAnswers) {
          const oa = await mongoose.connection.db
            .collection("onboardinganswers")
            .findOne({
              _id: new mongoose.Types.ObjectId(userDoc.onboardingAnswers),
            });
          sex = oa?.answers?.["1.3"] || null;
        }
        scores = computeScores(biomarkerPanel, {
          dateOfBirth: userDoc?.dateOfBirth,
          sex,
        });
      } catch (err) {
        console.error(
          "[ReportAgent] Scoring failed, saving report without scores:",
          err.message
        );
      }

      reportData = await ReportData.create({
        userId,
        sourceUrl: resolvedFileUrl,
        filename,
        parsedData,
        reportDate,
        biomarkerPanel,
        scores,
        modelUsed: getModelName(),
        tokensUsed: usage,
      });

      await User.findByIdAndUpdate(userId, {
        bloodReport: reportData._id,
        $addToSet: {
          bloodReports: bloodReportDoc?._id || reportData._id,
        },
      });

      if (bloodReportDoc) {
        await mongoose.connection.db.collection("bloodreports").updateOne(
          { _id: bloodReportDoc._id },
          { $set: { parsedReportId: reportData._id, parsedAt: new Date() } }
        );
      }
    } catch (err) {
      console.error(
        `[ReportAgent] DB write failed for user ${userId}:`,
        err.message
      );
      return res.sendError("Failed to save parsed report", 500);
    }

    console.log(
      `[ReportAgent] Saved report ${reportData._id} for user ${userId} | tokens: ${usage?.input}in/${usage?.output}out | truncated: ${truncated}`
    );

    res.sendSuccess(
      {
        reportId: reportData._id,
        filename,
        truncated,
        tokensUsed: usage,
        parsedData,
      },
      "Report parsed successfully"
    );
  } catch (error) {
    next(error);
  }
};

module.exports = { parseReport };
