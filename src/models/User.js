const mongoose = require("mongoose");
const bcryptjs = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    // Basic Info
    firstName: {
      type: String,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
      sparse: true,
      trim: true,
    },
    phone: {
      type: String,
      sparse: true,
      trim: true,
    },
    password: {
      type: String,
      minlength: 8,
      select: false, // Don't return password by default
    },

    // Account Type
    userType: {
      type: String,
      enum: ["user", "doctor"],
      required: true,
    },

    // Email Verification
    emailVerified: {
      type: Boolean,
      default: false,
    },
    emailOTP: {
      type: String,
      select: false,
    },
    emailOTPExpiry: {
      type: Date,
      select: false,
    },

    // Phone Verification
    phoneVerified: {
      type: Boolean,
      default: false,
    },
    phoneOTP: {
      type: String,
      select: false,
    },
    phoneOTPExpiry: {
      type: Date,
      select: false,
    },

    // Social Login
    googleId: {
      type: String,
      sparse: true,
    },
    facebookId: {
      type: String,
      sparse: true,
    },
    appleId: {
      type: String,
      sparse: true,
    },

    // Password Reset
    resetToken: {
      type: String,
      select: false,
    },
    resetTokenExpiry: {
      type: Date,
      select: false,
    },

    // Onboarding
    whereYouHeardAboutUs: {
      type: String,
      enum: [
        "Social Media",
        "Friend Recommendation",
        "Search Engine",
        "Advertisement",
        "Other",
      ],
    },
    onboardingCompleted: {
      type: Boolean,
      default: false,
    },
    onboardingAnswers: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OnboardingAnswer",
    },

    // Welcome Screen
    hasSeenWelcome: {
      type: Boolean,
      default: false,
    },

    // Blood Report
    bloodReports: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "BloodReport",
      },
    ],

    // Profile
    profilePicture: String,
    bio: String,
    firstName: {
      type: String,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },
    biologicalSex: {
      type: String,
      enum: ["Male", "Female", "Other", "Prefer not to say"],
    },
    dateOfBirth: Date,
    gender: {
      type: String,
      enum: ["Male", "Female", "Other"],
    },
    addressLine1: String,
    addressLine2: String,
    city: String,
    state: String,
    zipCode: String,

    // Status
    isActive: {
      type: Boolean,
      default: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
userSchema.pre("save", async function () {
  if (!this.isModified("password") || !this.password) return;

  const salt = await bcryptjs.genSalt(10);
  this.password = await bcryptjs.hash(this.password, salt);
});

// Method to compare passwords
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcryptjs.compare(enteredPassword, this.password);
};

// Method to generate JWT token
userSchema.methods.generateToken = function () {
  const jwt = require("jsonwebtoken");
  return jwt.sign(
    {
      id: this._id,
      email: this.email,
      phone: this.phone,
      userType: this.userType,
    },
    process.env.JWT_SECRET || "your_secret_key",
    { expiresIn: "7d" }
  );
};

module.exports = mongoose.model("User", userSchema);
