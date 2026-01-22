// Email templates

const getOTPEmailTemplate = (otp, userName = "User") => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 20px; border-radius: 8px; }
        .header { color: #333; text-align: center; }
        .otp-box { background-color: #f0f0f0; padding: 20px; text-align: center; border-radius: 5px; margin: 20px 0; }
        .otp-code { font-size: 32px; font-weight: bold; color: #2ecc71; letter-spacing: 2px; }
        .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Cyborg Healthcare</h1>
          <p>Email Verification</p>
        </div>
        <p>Hello ${userName},</p>
        <p>Your One-Time Password (OTP) for email verification is:</p>
        <div class="otp-box">
          <div class="otp-code">${otp}</div>
        </div>
        <p>This OTP is valid for 5 minutes. Do not share this with anyone.</p>
        <div class="footer">
          <p>© 2025 Cyborg Healthcare. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

const getResetPasswordEmailTemplate = (resetLink, userName = "User") => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 20px; border-radius: 8px; }
        .header { color: #333; text-align: center; }
        .button { display: inline-block; padding: 12px 30px; background-color: #2ecc71; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Cyborg Healthcare</h1>
          <p>Password Reset Request</p>
        </div>
        <p>Hello ${userName},</p>
        <p>We received a request to reset your password. Click the button below to proceed:</p>
        <a href="${resetLink}" class="button">Reset Password</a>
        <p>This link is valid for 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
        <div class="footer">
          <p>© 2025 Cyborg Healthcare. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

module.exports = {
  getOTPEmailTemplate,
  getResetPasswordEmailTemplate,
};
