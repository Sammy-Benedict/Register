// ============================================================================
// ADMIN MODEL
// ============================================================================
// Defines the structure for admin users in the system
// Stores admin credentials for authentication
// ============================================================================

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// Admin schema definition
const AdminSchema = new mongoose.Schema({
  // Admin's display name
  name: { type: String, required: true },
  
  // Unique email used for login
  email: { type: String, required: true, unique: true, lowercase: true },
  
  // Department assigned to this admin (one admin per department)
  department: { 
    type: String, 
    required: true, 
    unique: true,
    enum: [
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
    ]
  },
  
  // Hashed password (never stored in plain text)
  password: { type: String, required: true },
  
  // Timestamp when admin account was created
  createdAt: { type: Date, default: Date.now }
});

// Middleware: Hash password before saving to database
AdminSchema.pre("save", async function(next) {
  // Only hash if password has been modified
  if (!this.isModified("password")) return next();
  
  try {
    // Generate salt and hash password
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Method: Compare provided password with stored hashed password
AdminSchema.methods.comparePassword = async function(plainPassword) {
  return await bcrypt.compare(plainPassword, this.password);
};

module.exports = mongoose.model("Admin", AdminSchema);
