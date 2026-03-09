// ============================================================================
// STUDENT MODEL
// ============================================================================
// Defines the structure for student users and their registration data
// Stores student information, payment status, documents, and authentication
// ============================================================================

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const StudentSchema = new mongoose.Schema({
  // Student's full name
  fullName: String,

  // University index number (unique identifier)
  indexNumber: String,

  // Student email used for login and communication
  email: { type: String, lowercase: true },

  // Student telephone number
  telephone: String,

  // Hashed password for student login (optional - can register without it initially)
  password: { type: String },

  // Academic programme (e.g., Computer Science, Hospitality)
  programme: String,

  // Class level (e.g., Diploma, BTech, HND)
  programClass: String,

  // Student level for pricing: Fresher, 200, 300, 400
  level: { type: String, enum: ['Fresher', '200', '300', '400'] },

  // Combined programme and class information
  programType: String,

  // Uploaded document file paths (object with specific fields)
  documents: {
    passportPicture: String,
    wassceCertificate: String,
    feesReceipt: String,
    courseRegistrationForm: String,
    resultSlip: String
  },

  // Payment status: "Pending" or "Paid"
  paymentStatus: { type: String, default: "Pending" },

  // Payment reference from Paystack for receipt verification
  paymentReference: String,

  // Actual amount paid in GHS
  paymentAmount: { type: Number, default: 0 },

  // Timestamp when student record was created
  createdAt: { type: Date, default: Date.now }
});

// Middleware: Hash password before saving if password is modified or new
StudentSchema.pre("save", async function(next) {
  // Only hash if password has been set or modified
  if (!this.isModified("password")) return next();
  
  // Skip if password is empty/undefined
  if (!this.password) return next();
  
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
// Returns: boolean - true if passwords match, false otherwise
StudentSchema.methods.comparePassword = async function(plainPassword) {
  return await bcrypt.compare(plainPassword, this.password);
};

module.exports = mongoose.model("Student", StudentSchema);
