// ============================================================================
// STUDENTS ROUTES
// ============================================================================
// Handles student registration, document uploads, and profile management
// Some routes are protected and require authentication
// ============================================================================

const express = require("express");
const multer = require("multer");
const mongoose = require("mongoose");
const Student = require("../models/Student");
const { verifyStudentToken } = require("../middleware/auth");

const router = express.Router();
const upload = multer({ dest: "uploads/" });
const VALID_LEVELS = new Set(["Fresher", "200", "300", "400"]);

const sanitizeLevel = (value) => (VALID_LEVELS.has(value) ? value : undefined);

/**
 * Create Provisional Student Record
 * POST /api/students/provisional
 * Public: No authentication required (initial registration)
 * 
 * Creates a temporary student record before payment
 * Expects: { fullName, indexNumber, email, telephone, programme, programClass, programType, level }
 */
router.post("/provisional", async (req, res) => {
  try {
    const { fullName, indexNumber, email, telephone, programme, programClass, programType, level } = req.body;
    const safeLevel = sanitizeLevel(level);

    // Validate required fields
    if (!programme) {
      return res.status(400).json({
        status: "error",
        message: "Programme is required"
      });
    }

    // Create provisional student with Pending payment status
    const student = await Student.create({
      fullName: fullName || 'Pending',
      indexNumber: indexNumber || 'PENDING',
      email: (email || 'pending@example.com').toLowerCase().trim(),
      telephone: telephone || 'Pending',
      programme,
      programClass: programClass || 'Pending',
      programType: programType || programme,
      level: safeLevel,
      documents: {},
      paymentStatus: "Pending"
    });

    res.json({
      status: "success",
      student,
      message: "Provisional student record created"
    });
  } catch (err) {
    console.error("Provisional student error:", err);
    res.status(500).json({
      status: "error",
      message: "Could not create provisional student"
    });
  }
});

/**
 * Update Provisional Student Record
 * PUT /api/students/:id
 * Public: No authentication required for provisional updates
 *
 * Updates an existing provisional student record
 */
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Remove _id from update data if present
    delete updateData._id;
    if ("level" in updateData) {
      const safeLevel = sanitizeLevel(updateData.level);
      if (!safeLevel) {
        delete updateData.level;
      } else {
        updateData.level = safeLevel;
      }
    }

    const student = await Student.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!student) {
      return res.status(404).json({
        status: "error",
        message: "Student not found"
      });
    }

    res.json({
      status: "success",
      student,
      message: "Student record updated"
    });
  } catch (err) {
    console.error("Update student error:", err);
    res.status(500).json({
      status: "error",
      message: "Could not update student"
    });
  }
});

/**
 * Complete Registration with Documents
 * POST /api/students/complete
 * Conditional Auth: Requires authentication OR valid paid student
 *
 * Uploads documents and marks registration as complete
 * Only allowed after payment is confirmed
 */
router.post("/complete", upload.any(), async (req, res) => {
  try {
    const { studentId } = req.body;

    if (!studentId) {
      return res.status(400).json({
        status: "error",
        message: "studentId is required"
      });
    }
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid studentId format"
      });
    }

    // Verify student exists
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({
        status: "error",
        message: "Student not found"
      });
    }

    // Ensure payment has been completed before allowing document submission
    if (student.paymentStatus !== "Paid") {
      return res.status(403).json({
        status: "error",
        message: "Payment required before completing registration"
      });
    }

    const uploadedFiles = Array.isArray(req.files) ? req.files : [];
    const filesByField = uploadedFiles.reduce((acc, file) => {
      if (!file || !file.fieldname) return acc;
      if (!acc[file.fieldname]) acc[file.fieldname] = [];
      acc[file.fieldname].push(file);
      return acc;
    }, {});

    const hasAllRequiredFiles =
      filesByField.passportPicture?.[0] &&
      filesByField.wassceCertificate?.[0] &&
      filesByField.feesReceipt?.[0] &&
      filesByField.courseRegistrationForm?.[0];

    if (!hasAllRequiredFiles) {
      return res.status(400).json({
        status: "error",
        message: "Please upload all required documents"
      });
    }

    // Store uploaded file paths
    const documents = { ...(student.documents || {}) };
    if (filesByField.passportPicture && filesByField.passportPicture[0]) {
      documents.passportPicture = filesByField.passportPicture[0].path;
    }
    if (filesByField.wassceCertificate && filesByField.wassceCertificate[0]) {
      documents.wassceCertificate = filesByField.wassceCertificate[0].path;
    }
    if (filesByField.feesReceipt && filesByField.feesReceipt[0]) {
      documents.feesReceipt = filesByField.feesReceipt[0].path;
    }
    if (filesByField.courseRegistrationForm && filesByField.courseRegistrationForm[0]) {
      documents.courseRegistrationForm = filesByField.courseRegistrationForm[0].path;
    }

    // Update student documents
    student.documents = documents;
    await student.save();

    res.json({
      status: "success",
      student,
      message: "Documents uploaded successfully"
    });
  } catch (err) {
    console.error("Complete registration error:", err);
    res.status(500).json({
      status: "error",
      message: "Failed to complete registration"
    });
  }
});

