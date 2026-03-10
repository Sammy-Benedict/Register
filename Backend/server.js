// ============================================================================
// CS PORTAL - BACKEND SERVER
// ============================================================================
// Main Express server for student registration management, document handling,
// and payment processing via Paystack.
// ============================================================================

// Load environment variables from .env file
require("dotenv").config();

// Import required modules
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

// Initialize Express application
const app = express();

// ============================================================================
// CONFIGURATION & DEBUGGING
// ============================================================================

// Display configured Paystack secret (masked for security) for debugging
const mask = (s) => (s ? `***${String(s).slice(-4)}` : '<none>');
console.log("PAYSTACK_SECRET env:", mask(process.env.PAYSTACK_SECRET));

// Parse allowed origins from environment variables for CORS configuration
const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// ============================================================================
// MIDDLEWARE - CORS (Cross-Origin Resource Sharing)
// ============================================================================
// Configure CORS to allow requests from specified frontend origins
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without origin (like mobile apps or curl)
      if (!origin || origin === "null") {
        return callback(null, true);
      }
      // Allow requests from configured origins or any origin if none specified
      if (!allowedOrigins.length || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, true);
    }
  })
);

// ============================================================================
// MIDDLEWARE - REQUEST PARSING & STATIC FILES
// ============================================================================

// Special middleware for payment webhook - store raw request body for signature verification
app.use("/api/payment/webhook", express.raw({ type: "application/json" }));

// Parse incoming JSON requests
app.use(express.json());

// Serve uploaded files (documents) as static content
app.use("/uploads", express.static("uploads"));

// ============================================================================
// DATABASE CONNECTION
// ============================================================================

// Connect to MongoDB database
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"));

// ============================================================================
// API ROUTES
// ============================================================================

// Authentication routes - student and admin login/registration
app.use("/api/auth", require("./routes/auth"));

// Student management routes - create, read, update student records
app.use("/api/students", require("./routes/students"));

// Payment routes - initialize and verify Paystack transactions
app.use("/api/payment", require("./routes/payment"));

// Admin routes - administrative dashboard and reports
app.use("/api/admin", require("./routes/admin"));

// Error handler: return JSON for multer and unexpected server errors.
app.use((err, req, res, next) => {
  if (!err) return next();
  console.error("Unhandled server error:", err);

  if (err.name === "MulterError") {
    return res.status(400).json({
      status: "error",
      message: `Upload error: ${err.message}`
    });
  }

  return res.status(err.status || 500).json({
    status: "error",
    message: err.message || "Internal server error"
  });
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

// Start the Express server on pconst PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

