// ============================================================================
// ADMIN ROUTES
// ============================================================================
// Protected routes for admin dashboard functionality
// Requires admin authentication via JWT token
// ============================================================================

const express = require("express");
const multer = require("multer");
const mongoose = require("mongoose");
const Student = require("../models/Student");
const { verifyAdminToken } = require("../middleware/auth");

const router = express.Router();
const upload = multer({ dest: "uploads/" });

/**
 * Get Registration Statistics
 * GET /api/admin/stats
 * Protected: Requires admin authentication
 * 
 * Returns: { total: number, paid: number } for admin's department only
 */
router.get("/stats", verifyAdminToken, async (req, res) => {
  try {
    // Count total students in admin's department
    const total = await Student.countDocuments({ programme: req.adminDepartment });
    
    // Count students in admin's department who have paid
    const paid = await Student.countDocuments({ 
      programme: req.adminDepartment,
      paymentStatus: "Paid" 
    });

    res.json({
      status: "success",
      stats: { total, paid }
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: "Failed to fetch statistics"
    });
  }
});

/**
 * Get All Students
 * GET /api/admin/students
 * Protected: Requires admin authentication
 * 
 * Returns: Array of all student records in admin's department
 */
router.get("/students", verifyAdminToken, async (req, res) => {
  try {
    // Fetch students from admin's department only
    const students = await Student.find({ programme: req.adminDepartment }).select("-password");

    res.json({
      status: "success",
      students,
      count: students.length,
      department: req.adminDepartment
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: "Failed to fetch students"
    });
  }
});

/**
 * Get Student Details by ID
 * GET /api/admin/students/:id
 * Protected: Requires admin authentication
 * 
 * Returns: Single student record (only if in admin's department)
 */
router.get("/students/:id", verifyAdminToken, async (req, res) => {
  try {
    // Fetch student and verify they belong to admin's department
    const student = await Student.findById(req.params.id).select("-password");

    if (!student) {
      return res.status(404).json({
        status: "error",
        message: "Student not found"
      });
    }

    // Check if student belongs to admin's department
    if (student.programme !== req.adminDepartment) {
      return res.status(403).json({
        status: "error",
        message: "Access denied. You can only view students from your department."
      });
    }

    res.json({
      status: "success",
      student
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: "Failed to fetch student"
    });
  }
});

/**
 * Upload Student Result Slip
 * POST /api/admin/students/:id/result-slip
 * Protected: Requires admin authentication
 *
 * Uploads or replaces a student's result slip for admin's department only.
 */
router.post("/students/:id/result-slip", verifyAdminToken, upload.single("resultSlip"), async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid student ID"
      });
    }

    if (!req.file) {
      return res.status(400).json({
        status: "error",
        message: "Result slip file is required"
      });
    }

    const student = await Student.findById(id);
    if (!student) {
      return res.status(404).json({
        status: "error",
        message: "Student not found"
      });
    }

    if (student.programme !== req.adminDepartment) {
      return res.status(403).json({
        status: "error",
        message: "Access denied. You can only update students from your department."
      });
    }

    student.documents = {
      ...(student.documents || {}),
      resultSlip: req.file.path
    };

    await student.save();

    return res.json({
      status: "success",
      message: "Result slip uploaded successfully",
      student
    });
  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: "Failed to upload result slip"
    });
  }
});

module.exports = router;
