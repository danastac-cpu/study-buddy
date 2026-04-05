"use client"

/**
 * Mock email service for StudyBuddy demo.
 * In production, this would use an API like Resend, SendGrid, or AWS SES.
 */
export const emailService = {
  sendNotificationEmail: async (toEmail: string, subject: string, bodyHe: string, bodyEn: string) => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const timestamp = new Date().toLocaleTimeString();
    
    console.log(`%c[STUDYBUDDY EMAIL SERVICE] %cSent to: ${toEmail}`, "color: #8A63D2; font-weight: bold", "color: #333");
    console.log(`%cSubject: ${subject}`, "font-weight: bold");
    console.log(`%cBody (He): %c${bodyHe}`, "color: #666", "color: #000");
    console.log(`%cBody (En): %c${bodyEn}`, "color: #666", "color: #000");
    console.log(`%cTime: ${timestamp}`, "color: #999; font-size: 0.8rem");

    // We can also trigger a toast in the UI from here if needed, 
    // but for now we'll return a status.
    return { success: true, messageId: `msg_${Math.random().toString(36).substr(2, 9)}` };
  }
};
