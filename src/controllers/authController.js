const User = require("../models/User");
const sendEmail = require("../utils/sendEmail");
const {
  generateOTP,
  generateResetToken,
  getOTPExpiry,
  getResetTokenExpiry,
} = require("../utils/tokenGenerator");
const { getOTPEmailTemplate, getResetPasswordEmailTemplate } = require("../utils/emailTemplates");
const { validateEmail, validatePhone } = require("../middlewares/validateRequest");

// ============== REGISTER ==============

/**
 * Step 1: Register user with email/phone
 * Sends OTP to verify
 */
const register = async (req, res, next) => {
  try {
    const { email, phone, userType, password } = req.body;

    // Check if user already exists
    let existingUser = await User.findOne({
      $or: [
        email ? { email } : null,
        phone ? { phone } : null,
      ].filter(Boolean),
    });

    // If user exists and is already verified, return error
    if (existingUser) {
      // Determine which field matched (email or phone)
      const matchedByEmail = email && existingUser.email === email;
      const matchedByPhone = phone && existingUser.phone === phone;
      const isVerified = matchedByEmail ? existingUser.emailVerified : existingUser.phoneVerified;
      
      if (isVerified) {
        const identifier = email || phone;
        return res.sendError(
          `An account with ${email ? 'this email' : 'this phone number'} (${identifier}) already exists and is verified. Please use the login page instead.`,
          400
        );
      }
      
      // User exists but not verified - resend OTP
      const otp = generateOTP();
      const otpExpiry = getOTPExpiry();

      if (email) {
        existingUser.emailOTP = otp;
        existingUser.emailOTPExpiry = otpExpiry;
        // Update password if provided
        if (password) existingUser.password = password;
      } else if (phone) {
        existingUser.phoneOTP = otp;
        existingUser.phoneOTPExpiry = otpExpiry;
        // Update password if provided
        if (password) existingUser.password = password;
      }

      await existingUser.save();

      // Send OTP email
      if (email) {
        await sendEmail({
          to: email,
          subject: "Email Verification - Cyborg Healthcare",
          html: getOTPEmailTemplate(otp),
        });
      }

      // For phone, log OTP
      if (phone) {
        console.log(`[OTP for ${phone}]: ${otp}`);
      }

      return res.sendSuccess(
        { userId: existingUser._id, email, phone },
        "OTP resent. Please verify your email/phone.",
        200
      );
    }

    // Generate OTP
    const otp = generateOTP();
    const otpExpiry = getOTPExpiry();

    // Create new user (not verified yet)
    const newUser = new User({
      email: email || null,
      phone: phone || null,
      userType,
      password: password || null, // Store password if provided during registration
    });

    // Save OTP and expiry based on login method
    if (email) {
      newUser.emailOTP = otp;
      newUser.emailOTPExpiry = otpExpiry;
    } else if (phone) {
      newUser.phoneOTP = otp;
      newUser.phoneOTPExpiry = otpExpiry;
    }

    await newUser.save();

    // Send OTP email
    if (email) {
      await sendEmail({
        to: email,
        subject: "Email Verification - Cyborg Healthcare",
        html: getOTPEmailTemplate(otp),
      });
    }

    // For phone, log OTP (in production, use SMS gateway)
    if (phone) {
      console.log(`[OTP for ${phone}]: ${otp}`);
    }

    res.sendSuccess(
      { userId: newUser._id, email, phone },
      "Registration initiated. Please verify your email/phone.",
      201
    );
  } catch (error) {
    next(error);
  }
};

// ============== VERIFY EMAIL/PHONE ==============

/**
 * Step 2: Verify OTP sent to email/phone
 */
const verifyOTP = async (req, res, next) => {
  try {
    const { userId, otp, type } = req.body; // type: "email" or "phone"

    if (!["email", "phone"].includes(type)) {
      return res.sendError("Invalid type. Must be 'email' or 'phone'", 400);
    }

    const user = await User.findById(userId).select(
      `${type}OTP ${type}OTPExpiry ${type}`
    );

    if (!user) {
      return res.sendError("User not found", 404);
    }

    const otpField = `${type}OTP`;
    const otpExpiryField = `${type}OTPExpiry`;
    const verifiedField = `${type}Verified`;

    // Check OTP validity
    if (user[otpField] !== otp) {
      return res.sendError("Invalid OTP", 400);
    }

    if (new Date() > user[otpExpiryField]) {
      return res.sendError("OTP has expired", 400);
    }

    // Mark as verified and clear OTP
    user[verifiedField] = true;
    user[otpField] = null;
    user[otpExpiryField] = null;

    await user.save();

    res.sendSuccess(
      { userId: user._id },
      `${type.charAt(0).toUpperCase() + type.slice(1)} verified successfully`
    );
  } catch (error) {
    next(error);
  }
};

