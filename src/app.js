const express = require("express");
const cors = require("cors");
const path = require("path");
const { responseHandler } = require("./middlewares/responseHandler");
const errorHandler = require("./middlewares/errorHandler");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const mealRoutes = require("./routes/mealRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const questionnaireRoutes = require("./routes/questionnaireRoutes");
const chatRoutes = require("./routes/chatRoutes");
const doctorRoutes = require("./routes/doctorRoutes");
const goalRoutes = require("./routes/goalRoutes");
const agentRoutes = require("./routes/agentRoutes");

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

// User Routes (includes blood report endpoints)
app.use("/api/users", userRoutes);
app.use("/api/users", mealRoutes);

// Payment Routes
app.use("/api/payments", paymentRoutes);

// Notification Routes
app.use("/api/notifications", notificationRoutes);

// Questionnaire Routes
app.use("/api/questionnaire", questionnaireRoutes);

// Chat Routes (agentic AI with SSE streaming)
app.use("/api/chats", chatRoutes);

// Doctor Routes (clinical AI assistant)
app.use("/api/doctor", doctorRoutes);

// Goal Routes
app.use("/api/goals", goalRoutes);

// Agent Routes (server-to-server)
app.use("/api/agent", agentRoutes);

// 404 handler
app.use((req, res) => {
  res.sendError("Route not found", 404);
});

// Global error handler (must be last)
app.use(errorHandler);

module.exports = app;
