const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
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
const actionPlanRoutes = require("./routes/actionPlanRoutes");

const app = express();

// CORS: allowlist from env (comma-separated). In dev, falls back to reflecting
// any origin so local tooling + mobile emulators work. In production, FRONTEND_ORIGINS
// must be set explicitly.
const allowedOrigins = (process.env.FRONTEND_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const isProd = process.env.NODE_ENV === "production";

if (isProd && allowedOrigins.length === 0) {
  throw new Error("FRONTEND_ORIGINS must be set in production");
}

const corsOptions = {
  origin: (origin, cb) => {
    // Allow non-browser requests (curl, server-to-server) which have no Origin
    if (!origin) return cb(null, true);
    if (!isProd && allowedOrigins.length === 0) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["Content-Type", "Content-Length"],
  optionsSuccessStatus: 200,
};

// Middleware
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ limit: "2mb", extended: true }));
app.use((req, res, next) => {
  if (req.body) mongoSanitize.sanitize(req.body);
  if (req.params) mongoSanitize.sanitize(req.params);
  next();
});
app.use(responseHandler);

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

// Action Plan Routes
app.use("/api/action-plans", actionPlanRoutes);

// 404 handler
app.use((req, res) => {
  res.sendError("Route not found", 404);
});

// Global error handler (must be last)
app.use(errorHandler);

module.exports = app;