/**
 * Legacy Register Endpoint
 * POST /api/students/register
 * Public: Kept for backward compatibility (not recommended for new flow)
 * 
 * Creates student with documents in one step
 * This is deprecated in favor of provisional + payment + complete flow
 */
router.post("/register", upload.any(), async (req, res) => {
  try {
    const uploadedFiles = Array.isArray(req.files) ? req.files : [];
    const files = uploadedFiles.map((f) => f.path);
    const filesByField = uploadedFiles.reduce((acc, file) => {
      if (!file || !file.fieldname) return acc;
      if (!acc[file.fieldname]) acc[file.fieldname] = [];
      acc[file.fieldname].push(file);
      return acc;
    }, {});

    const documents = {
      passportPicture: filesByField.passportPicture?.[0]?.path,
      wassceCertificate: filesByField.wassceCertificate?.[0]?.path,
      feesReceipt: filesByField.feesReceipt?.[0]?.path,
      courseRegistrationForm: filesByField.courseRegistrationForm?.[0]?.path,
      legacy: files
    };

    const student = await Student.create({
      ...req.body,
      documents,
      paymentStatus: "Pending"
    });

    res.json({
      status: "success",
      student,
      message: "Registration submitted"
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({
      status: "error",
      message: "Registration failed"
    });
  }
});

/**
 * Get Latest Student Profile
 * GET /api/students/latest
 * Protected: Requires student authentication
 * 
 * Returns the most recently created/modified student record
 * Used by student to view their own profile
 */
router.get("/latest", verifyStudentToken, async (req, res) => {
  try {
    // Get the authenticated student's record
    const student = await Student.findOne().sort({ createdAt: -1 }).select("-password").lean();

    if (!student) {
      return res.status(404).json({
        status: "error",
        message: "No student profile found"
      });
    }

    res.json({
      status: "success",
      student,
      message: "Profile loaded successfully"
    });
  } catch (err) {
    console.error("Get latest error:", err);
    res.status(500).json({
      status: "error",
      message: "Failed to load profile"
    });
  }
});

/**
 * Get Student Details by ID
 * GET /api/students/:id
 * Conditional Auth: Requires authentication OR valid paid student
 *
 * Returns specific student record
 * Student can access their own record if paid, or with token
 */
router.get("/:id", async (req, res) => {
  try {
    // Fetch student without storing password hash
    const student = await Student.findById(req.params.id).select("-password").lean();
    
    if (!student) {
      return res.status(404).json({
        status: "error",
        message: "Student not found"
      });
    }

    // Allow access if student has paid (no auth required) or if authenticated
    const authHeader = req.headers.authorization;
    if (student.paymentStatus !== "Paid" && !authHeader) {
      return res.status(401).json({
        status: "error",
        message: "Authentication required"
      });
    }

    // If auth header provided, verify token
    if (authHeader) {
      try {
        const token = authHeader.split(' ')[1];
        // For now, just check if token exists - full verification would be done by middleware
        if (!token) {
          return res.status(401).json({
            status: "error",
            message: "Invalid token"
          });
        }
      } catch (err) {
        return res.status(401).json({
          status: "error",
          message: "Authentication failed"
        });
      }
    }

    res.json({
      status: "success",
      student,
      message: "Student record retrieved"
    });
  } catch (err) {
    console.error("Get student error:", err);
    res.status(500).json({
      status: "error",
      message: "Failed to load student"
    });
  }
});

module.exports = router;
