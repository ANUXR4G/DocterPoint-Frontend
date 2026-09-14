import nodemailer from "nodemailer";
import { settings } from "../config/index.js";

export async function sendEmail(
  recipient: string,
  subject: string,
  body: string,
): Promise<void> {
  const senderEmail = settings.ownerEmail;
  const transporter = nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort,
    secure: false,
    auth: {
      user: senderEmail,
      pass: settings.smtpPassword,
    },
  });

  try {
    await transporter.sendMail({
      from: senderEmail,
      to: recipient,
      subject,
      text: body,
    });
  } catch (error) {
    console.error(`failed to send email: ${String(error)}`);
    throw error;
  }
}
