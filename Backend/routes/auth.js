// ============================================================================
// AUTHENTICATION ROUTES
// ============================================================================
// Handles student and admin login/registration endpoints
// Issues JWT tokens upon successful authentication
// ============================================================================

const express = require("express");
const Student = require("../models/Student");
const Admin = require("../models/Admin");
const { generateStudentToken, generateAdminToken } = require("../middleware/auth");

const router = express.Router();

// ============================================================================
// STUDENT AUTHENTICATION
// ============================================================================

/**
 * Student Login/Registration Endpoint
 * POST /api/auth/student
 * 
 * Expects: { email, password, fullName?, indexNumber? }
 * - If student doesn't exist: creates new account (registration)
 * - If student exists: authenticates with password (login)
 * 
 * Returns: { status, token, student }
 */
router.post("/student", async (req, res) => {
  try {
    const { email, password, fullName, indexNumber } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        status: "error",
        message: "Email and password are required"
      });
    }

    // Normalize email to lowercase
    const normalizedEmail = email.toLowerCase().trim();

    // Check if student already exists
    let student = await Student.findOne({ email: normalizedEmail });

    if (student) {
      // Existing student - authenticate with password
      if (!student.password) {
        // Student registered without password - allow password setup
        student.password = password;
        await student.save();
      } else {
        // Compare provided password with stored hashed password
        const isPasswordValid = await student.comparePassword(password);
        if (!isPasswordValid) {
          return res.status(401).json({
            status: "error",
            message: "Invalid email or password"
          });
        }
      }
    } else {
      // New student - only register if fullName and indexNumber are provided
      if (!fullName || !indexNumber) {
        return res.status(404).json({
          status: "error",
          message: "User not found. Please register first."
        });
      }

      student = await Student.create({
        email: normalizedEmail,
        password,
        fullName,
        indexNumber,
        documents: {},
        paymentStatus: "Pending"
      });
    }

    // Generate JWT token for the student
    const token = generateStudentToken(student._id, student.email);

    // Return response without the password hash
    const studentData = student.toObject();
    delete studentData.password;

    return res.json({
      status: "success",
      token,
      student: studentData,
      message: "Authentication successful"
    });
  } catch (err) {
    console.error("Student auth error:", err);
    return res.status(500).json({
      status: "error",
      message: "Authentication failed"
    });
  }
});

// ============================================================================
// ADMIN AUTHENTICATION
// ============================================================================

/**
 * Admin Login Endpoint
 * POST /api/auth/admin
 * 
 * Expects: { email, password }
 * Returns: { status, token, admin }
 */
router.post("/admin", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        status: "error",
        message: "Email and password are required"
      });
    }

    // Find admin by email
    const normalizedEmail = email.toLowerCase().trim();
    const admin = await Admin.findOne({ email: normalizedEmail });

    if (!admin) {
      return res.status(401).json({
        status: "error",
        message: "Admin account not found"
      });
    }

    // Compare provided password with stored hashed password
    const isPasswordValid = await admin.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        status: "error",
        message: "Invalid email or password"
      });
    }

    // Generate JWT token for the admin
    const token = generateAdminToken(admin._id, admin.email, admin.department);

    // Return response without the password hash
    const adminData = admin.toObject();
    delete adminData.password;

    return res.json({
      status: "success",
      token,
      admin: adminData,
      message: "Admin login successful"
    });
  } catch (err) {
    console.error("Admin auth error:", err);
    return res.status(500).json({
      status: "error",
      message: "Authentication failed"
    });
  }
});

/**
 * Admin Registration Endpoint (for initial setup)
 * POST /api/auth/admin/register
 * 
 * Expects: { email, password, name, department }
 * This should be protected or have a setup token in production
 */
router.post("/admin/register", async (req, res) => {
  try {
    const { email, password, name, department } = req.body;

    // Validate required fields
    if (!email || !password || !name || !department) {
      return res.status(400).json({
        status: "error",
        message: "Email, password, name, and department are required"
      });
    }

    // Validate department
    const validDepartments = [
      'Computer Science',
      'Hospitality Management',
      'Food Science',
      'Fashion Design',
      'Business Administration',
      'Accountancy',
      'Marketing',
      'Renewable Energy',
      'Building and Construction',
      'Civil Engineering',
      'Mechanical Engineering',
      'Tourism Management',
      'Graphic Design',
      'Statistics and Mathematics',
      'Liberal Studies'
    ];
    if (!validDepartments.includes(department)) {
      return res.status(400).json({
        status: "error",
        message: `Department must be one of: ${validDepartments.join(', ')}`
      });
    }

    // Check if admin already exists for this department
    const normalizedEmail = email.toLowerCase().trim();
    const existingAdmin = await Admin.findOne({ email: normalizedEmail });

    if (existingAdmin) {
      return res.status(409).json({
        status: "error",
        message: "Admin account with this email already exists"
      });
    }

    // Check if department already has an admin
    const deptAdmin = await Admin.findOne({ department });
    if (deptAdmin) {
      return res.status(409).json({
        status: "error",
        message: `An administrator for ${department} department already exists`
      });
    }

    // Create new admin account
    const admin = await Admin.create({
      email: normalizedEmail,
      password,
      name,
      department
    });

    // Generate JWT token
    const token = generateAdminToken(admin._id, admin.email, admin.department);

    // Return response without the password hash
    const adminData = admin.toObject();
    delete adminData.password;

    return res.json({
      status: "success",
      token,
      admin: adminData,
      message: "Admin account created successfully"
    });
  } catch (err) {
    console.error("Admin registration error:", err);
    return res.status(500).json({
      status: "error",
      message: "Registration failed"
    });
  }
});

module.exports = router;
