// ============================================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================================
// Middleware functions to verify JWT tokens and protect routes
// ============================================================================

const jwt = require("jsonwebtoken");

// Secret key for signing JWT tokens (should be in environment variables in production)
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key_change_in_production";

/**
 * Verify Student JWT Token Middleware
 * Checks if the request has a valid student authentication token
 * Extracts student ID and attaches it to the request object
 */
const verifyStudentToken = (req, res, next) => {
  try {
    // Get the token from Authorization header (format: "Bearer TOKEN")
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        status: "error",
        message: "No authentication token provided. Please log in."
      });
    }

    // Extract token from "Bearer TOKEN" format
    const token = authHeader.substring(7);

    // Verify and decode the JWT token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Check if this is a student token
    if (decoded.role !== "student") {
      return res.status(403).json({
        status: "error",
        message: "Access denied. Student token required."
      });
    }

    // Attach student ID to request for use in route handlers
    req.studentId = decoded.studentId;
    req.email = decoded.email;
    next();
  } catch (err) {
    // Invalid or expired token
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        status: "error",
        message: "Your session has expired. Please log in again."
      });
    }

    return res.status(401).json({
      status: "error",
      message: "Invalid authentication token."
    });
  }
};

/**
 * Verify Admin JWT Token Middleware
 * Checks if the request has a valid admin authentication token
 * Extracts admin ID and attaches it to the request object
 */
const verifyAdminToken = (req, res, next) => {
  try {
    // Get the token from Authorization header (format: "Bearer TOKEN")
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        status: "error",
        message: "No authentication token provided. Please log in."
      });
    }

    // Extract token from "Bearer TOKEN" format
    const token = authHeader.substring(7);

    // Verify and decode the JWT token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Check if this is an admin token
    if (decoded.role !== "admin") {
      return res.status(403).json({
        status: "error",
        message: "Access denied. Admin privileges required."
      });
    }

    // Attach admin info to request for use in route handlers
    req.adminId = decoded.adminId;
    req.email = decoded.email;
    req.adminDepartment = decoded.department;
    next();
  } catch (err) {
    // Invalid or expired token
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        status: "error",
        message: "Your session has expired. Please log in again."
      });
    }

    return res.status(401).json({
      status: "error",
      message: "Invalid authentication token."
    });
  }
};

/**
 * Generate JWT Token for Student
 * Creates a signed token that includes student ID and role
 * @param {string} studentId - MongoDB student ID
 * @param {string} email - Student email
 * @returns {string} - JWT token
 */
const generateStudentToken = (studentId, email) => {
  return jwt.sign(
    {
      studentId: studentId.toString(),
      email: email,
      role: "student"
    },
    JWT_SECRET,
    { expiresIn: "7d" } // Token expires in 7 days
  );
};

/**
 * Generate JWT Token for Admin
 * Creates a signed token that includes admin ID, email, role, and department
 * @param {string} adminId - MongoDB admin ID
 * @param {string} email - Admin email
 * @param {string} department - Admin's assigned department
 * @returns {string} - JWT token
 */
const generateAdminToken = (adminId, email, department) => {
  return jwt.sign(
    {
      adminId: adminId.toString(),
      email: email,
      department: department,
      role: "admin"
    },
    JWT_SECRET,
    { expiresIn: "7d" } // Token expires in 7 days
  );
};

module.exports = {
  verifyStudentToken,
  verifyAdminToken,
  generateStudentToken,
  generateAdminToken,
  JWT_SECRET
};
