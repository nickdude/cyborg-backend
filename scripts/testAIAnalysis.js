/**
 * Test script to verify blood report AI analysis flow
 * 
 * This script tests the end-to-end flow:
 * 1. User uploads blood report
 * 2. System fetches questionnaire, onboarding answers
 * 3. Mock AI analyzes the data
 * 4. Results are stored and can be retrieved
 */

const mongoose = require("mongoose");
const { prepareAIAnalysisData, analyzeBloodReport } = require("../src/utils/bloodReportAI");

// Mock data for testing
const TEST_USER_ID = "60d5ec49f1b2c72b8c8e4567"; // Replace with actual user ID
const TEST_BLOOD_REPORT_ID = "60d5ec49f1b2c72b8c8e4568"; // Replace with actual report ID

async function testAIAnalysisFlow() {
  try {
    console.log("\n=== Testing Blood Report AI Analysis Flow ===\n");

    // Step 1: Prepare data
    console.log("Step 1: Preparing data for AI analysis...");
    const analysisData = await prepareAIAnalysisData(TEST_USER_ID, TEST_BLOOD_REPORT_ID);
    
    console.log("✓ Data prepared successfully:");
    console.log(`  - Questionnaire ID: ${analysisData.questionnaireId}`);
    console.log(`  - User ID: ${analysisData.userId}`);
    console.log(`  - Blood Report ID: ${analysisData.bloodReportId}`);
    console.log(`  - Onboarding Answers Count: ${Object.keys(analysisData.onboardingAnswers).length}`);

    // Step 2: Call AI analysis
    console.log("\nStep 2: Calling mock AI analysis...");
    const aiResponse = await analyzeBloodReport(analysisData);
    
    console.log("✓ AI analysis completed:");
    console.log(`  - Success: ${aiResponse.success}`);
    console.log(`  - Confidence: ${aiResponse.aiMetadata.confidence}`);
    console.log(`  - Key Findings: ${aiResponse.insights.keyFindings.length}`);
    console.log(`  - Recommendations: ${aiResponse.insights.personalizedRecommendations.length}`);

    // Step 3: Display sample findings
    console.log("\nStep 3: Sample AI insights:");
    console.log(`\nOverview: ${aiResponse.insights.overview}`);
    
    console.log("\nKey Findings:");
    aiResponse.insights.keyFindings.forEach((finding, i) => {
      console.log(`  ${i + 1}. ${finding.category} - Status: ${finding.status}`);
      console.log(`     ${finding.description}`);
    });

    console.log("\n=== Test Completed Successfully ===\n");
    
  } catch (error) {
    console.error("\n✗ Test failed:", error.message);
    console.error(error.stack);
  }
}

// Export for use in other scripts
module.exports = testAIAnalysisFlow;

// Run if executed directly
if (require.main === module) {
  const connectDB = require("../src/config/db");
  
  connectDB()
    .then(() => testAIAnalysisFlow())
    .then(() => {
      console.log("Exiting...");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Error:", err);
      process.exit(1);
    });
}