// ============== LOGIN ==============

/**
 * Step 3: Login with verified email/phone
 * Send OTP for verification
 */
const login = async (req, res, next) => {
  try {
    const { email, phone } = req.body;

    // Find user
    const user = await User.findOne({
      $or: [{ email: email || null }, { phone: phone || null }],
      isDeleted: false,
    }).select("+password");

    if (!user) {
      return res.sendError("User not found. Please register first.", 404);
    }

    // Check if email/phone is verified
    const type = email ? "email" : "phone";
    const verifiedField = `${type}Verified`;

    if (!user[verifiedField]) {
      // Send new OTP
      const otp = generateOTP();
      const otpExpiry = getOTPExpiry();
      const otpField = `${type}OTP`;
      const otpExpiryField = `${type}OTPExpiry`;

      user[otpField] = otp;
      user[otpExpiryField] = otpExpiry;
      await user.save();

      if (email) {
        await sendEmail({
          to: email,
          subject: "Login Verification - Cyborg Healthcare",
          html: getOTPEmailTemplate(otp, user.firstName || "User"),
        });
      }

      return res.sendSuccess(
        { userId: user._id, type },
        `${type} not verified. OTP sent for verification.`,
        200
      );
    }

    // If password-based login is needed
    if (req.body.password) {
      const isPasswordValid = await user.comparePassword(req.body.password);
      if (!isPasswordValid) {
        return res.sendError("Invalid credentials", 401);
      }

      // Password is valid, generate and return token
      const token = user.generateToken();

      return res.sendSuccess(
        {
          token,
          user: {
            id: user._id,
            email: user.email,
            phone: user.phone,
            firstName: user.firstName,
            lastName: user.lastName,
            userType: user.userType,
            onboardingCompleted: user.onboardingCompleted,
          },
        },
        "Login successful",
        200
      );
    } else {
      // Send OTP for passwordless login
      const otp = generateOTP();
      const otpExpiry = getOTPExpiry();
      const otpField = `${type}OTP`;
      const otpExpiryField = `${type}OTPExpiry`;

      user[otpField] = otp;
      user[otpExpiryField] = otpExpiry;
      await user.save();

      if (email) {
        await sendEmail({
          to: email,
          subject: "Login OTP - Cyborg Healthcare",
          html: getOTPEmailTemplate(otp, user.firstName || "User"),
        });
      }

      return res.sendSuccess(
        { userId: user._id, type },
        "OTP sent for login verification",
        200
      );
    }
  } catch (error) {
    next(error);
  }
};

// ============== VERIFY LOGIN OTP ==============

/**
 * Verify OTP for login
 */
const verifyLoginOTP = async (req, res, next) => {
  try {
    const { userId, otp } = req.body;

    const user = await User.findById(userId).select(
      "+emailOTP +emailOTPExpiry +phoneOTP +phoneOTPExpiry"
    );

    if (!user) {
      return res.sendError("User not found", 404);
    }

    // Check which type of OTP was sent
    let isValid = false;
    if (user.emailOTP === otp && new Date() <= user.emailOTPExpiry) {
      isValid = true;
      user.emailOTP = null;
      user.emailOTPExpiry = null;
    } else if (user.phoneOTP === otp && new Date() <= user.phoneOTPExpiry) {
      isValid = true;
      user.phoneOTP = null;
      user.phoneOTPExpiry = null;
    }

    if (!isValid) {
      return res.sendError("Invalid or expired OTP", 400);
    }

    await user.save();

    // Generate token
    const token = user.generateToken();

    res.sendSuccess(
      {
        token,
        user: {
          id: user._id,
          email: user.email,
          phone: user.phone,
          firstName: user.firstName,
          lastName: user.lastName,
          userType: user.userType,
          onboardingCompleted: user.onboardingCompleted,
        },
      },
      "Login successful",
      200
    );
  } catch (error) {
    next(error);
  }
};

