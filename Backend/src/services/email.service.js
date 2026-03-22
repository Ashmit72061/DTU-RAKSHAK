import nodemailer from "nodemailer";
import { Resend } from "resend";
import env from "../configs/env.config.js";

// ─────────────────────────────────────────────────────────────────────────────
// Provider implementations
// Each provider exposes a single function:  sendEmail({ to, subject, html })
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SMTP provider — powered by nodemailer.
 * The transporter is created once and reused across requests.
 */
const smtpProvider = (() => {
  const transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure,   // true → TLS (port 465); false → STARTTLS (port 587)
    auth: {
      user: env.smtp.user,
      pass: env.smtp.pass,
    },
  });

  return {
    async sendEmail({ to, subject, html }) {
      await transporter.sendMail({
        from: env.emailFrom,
        to,
        subject,
        html,
      });
    },
  };
})();

/**
 * Resend provider — kept for easy rollback.
 * Set EMAIL_PROVIDER=resend and supply RESEND_API_KEY to activate.
 */
const resendProvider = (() => {
  // Lazily instantiated so the Resend SDK is never touched when SMTP is active.
  let client = null;

  return {
    async sendEmail({ to, subject, html }) {
      if (!client) {
        client = new Resend(env.resendApiKey);
      }

      const { error } = await client.emails.send({
        from: env.emailFrom,
        to,
        subject,
        html,
      });

      if (error) {
        throw new Error(`Resend delivery failed: ${error.message}`);
      }
    },
  };
})();

// ─────────────────────────────────────────────────────────────────────────────
// Provider factory
// Controlled by EMAIL_PROVIDER env var — "smtp" (default) | "resend"
// ─────────────────────────────────────────────────────────────────────────────

const PROVIDERS = {
  smtp: smtpProvider,
  resend: resendProvider,
};

const activeProvider = PROVIDERS[env.emailProvider];

if (!activeProvider) {
  throw new Error(
    `❌ Unknown EMAIL_PROVIDER "${env.emailProvider}". Valid options: ${Object.keys(PROVIDERS).join(", ")}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared email templates
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the OTP email HTML.
 *
 * @param {string} otp
 * @param {"SIGNUP"|"SIGNIN"} type
 * @returns {string} HTML string
 */
const buildOtpHtml = (otp, type) => {
  const content = {
    SIGNUP: {
      heading: "Welcome! Verify your email",
      body: "Use the following OTP to complete your registration.",
    },
    SIGNIN: {
      heading: "Sign-in verification",
      body: "Use the following OTP to sign in to your account.",
    },
    FORGOT_PASSWORD: {
      heading: "Reset your password",
      body: "Use the following OTP to reset your password. If you did not request a password reset, please secure your account immediately.",
    },
  }[type];

  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #1a1a2e; margin-bottom: 16px;">${content.heading}</h2>
      <p style="color: #555; font-size: 15px; line-height: 1.6;">
        ${content.body}
        This code expires in <strong>${env.otpExpiryMinutes} minute${env.otpExpiryMinutes > 1 ? "s" : ""}</strong>.
      </p>
      <div style="background: #f4f4f8; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
        <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #1a1a2e;">${otp}</span>
      </div>
      <p style="color: #999; font-size: 13px;">If you did not request this, please ignore this email.</p>
    </div>
  `;
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API  (identical signature to the old email.service.js — zero breaking changes)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send an OTP email to the specified address.
 *
 * @param {string} to                    - Recipient email address
 * @param {string} otp                   - The OTP code to include
 * @param {"SIGNUP"|"SIGNIN"} type       - Purpose of the OTP (controls subject and copy)
 */
export const sendOtpEmail = async (to, otp, type) => {
  const subject = {
    SIGNUP:           "Verify your email — Signup OTP",
    SIGNIN:           "Sign-in verification — OTP",
    FORGOT_PASSWORD:  "Password reset — OTP",
  }[type];

  if (!subject) {
    throw new Error(`Unknown OTP type: "${type}"`);
  }

  await activeProvider.sendEmail({ to, subject, html: buildOtpHtml(otp, type) });
};