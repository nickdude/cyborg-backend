const crypto = require("crypto");
const User = require("../models/User");
const Notification = require("../models/Notification");
const sendEmail = require("../utils/sendEmail");
const {
  generateOTP,
  generateResetToken,
  getOTPExpiry,
  getResetTokenExpiry,
} = require("../utils/tokenGenerator");
const { getOTPEmailTemplate, getResetPasswordEmailTemplate } = require("../utils/emailTemplates");
const { validateEmail, validatePhone } = require("../middlewares/validateRequest");

/**
 * Generate a unique doctor referral code (e.g. DR-A7X9K2)
 */
const generateReferralCode = async () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/1/O/0 to avoid confusion
  let code;
  let exists = true;
  while (exists) {
    const random = crypto.randomBytes(4).toString("hex").slice(0, 6);
    code = "DR-" + Array.from(random).map((c) => chars[parseInt(c, 16) % chars.length]).join("");
    exists = await User.findOne({ referralCode: code });
  }
  return code;
};

// ============== REGISTER ==============

/**
 * Step 1: Register user with email/phone
 * Sends OTP to verify
 */
const register = async (req, res, next) => {
  try {
    // userType is validated to "user"|"doctor" by validateAuthRequest. Doctor
    // self-registration is intentionally open — a doctor's data access is
    // SCOPED to patients LINKED to them (a patient links via the doctor's DR-
    // referral code, which sets the patient's linkedDoctor). A newly registered
    // doctor can therefore see nobody until a patient links to them. The scoping
    // is enforced in getAllUsers, doctorController (listPatients/getPatient/
    // verifyDoctorOwnership) and the checkOwnership middleware.
    const { email, phone, userType, password, referralCode } = req.body;

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

      if (phone && process.env.NODE_ENV !== "production") {
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

    // If patient provided a referral code, validate the doctor exists
    let linkedDoctorId = null;
    if (referralCode && userType === "user") {
      const doctor = await User.findOne({
        referralCode: referralCode.toUpperCase(),
        userType: "doctor",
      });
      if (!doctor) {
        return res.sendError("Invalid doctor referral code", 400);
      }
      linkedDoctorId = doctor._id;
    }

    // Create new user (not verified yet)
    const newUser = new User({
      email: email || null,
      phone: phone || null,
      userType,
      password: password || null,
      linkedDoctor: linkedDoctorId,
    });

    // Generate referral code for doctors
    if (userType === "doctor") {
      newUser.referralCode = await generateReferralCode();
    }

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

    if (phone && process.env.NODE_ENV !== "production") {
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

    // Fetch the full user doc — we need token-relevant fields in the response.
    // OTP/expiry fields are `select: false` in the schema, so pull them in explicitly.
    const user = await User.findById(userId).select(
      "+emailOTP +emailOTPExpiry +phoneOTP +phoneOTPExpiry"
    );

    if (!user) {
      return res.sendError("User not found", 404);
    }

    const otpField = `${type}OTP`;
    const otpExpiryField = `${type}OTPExpiry`;
    const verifiedField = `${type}Verified`;

    // Check OTP validity. Reject a missing submitted OTP or an unset stored
    // OTP: a channel the user never registered with has these fields undefined
    // (select:false, no default), and `undefined !== undefined` would otherwise
    // pass here — and `new Date() > undefined` (NaN) would pass the expiry check
    // — letting an attacker verify + get a token by simply omitting `otp`.
    if (!otp || user[otpField] == null || user[otpField] !== otp) {
      return res.sendError("Invalid OTP", 400);
    }

    if (user[otpExpiryField] == null || new Date() > user[otpExpiryField]) {
      return res.sendError("OTP has expired", 400);
    }

    // Mark as verified and clear OTP
    user[verifiedField] = true;
    user[otpField] = null;
    user[otpExpiryField] = null;

    await user.save();

    // Notify linked doctor that a new patient registered via their referral
    if (user.linkedDoctor) {
      Notification.create({
        userId: user.linkedDoctor,
        type: "patient:registered",
        metadata: {
          patientId: user._id,
          patientEmail: user.email || user.phone,
          patientName: user.firstName || user.email || user.phone,
        },
      }).catch((err) => console.error("[Auth] Failed to notify doctor:", err.message));
    }

    // OTP proves ownership — issue the session token so the registration flow
    // lands the user directly signed-in (no extra login round-trip).
    const token = user.generateToken();

    const Subscription = require("../models/Subscription");
    const activeSubscription = await Subscription.findOne({
      userId: user._id,
      status: "active",
      expiryDate: { $gt: new Date() },
    });

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
          whereYouHeardAboutUs: user.whereYouHeardAboutUs,
          hasSeenWelcome: user.hasSeenWelcome,
          hasActiveSubscription: !!activeSubscription,
          latestReportReady:
            !!user.latestReportReady ||
            (Array.isArray(user.bloodReports) && user.bloodReports.length > 0),
        },
      },
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

    // Build dynamic $or query - only include provided fields
    const orConditions = [];
    if (email) orConditions.push({ email });
    if (phone) orConditions.push({ phone });

    if (orConditions.length === 0) {
      return res.sendError("Email or phone is required", 400);
    }

    // Find user
    const user = await User.findOne({
      $or: orConditions,
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

      // Check for active subscription
      const Subscription = require("../models/Subscription");
      const activeSubscription = await Subscription.findOne({
        userId: user._id,
        status: "active",
        expiryDate: { $gt: new Date() },
      });

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
            whereYouHeardAboutUs: user.whereYouHeardAboutUs,
            hasSeenWelcome: user.hasSeenWelcome,
            hasActiveSubscription: !!activeSubscription,
            latestReportReady:
            !!user.latestReportReady ||
            (Array.isArray(user.bloodReports) && user.bloodReports.length > 0),
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

    // Check for active subscription
    const Subscription = require("../models/Subscription");
    const activeSubscription = await Subscription.findOne({
      userId: user._id,
      status: "active",
      expiryDate: { $gt: new Date() },
    });

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
          whereYouHeardAboutUs: user.whereYouHeardAboutUs,
          hasSeenWelcome: user.hasSeenWelcome,
          hasActiveSubscription: !!activeSubscription,
          latestReportReady:
            !!user.latestReportReady ||
            (Array.isArray(user.bloodReports) && user.bloodReports.length > 0),
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

    // Build the lookup from ONLY the identifier(s) actually supplied. A previous
    // version used `{ $or: [{ email: email || null }, { phone: phone || null }] }`,
    // which — when only email was sent — matched the first account whose phone is
    // null, letting a reset land on (and take over) an arbitrary user's account.
    const orConditions = [];
    if (email) orConditions.push({ email });
    if (phone) orConditions.push({ phone });

    if (orConditions.length === 0) {
      return res.sendError("Email or phone is required", 400);
    }

    const user = await User.findOne({
      $or: orConditions,
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

    if (!newPassword) {
      return res.sendError("New password is required", 400);
    }

    const user = await User.findById(userId).select("+resetToken +resetTokenExpiry +password");

    if (!user) {
      return res.sendError("User not found", 404);
    }

    // Verify reset token. Reject a missing submitted token or an unset stored
    // token: a user who never requested a reset has resetToken undefined, and
    // `undefined !== undefined` would otherwise pass here — and `new Date() >
    // undefined` (NaN) would pass the expiry check — letting an attacker set a
    // new password by simply omitting `resetToken`.
    if (!resetToken || user.resetToken == null || user.resetToken !== resetToken) {
      return res.sendError("Invalid reset token", 400);
    }

    if (user.resetTokenExpiry == null || new Date() > user.resetTokenExpiry) {
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
 * Verify a Google OAuth access token server-side and return the trusted profile.
 *
 * The client must NEVER be trusted to state its own email/providerId — doing so
 * lets anyone log in as any user simply by sending that user's email. We call
 * Google's tokeninfo endpoint, which validates the token and returns the real
 * `sub` (stable provider id) and `email`. When GOOGLE_CLIENT_ID is configured we
 * also confirm the token was minted for THIS app (aud/azp) to block a token
 * lifted from another Google application.
 */
async function verifyGoogleAccessToken(accessToken) {
  const resp = await fetch(
    `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(
      accessToken
    )}`
  );
  if (!resp.ok) throw new Error("Google token is invalid or expired");
  const info = await resp.json();

  const expectedAud = process.env.GOOGLE_CLIENT_ID;
  if (expectedAud && info.aud !== expectedAud && info.azp !== expectedAud) {
    throw new Error("Google token was not issued for this application");
  }

  const emailVerified =
    info.email_verified === true || info.email_verified === "true";
  if (!info.email || !emailVerified) {
    throw new Error("Google account has no verified email");
  }

  return { email: String(info.email).toLowerCase(), providerId: info.sub };
}

/**
 * Google login. The client sends the Google OAuth access token; we verify it
 * with Google and derive the identity from the verified token only — never from
 * client-supplied email/providerId/userType. New accounts are always created as
 * regular users, so social login can never mint a doctor account (doctors are
 * provisioned through a separate vetted flow).
 */
const socialLogin = async (req, res, next) => {
  try {
    const { provider, accessToken, firstName, lastName } = req.body;

    if (provider !== "google") {
      return res.sendError("Unsupported social login provider", 400);
    }
    if (!accessToken) {
      return res.sendError("Missing Google access token", 400);
    }

    let verified;
    try {
      verified = await verifyGoogleAccessToken(accessToken);
    } catch (err) {
      console.error("[Auth] Google verification failed:", err.message);
      return res.sendError("Google sign-in could not be verified", 401);
    }
    const { email, providerId } = verified;

    // Match by the verified Google id first, then by the verified email.
    let user = await User.findOne({
      $or: [{ googleId: providerId }, { email }],
      isDeleted: false,
    });

    if (!user) {
      user = new User({
        email,
        firstName,
        lastName,
        userType: "user", // never trust the client to request a doctor account
        googleId: providerId,
        emailVerified: true, // Google verified the email for us
      });
      await user.save();
    } else if (!user.googleId) {
      user.googleId = providerId;
      await user.save();
    }

    // Generate token
    const token = user.generateToken();

    // Active-plan check (status active + not expired) so navigation can skip the
    // Membership page for social-login users exactly like the email flows do.
    const Subscription = require("../models/Subscription");
    const activeSubscription = await Subscription.findOne({
      userId: user._id,
      status: "active",
      expiryDate: { $gt: new Date() },
    });

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
          dateOfBirth: user.dateOfBirth,
          zipCode: user.zipCode,
          onboardingCompleted: user.onboardingCompleted,
          whereYouHeardAboutUs: user.whereYouHeardAboutUs,
          hasSeenWelcome: user.hasSeenWelcome,
          hasActiveSubscription: !!activeSubscription,
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
