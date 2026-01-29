const express = require("express");
const cors = require("cors");
const path = require("path");
const { responseHandler } = require("./middlewares/responseHandler");
const errorHandler = require("./middlewares/errorHandler");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const actionPlanRoutes = require("./routes/actionPlanRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const chatRoutes = require("./routes/chatRoutes");
const questionnaireRoutes = require("./routes/questionnaireRoutes");
const conciergeRoutes = require("./routes/conciergeRoutes");
const doctorRoutes = require("./routes/doctorRoutes");

const app = express();

// CORS Configuration for file uploads
const corsOptions = {
  origin: true, // Allow all origins (can be restricted later)
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["Content-Type", "Content-Length"],
  optionsSuccessStatus: 200,
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(responseHandler);

// Static files (for uploaded blood reports)
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Routes
app.get("/", (req, res) => {
  res.sendSuccess({ message: "Healthcare API is running" }, "Welcome to Cyborg API");
});

// Auth Routes
app.use("/api/auth", authRoutes);

// User Routes
app.use("/api/users", userRoutes);

// Payment Routes
app.use("/api/payments", paymentRoutes);

// Action Plan Routes
app.use("/api/action-plans", actionPlanRoutes);

// Notification Routes
app.use("/api/notifications", notificationRoutes);

// Chat Routes
app.use("/api/chat", chatRoutes);

// Questionnaire Routes
app.use("/api/questionnaire", questionnaireRoutes);

// Concierge Routes
app.use("/api/concierge", conciergeRoutes);

// Doctor Routes
app.use("/api/doctor", doctorRoutes);

// 404 handler
app.use((req, res) => {
  res.sendError("Route not found", 404);
});

// Global error handler (must be last)
app.use(errorHandler);

module.exports = app;
