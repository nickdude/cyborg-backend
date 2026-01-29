const axios = require("axios");

/**
 * Real AI API Service
 * Handles async job submission, status polling, and result retrieval
 * 
 * API Endpoints:
 * POST   /v1/report/jobs/mongo-ids        - Submit job (returns jobId)
 * GET    /v1/report/jobs/{jobId}          - Check job status
 * GET    /v1/report/jobs/{jobId}/result   - Get job result
 */

const API_BASE_URL = process.env.REAL_AI_API_URL || "http://localhost:8000/v1";
const API_KEY = process.env.REAL_AI_API_KEY || "local-dev-key";
const POLL_INTERVAL = parseInt(process.env.AI_POLL_INTERVAL || "2000"); // ms
const POLL_MAX_WAIT = parseInt(process.env.AI_POLL_MAX_WAIT || "300000"); // 5 min
const MAX_RETRIES = parseInt(process.env.AI_MAX_RETRIES || "3");

// Common axios config for real API calls
const getAxiosConfig = () => ({
  headers: {
    "X-API-KEY": API_KEY,
    "Content-Type": "application/json",
  },
  timeout: 30000,
});

/**
 * Submit action plan generation request to real API
 * @param {string} bloodReportId - MongoDB blood report ID
 * @param {string} questionnaireId - MongoDB questionnaire ID
 * @param {string} onboardingAnswersId - MongoDB onboarding answers ID
 * @returns {Promise<string>} External job ID from API
 */
const submitPlanRequest = async (bloodReportId, questionnaireId, onboardingAnswersId) => {
  try {
    console.log("[RealAI] Submitting plan request", {
      bloodReportId,
      questionnaireId,
      onboardingAnswersId,
    });

    const response = await axios.post(
      `${API_BASE_URL}/report/jobs/mongo-ids`,
      {
        blood_report_id: bloodReportId,
        questionnaire_id: questionnaireId,
        onboarding_answers_id: onboardingAnswersId,
      },
      getAxiosConfig()
    );

    const jobId = response.data?.jobId;
    if (!jobId) {
      throw new Error("No jobId returned from API");
    }

    console.log("[RealAI] Job submitted successfully", { jobId });
    return jobId;
  } catch (error) {
    console.error("[RealAI] Failed to submit plan request", {
      error: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });
    throw new Error(`Failed to submit plan request: ${error.message}`);
  }
};

/**
 * Check current status of a job
 * @param {string} jobId - External job ID
 * @returns {Promise<Object>} Job status object { status, progress?, message? }
 */
const checkJobStatus = async (jobId) => {
  try {
    const response = await axios.get(
      `${API_BASE_URL}/report/jobs/${jobId}`,
      getAxiosConfig()
    );

    const jobStatus = response.data?.status;
    if (!jobStatus) {
      throw new Error("No status returned from API");
    }

    console.log("[RealAI] Job status checked", { jobId, status: jobStatus });
    return response.data;
  } catch (error) {
    console.error("[RealAI] Failed to check job status", {
      jobId,
      error: error.message,
      status: error.response?.status,
    });
    throw new Error(`Failed to check job status: ${error.message}`);
  }
};

/**
 * Get final result of a completed job
 * @param {string} jobId - External job ID
 * @returns {Promise<Object>} Result object with actionPlan data
 */
const getJobResult = async (jobId) => {
  try {
    console.log("[RealAI] Fetching job result", { jobId });

    const response = await axios.get(
      `${API_BASE_URL}/report/jobs/${jobId}/result`,
      getAxiosConfig()
    );

    if (!response.data) {
      throw new Error("No result data returned from API");
    }

    console.log("[RealAI] Job result fetched successfully", { jobId });
    return response.data;
  } catch (error) {
    console.error("[RealAI] Failed to fetch job result", {
      jobId,
      error: error.message,
      status: error.response?.status,
    });
    throw new Error(`Failed to fetch job result: ${error.message}`);
  }
};

/**
 * Poll job status until ready or failed
 * Handles polling with exponential backoff and timeout
 * @param {string} jobId - External job ID
 * @param {number} maxWaitMs - Maximum time to wait (default from env)
 * @param {number} pollIntervalMs - Time between polls (default from env)
 * @returns {Promise<Object>} Final result object
 */
const pollUntilReady = async (jobId, maxWaitMs = POLL_MAX_WAIT, pollIntervalMs = POLL_INTERVAL) => {
  const startTime = Date.now();
  let pollCount = 0;
  let lastError = null;

  while (Date.now() - startTime < maxWaitMs) {
    try {
      pollCount++;
      const statusData = await checkJobStatus(jobId);
      const { status } = statusData;

      console.log(`[RealAI] Poll #${pollCount} - Status: ${status}`, {
        jobId,
        elapsedMs: Date.now() - startTime,
      });

      // Job completed successfully
      if (status === "completed") {
        console.log("[RealAI] Job completed, fetching result...");
        const result = await getJobResult(jobId);
        return {
          jobId,
          status: "completed",
          result,
          pollCount,
          elapsedMs: Date.now() - startTime,
        };
      }

      // Job failed
      if (status === "failed") {
        const errorMsg = statusData.error || "Job failed without error message";
        console.error("[RealAI] Job failed", { jobId, error: errorMsg });
        throw new Error(`Job failed: ${errorMsg}`);
      }

      // Still processing, wait and retry
      if (status === "processing" || status === "pending") {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        continue;
      }

      // Unknown status
      throw new Error(`Unknown job status: ${status}`);
    } catch (error) {
      lastError = error;
      console.error(`[RealAI] Poll #${pollCount} failed`, {
        jobId,
        error: error.message,
        elapsedMs: Date.now() - startTime,
      });

      // Retry after delay
      const remainingMs = maxWaitMs - (Date.now() - startTime);
      if (remainingMs > pollIntervalMs) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      } else {
        break;
      }
    }
  }

  // Timeout or final error
  const elapsedMs = Date.now() - startTime;
  const timeoutMsg = `Polling timeout after ${elapsedMs}ms (${pollCount} polls)`;
  const finalError = lastError ? lastError.message : timeoutMsg;

  console.error("[RealAI] Polling failed", {
    jobId,
    pollCount,
    elapsedMs,
    error: finalError,
  });

  throw new Error(finalError);
};

/**
 * Complete workflow: submit, poll, and retrieve result
 * @param {string} bloodReportId - MongoDB blood report ID
 * @param {string} questionnaireId - MongoDB questionnaire ID
 * @param {string} onboardingAnswersId - MongoDB onboarding answers ID
 * @returns {Promise<Object>} { jobId, result }
 */
const generateActionPlan = async (bloodReportId, questionnaireId, onboardingAnswersId) => {
  try {
    // Submit job
    const jobId = await submitPlanRequest(bloodReportId, questionnaireId, onboardingAnswersId);

    // Poll until ready
    const pollResult = await pollUntilReady(jobId);

    return {
      jobId,
      result: pollResult.result,
      pollCount: pollResult.pollCount,
      elapsedMs: pollResult.elapsedMs,
    };
  } catch (error) {
    console.error("[RealAI] Action plan generation failed", { error: error.message });
    throw error;
  }
};

module.exports = {
  submitPlanRequest,
  checkJobStatus,
  getJobResult,
  pollUntilReady,
  generateActionPlan,
};
