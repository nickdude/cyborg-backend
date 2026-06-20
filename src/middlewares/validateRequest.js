// Request validation middleware

const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
};

const validatePhone = (phone) => {
  const re = /^[0-9]{10}$/;
  return re.test(String(phone).replace(/\D/g, ""));
};

const validatePassword = (password) => {
  // At least 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
  const re = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  return re.test(password);
};

// Validate register/login request
const validateAuthRequest = (req, res, next) => {
  const { email, phone, password, userType } = req.body;

  if (!email && !phone) {
    return res.sendError("Email or phone is required", 400, {
      fields: ["email", "phone"],
    });
  }

  if (email && !validateEmail(email)) {
    return res.sendError("Invalid email format", 400, { fields: ["email"] });
  }

  if (phone && !validatePhone(phone)) {
    return res.sendError("Invalid phone format (10 digits required)", 400, {
      fields: ["phone"],
    });
  }

  if (password && !validatePassword(password)) {
    return res.sendError(
      "Password must be at least 8 chars with uppercase, lowercase, number, and special character",
      400,
      { fields: ["password"] }
    );
  }

  if (!["user", "doctor"].includes(userType)) {
    return res.sendError("userType must be 'user' or 'doctor'", 400, {
      fields: ["userType"],
    });
  }

  next();
};

module.exports = {
  validateEmail,
  validatePhone,
  validatePassword,
  validateAuthRequest,
};
