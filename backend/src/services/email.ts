import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { config } from "../config.js";

// Email transporter singleton
let transporter: Transporter | null = null;

/**
 * Initialize email transporter
 */
function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.secure,
      auth: {
        user: config.email.user,
        pass: config.email.password,
      },
    });
  }
  return transporter;
}

/**
 * Test email connection
 */
export async function testEmailConnection(): Promise<boolean> {
  try {
    const transport = getTransporter();
    await transport.verify();
    return true;
  } catch (error) {
    console.error("Email connection test failed:", error);
    return false;
  }
}

/**
 * Send email verification email
 */
export async function sendVerificationEmail(
  to: string,
  userName: string,
  verificationToken: string,
  userId: string
): Promise<void> {
  const transport = getTransporter();

  // In production, use your actual frontend URL
  const verificationUrl = `${config.corsOrigin}/verify-email?token=${verificationToken}&userId=${userId}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Welcome to ArtisanHub!</h1>
        </div>
        <div class="content">
          <p>Hi ${userName || "there"},</p>
          <p>Thank you for registering with ArtisanHub. Please verify your email address to activate your account.</p>
          <p style="text-align: center;">
            <a href="${verificationUrl}" class="button">Verify Email Address</a>
          </p>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; background: white; padding: 15px; border-left: 4px solid #667eea;">
            ${verificationUrl}
          </p>
          <p>This link will expire in 24 hours.</p>
          <p>If you didn't create an account with ArtisanHub, please ignore this email.</p>
        </div>
        <div class="footer">
          <p>&copy; 2026 ArtisanHub. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textContent = `
    Welcome to ArtisanHub!
    
    Hi ${userName || "there"},
    
    Thank you for registering with ArtisanHub. Please verify your email address to activate your account.
    
    Click the link below to verify your email:
    ${verificationUrl}
    
    This link will expire in 24 hours.
    
    If you didn't create an account with ArtisanHub, please ignore this email.
    
    © 2026 ArtisanHub. All rights reserved.
  `;

  await transport.sendMail({
    from: config.email.from,
    to,
    subject: "Verify your ArtisanHub email address",
    text: textContent,
    html: htmlContent,
  });
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(
  to: string,
  userName: string,
  resetToken: string,
  userId: string
): Promise<void> {
  const transport = getTransporter();

  const resetUrl = `${config.corsOrigin}/reset-password?token=${resetToken}&userId=${userId}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; padding: 12px 30px; background: #f5576c; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Password Reset Request</h1>
        </div>
        <div class="content">
          <p>Hi ${userName || "there"},</p>
          <p>We received a request to reset your ArtisanHub account password.</p>
          <p style="text-align: center;">
            <a href="${resetUrl}" class="button">Reset Password</a>
          </p>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; background: white; padding: 15px; border-left: 4px solid #f5576c;">
            ${resetUrl}
          </p>
          <p>This link will expire in 1 hour.</p>
          <div class="warning">
            <strong>⚠️ Security Notice:</strong> If you didn't request a password reset, please ignore this email and ensure your account is secure. Your password won't be changed unless you click the link above and create a new password.
          </div>
        </div>
        <div class="footer">
          <p>&copy; 2026 ArtisanHub. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textContent = `
    Password Reset Request
    
    Hi ${userName || "there"},
    
    We received a request to reset your ArtisanHub account password.
    
    Click the link below to reset your password:
    ${resetUrl}
    
    This link will expire in 1 hour.
    
    ⚠️ Security Notice: If you didn't request a password reset, please ignore this email and ensure your account is secure. Your password won't be changed unless you click the link above and create a new password.
    
    © 2026 ArtisanHub. All rights reserved.
  `;

  await transport.sendMail({
    from: config.email.from,
    to,
    subject: "Reset your ArtisanHub password",
    text: textContent,
    html: htmlContent,
  });
}

/**
 * Send password changed notification email
 */
