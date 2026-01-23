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

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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

// 404 handler
app.use((req, res) => {
  res.sendError("Route not found", 404);
});

// Global error handler (must be last)
app.use(errorHandler);

module.exports = app;
