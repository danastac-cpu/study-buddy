export const generateUpdateEmail = (userName: string, updateHe: string, updateEn: string, link: string) => `
<!DOCTYPE html>
<html>
<head>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Outfit', sans-serif; background-color: #F8F7FA; margin: 0; padding: 20px; color: #2D2A32; }
        .card { background: white; max-width: 600px; margin: 0 auto; border-radius: 24px; overflow: hidden; box-shadow: 0 8px 32px rgba(138, 99, 210, 0.1); border: 1px solid rgba(138, 99, 210, 0.1); }
        .header { background: linear-gradient(135deg, #8A63D2, #A384DF); padding: 40px 20px; text-align: center; color: white; }
        .logo { font-size: 2.5rem; font-weight: 800; margin-bottom: 10px; }
        .content { padding: 40px; text-align: center; line-height: 1.6; }
        .update-box { background: #f3eafd; padding: 20px; border-radius: 16px; margin: 20px 0; border: 1px dashed #8A63D2; color: #8A63D2; font-weight: 600; }
        .footer { padding: 20px; font-size: 0.8rem; color: #6B6871; text-align: center; }
        .btn { display: inline-block; padding: 12px 32px; background: #8A63D2; color: white; text-decoration: none; border-radius: 12px; font-weight: 600; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="card">
        <div class="header">
            <div class="logo">StudyBuddy 💜</div>
            <div style="font-size: 1.1rem; opacity: 0.9;">יש לך עדכון חדש! • New Update for you!</div>
        </div>
        <div class="content">
            <h2 style="margin: 0; color: #8A63D2;">היי ${userName}!</h2>
            <p>רצינו לעדכן אותך שקרה משהו חדש באתר שקשור אליך:</p>
            
            <div class="update-box">
                ${updateHe}<br/>
                <span style="font-size: 0.9rem; opacity: 0.8; font-weight: 400;">${updateEn}</span>
            </div>
            
            <a href="${link}" class="btn">מעבר לאתר • Go to Site</a>
        </div>
        <div class="footer">
            StudyBuddy - למידה חכמה ושיתופית<br/>
            Smarter, more focused, and more fun learning.
        </div>
    </div>
</body>
</html>
`;
