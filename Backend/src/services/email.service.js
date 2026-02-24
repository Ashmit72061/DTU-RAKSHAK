import { Resend } from "resend";
import env from "../configs/env.config.js";

// Single shared Resend instance — SDK handles retries and connection pooling internally.
const resend = new Resend(env.resendApiKey);

/**
 * Send an OTP email to the specified address.
 *
 * @param {string} to                    - Recipient email address
 * @param {string} otp                   - The OTP code to include
 * @param {"SIGNUP"|"SIGNIN"} type       - Purpose of the OTP (controls subject and copy)
 */
export const sendOtpEmail = async (to, otp, type) => {
  const subject =
    type === "SIGNUP"
      ? "Verify your email — Signup OTP"
      : "Sign-in verification — OTP";

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #1a1a2e; margin-bottom: 16px;">
        ${type === "SIGNUP" ? "Welcome! Verify your email" : "Sign-in verification"}
      </h2>
      <p style="color: #555; font-size: 15px; line-height: 1.6;">
        Use the following OTP to ${type === "SIGNUP" ? "complete your registration" : "sign in to your account"}.
        This code expires in <strong>${env.otpExpiryMinutes} minute${env.otpExpiryMinutes > 1 ? "s" : ""}</strong>.
      </p>
      <div style="background: #f4f4f8; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
        <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #1a1a2e;">${otp}</span>
      </div>
      <p style="color: #999; font-size: 13px;">If you did not request this, please ignore this email.</p>
    </div>
  `;

  const { error } = await resend.emails.send({
    from: env.emailFrom,
    to,
    subject,
    html,
  });

  if (error) {
    throw new Error(`Resend delivery failed: ${error.message}`);
  }
};