// ============== FORGOT PASSWORD ==============

/**
 * Request password reset with email/phone
 */
const forgotPassword = async (req, res, next) => {
  try {
    const { email, phone } = req.body;

    const user = await User.findOne({
      $or: [{ email: email || null }, { phone: phone || null }],
      isDeleted: false,
    });

    if (!user) {
      return res.sendSuccess(
        null,
        "If account exists, reset link will be sent",
        200
      );
    }

    // Generate reset token
    const resetToken = generateResetToken();
    const resetTokenExpiry = getResetTokenExpiry();

    user.resetToken = resetToken;
    user.resetTokenExpiry = resetTokenExpiry;
    await user.save();

    // Send reset email
    if (email) {
      const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}&userId=${user._id}`;
      await sendEmail({
        to: email,
        subject: "Password Reset - Cyborg Healthcare",
        html: getResetPasswordEmailTemplate(resetLink, user.firstName || "User"),
      });
    }

    res.sendSuccess(
      null,
      "Password reset link sent to your email",
      200
    );
  } catch (error) {
    next(error);
  }
};

// ============== RESET PASSWORD ==============

/**
 * Reset password with token
 */
const resetPassword = async (req, res, next) => {
  try {
    const { userId, resetToken, newPassword } = req.body;

    const user = await User.findById(userId).select("+resetToken +resetTokenExpiry +password");

    if (!user) {
      return res.sendError("User not found", 404);
    }

    // Verify reset token
    if (user.resetToken !== resetToken) {
      return res.sendError("Invalid reset token", 400);
    }

    if (new Date() > user.resetTokenExpiry) {
      return res.sendError("Reset token has expired", 400);
    }

    // Update password
    user.password = newPassword;
    user.resetToken = null;
    user.resetTokenExpiry = null;
    await user.save();

    res.sendSuccess(null, "Password reset successful. Please login with new password.");
  } catch (error) {
    next(error);
  }
};

// ============== RESEND OTP ==============

/**
 * Resend OTP
 */
const resendOTP = async (req, res, next) => {
  try {
    const { userId, type } = req.body; // type: "email" or "phone"

    if (!["email", "phone"].includes(type)) {
      return res.sendError("Invalid type. Must be 'email' or 'phone'", 400);
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.sendError("User not found", 404);
    }

    // Generate new OTP
    const otp = generateOTP();
    const otpExpiry = getOTPExpiry();
    const otpField = `${type}OTP`;
    const otpExpiryField = `${type}OTPExpiry`;

    user[otpField] = otp;
    user[otpExpiryField] = otpExpiry;
    await user.save();

    // Send OTP
    if (type === "email") {
      await sendEmail({
        to: user.email,
        subject: "Verification OTP - Cyborg Healthcare",
        html: getOTPEmailTemplate(otp, user.firstName || "User"),
      });
    }

    res.sendSuccess(
      null,
      `OTP resent to your ${type}`,
      200
    );
  } catch (error) {
    next(error);
  }
};

// ============== SOCIAL LOGIN ==============

/**
 * Google/Facebook/Apple login
 */
const socialLogin = async (req, res, next) => {
  try {
    const { provider, providerId, email, firstName, lastName, userType } = req.body;

    if (!["google", "facebook", "apple"].includes(provider)) {
      return res.sendError("Invalid provider", 400);
    }

    // Find user by provider ID or email
    let user = await User.findOne({
      $or: [
        { [`${provider}Id`]: providerId },
        { email: email || null },
      ],
      isDeleted: false,
    });

    if (!user) {
      // Create new user
      user = new User({
        email,
        firstName,
        lastName,
        userType: userType || "user",
        [`${provider}Id`]: providerId,
        emailVerified: true, // Social login providers verify email
      });
      await user.save();
    } else {
      // Update provider ID if not already set
      if (!user[`${provider}Id`]) {
        user[`${provider}Id`] = providerId;
        await user.save();
      }
    }

    // Generate token
    const token = user.generateToken();

    res.sendSuccess(
      {
        token,
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          userType: user.userType,
          onboardingCompleted: user.onboardingCompleted,
        },
      },
      "Social login successful",
      200
    );
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  verifyOTP,
  login,
  verifyLoginOTP,
  forgotPassword,
  resetPassword,
  resendOTP,
  socialLogin,
};
