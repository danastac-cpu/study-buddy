"use client"
import { generateUpdateEmail } from './emailTemplate';
 
/**
 * Mock email service for StudyBuddy demo.
 * In production, this would use an API like Resend, SendGrid, or AWS SES.
 */
export const emailService = {
  sendNotificationEmail: async (toEmail: string, userName: string, bodyHe: string, bodyEn: string) => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const subject = "StudyBuddy 💜 עדכון חדש! • New Update!";
    const link = "https://study-buddy.vercel.app/dashboard";
    const html = generateUpdateEmail(userName, bodyHe, bodyEn, link);
    
    console.log(`%c[STUDYBUDDY EMAIL SERVICE] %cSent to: ${toEmail}`, "color: #8A63D2; font-weight: bold", "color: #333");
    console.log(`%cSubject: ${subject}`, "font-weight: bold");
    console.log(`%cHTML Content Generated (Lilac Theme Applied)`, "color: #666");
 
    return { success: true, messageId: `msg_${Math.random().toString(36).substr(2, 9)}`, html };
  }
};