export async function sendPasswordChangedEmail(
  to: string,
  userName: string,
  ipAddress?: string
): Promise<void> {
  const transport = getTransporter();

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .info-box { background: white; padding: 15px; border-left: 4px solid #11998e; margin: 20px 0; }
        .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✓ Password Changed Successfully</h1>
        </div>
        <div class="content">
          <p>Hi ${userName || "there"},</p>
          <p>This is a confirmation that your ArtisanHub account password was successfully changed.</p>
          <div class="info-box">
            <strong>Details:</strong><br>
            Time: ${new Date().toLocaleString()}<br>
            ${ipAddress ? `IP Address: ${ipAddress}<br>` : ""}
          </div>
          <div class="warning">
            <strong>⚠️ Didn't change your password?</strong><br>
            If you didn't make this change, your account may be compromised. Please contact our support team immediately.
          </div>
        </div>
        <div class="footer">
          <p>&copy; 2026 ArtisanHub. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textContent = `
    Password Changed Successfully
    
    Hi ${userName || "there"},
    
    This is a confirmation that your ArtisanHub account password was successfully changed.
    
    Details:
    Time: ${new Date().toLocaleString()}
    ${ipAddress ? `IP Address: ${ipAddress}` : ""}
    
    ⚠️ Didn't change your password?
    If you didn't make this change, your account may be compromised. Please contact our support team immediately.
    
    © 2026 ArtisanHub. All rights reserved.
  `;

  await transport.sendMail({
    from: config.email.from,
    to,
    subject: "Your ArtisanHub password was changed",
    text: textContent,
    html: htmlContent,
  });
}

/**
 * Send new device login notification
 */
export async function sendNewDeviceLoginEmail(
  to: string,
  userName: string,
  deviceInfo: {
    deviceName?: string;
    deviceType?: string;
    browser?: string;
    os?: string;
    ipAddress?: string;
  }
): Promise<void> {
  const transport = getTransporter();

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .info-box { background: white; padding: 15px; border-left: 4px solid #667eea; margin: 20px 0; }
        .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔐 New Device Login</h1>
        </div>
        <div class="content">
          <p>Hi ${userName || "there"},</p>
          <p>We detected a login to your ArtisanHub account from a new device.</p>
          <div class="info-box">
            <strong>Device Information:</strong><br>
            ${deviceInfo.deviceName ? `Device: ${deviceInfo.deviceName}<br>` : ""}
            ${deviceInfo.deviceType ? `Type: ${deviceInfo.deviceType}<br>` : ""}
            ${deviceInfo.browser ? `Browser: ${deviceInfo.browser}<br>` : ""}
            ${deviceInfo.os ? `Operating System: ${deviceInfo.os}<br>` : ""}
            ${deviceInfo.ipAddress ? `IP Address: ${deviceInfo.ipAddress}<br>` : ""}
            Time: ${new Date().toLocaleString()}
          </div>
          <div class="warning">
            <strong>⚠️ Wasn't you?</strong><br>
            If you didn't log in from this device, please secure your account immediately by changing your password and reviewing your active sessions.
          </div>
        </div>
        <div class="footer">
          <p>&copy; 2026 ArtisanHub. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textContent = `
    New Device Login
    
    Hi ${userName || "there"},
    
    We detected a login to your ArtisanHub account from a new device.
    
    Device Information:
    ${deviceInfo.deviceName ? `Device: ${deviceInfo.deviceName}` : ""}
    ${deviceInfo.deviceType ? `Type: ${deviceInfo.deviceType}` : ""}
    ${deviceInfo.browser ? `Browser: ${deviceInfo.browser}` : ""}
    ${deviceInfo.os ? `Operating System: ${deviceInfo.os}` : ""}
    ${deviceInfo.ipAddress ? `IP Address: ${deviceInfo.ipAddress}` : ""}
    Time: ${new Date().toLocaleString()}
    
    ⚠️ Wasn't you?
    If you didn't log in from this device, please secure your account immediately by changing your password and reviewing your active sessions.
    
    © 2026 ArtisanHub. All rights reserved.
  `;

  await transport.sendMail({
    from: config.email.from,
    to,
    subject: "New device login to your ArtisanHub account",
    text: textContent,
    html: htmlContent,
  });
}
