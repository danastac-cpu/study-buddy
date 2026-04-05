"use client"
import Link from 'next/link';
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useLanguage } from '@/hooks/useLanguage';

export default function LandingPage() {
  const { language: lang, setLanguage: setLang, isReady } = useLanguage();

  if (!isReady) return null;
  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      },
    });
    if (error) console.error("Error logging in:", error.message);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--background-bg)', position: 'relative', overflow: 'hidden' }}>
      <style jsx global>{`
        .tooltip-container:hover {
          z-index: 10000;
        }
        .tooltip-container:hover .tooltip-popup {
          visibility: visible;
          opacity: 1;
        }
      `}</style>

      {/* Background Decorative Blobs */}
      <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '500px', height: '500px', background: 'radial-gradient(circle, rgba(163, 132, 223, 0.4) 0%, rgba(255,255,255,0) 70%)', borderRadius: '50%', zIndex: 0 }}></div>
      <div style={{ position: 'absolute', bottom: '-20%', right: '-10%', width: '600px', height: '600px', background: 'radial-gradient(circle, rgba(138, 99, 210, 0.3) 0%, rgba(255,255,255,0) 70%)', borderRadius: '50%', zIndex: 0 }}></div>

      {/* Language Toggle */}
      <div style={{ position: 'absolute', top: '2rem', right: '2rem', cursor: 'pointer', background: 'white', padding: '0.6rem 1.5rem', borderRadius: '2rem', boxShadow: 'var(--shadow-sm)', fontWeight: '600', display: 'flex', gap: '0.8rem', alignItems: 'center', zIndex: 10 }}>
        🌐
        <span onClick={() => setLang('en')} style={{ color: lang === 'en' ? 'var(--primary-color)' : 'var(--text-muted)' }}>English</span>
        |
        <span onClick={() => setLang('he')} style={{ color: lang === 'he' ? 'var(--primary-color)' : 'var(--text-muted)' }}>עברית</span>
      </div>

      <div style={{ zIndex: 1, display: 'flex', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'center', gap: '4rem', maxWidth: '1100px', width: '90%', marginTop: '4rem', marginBottom: '4rem' }}>

        {/* Left/Top Content: Branding & Login */}
        <div style={{ flex: '1 1 400px', display: 'flex', flexDirection: 'column', direction: lang === 'he' ? 'rtl' : 'ltr', marginTop: '-6rem' }}>

          <div style={{ textAlign: 'center', marginBottom: '0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <img src="/new_logo.png" alt="StudyBuddy Logo" style={{ width: '400px', height: '400px', maxWidth: '100%', marginBottom: '-3rem', objectFit: 'contain' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />

            <h1 style={{
              fontSize: '4.8rem',
              fontWeight: '800',
              color: 'var(--primary-color)',
              fontFamily: '"DynaPuff", "Fredoka", "Outfit", cursive',
              textShadow: '3px 3px 0px rgba(163, 132, 223, 0.3), 6px 6px 0px rgba(163, 132, 223, 0.1)',
              letterSpacing: '1px',
              margin: '0 0 0.5rem 0',
              lineHeight: 1.1,
              marginTop: '-2.5rem'
            }}>
              StudyBuddy
            </h1>

            <p style={{ fontSize: '1.25rem', color: 'var(--primary-dark)', marginTop: '-0.8rem', fontWeight: '700' }}>
              {lang === 'en' ? 'Smarter, more focused, and more fun learning 💜' : 'למידה חכמה יותר, ממוקדת יותר וגם מהנה יותר 💜'}
            </p>
          </div>

          <p style={{ fontSize: '1.15rem', color: 'var(--text-main)', marginTop: '1rem', lineHeight: '1.6', fontWeight: 500, textAlign: lang === 'he' ? 'right' : 'left' }}>
            {lang === 'en' ? (
              <>A smart platform for collaborative learning.<br />Find study partners, create groups by topics,<br />manage group chats, ask questions and get or give help in real time.</>
            ) : (
              <>פלטפורמה חכמה ללמידה שיתופית<br />מצאו שותפים ללמידה, צרו קבוצות לפי נושאים,<br />נהלו צ׳אט קבוצתי, שאלו שאלות וקבלו או תנו עזרה בזמן אמת.</>
            )}
          </p>

          <div style={{ marginTop: '2.5rem', padding: '2rem', background: 'rgba(255,255,255,0.7)', borderRadius: '24px', backdropFilter: 'blur(10px)', border: '2px solid rgba(255,255,255,0.8)', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: lang === 'he' ? 'flex-start' : 'flex-start' }}>
            <div>
              <h3 style={{ margin: '0 0 0.4rem 0', color: 'var(--primary-dark)', fontSize: '1.2rem' }}>
                {lang === 'en' ? 'Already have an account?' : 'כבר רשומים ויש לכם דמות?'}
              </h3>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                {lang === 'en' ? 'Jump straight back into your account.' : 'כניסה מהירה היישר לחשבון שלכם.'}
              </p>
            </div>

            <button onClick={handleLogin} className="btn-primary" style={{ padding: '0.8rem 1.5rem', fontSize: '1rem', borderRadius: '12px', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ background: 'white', borderRadius: '50%', padding: '2px' }}>
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              {lang === 'en' ? 'Go to My Account' : 'מעבר לחשבון שלי'}
            </button>
          </div>

        </div>

        {/* Right/Bottom Content: 4 Options for New Users */}
        <div style={{ flex: '1 1 420px', display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', direction: lang === 'he' ? 'rtl' : 'ltr' }}>

          <div style={{ textAlign: lang === 'he' ? 'right' : 'left', marginBottom: '1rem', background: 'rgba(255,255,255,0.4)', padding: '1.5rem', borderRadius: '24px', border: '2px dashed var(--primary-light)' }}>
            <h2 style={{ fontSize: '1.8rem', color: 'var(--primary-dark)', margin: '0 0 0.5rem 0' }}>
              {lang === 'en' ? 'New User? Choose your path:' : 'משתמש חדש? בואו נתחיל:'}
            </h2>
            <p style={{ color: 'var(--text-main)', margin: 0, fontSize: '1.05rem', fontWeight: 500 }}>
              {lang === 'en' ? 'Select an option to create your avatar and sign up.' : 'בחרו באחת מהאפשרויות כדי לעצב את הדמות שלכם ולהירשם לאתר.'}
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <Link href="/signup?intent=join" style={{ textDecoration: 'none' }}>
              <div className="glass-card" style={{ display: 'flex', alignItems: 'center', padding: '1.2rem 1.5rem', cursor: 'pointer', gap: '1.5rem', transition: 'transform 0.2s', borderLeft: lang === 'he' ? 'none' : '6px solid var(--primary-color)', borderRight: lang === 'he' ? '6px solid var(--primary-color)' : 'none', borderRadius: '16px' }}>
                <div style={{ fontSize: '2.5rem' }}>🎓</div>
                <h2 style={{ fontSize: '1.4rem', color: 'var(--text-main)', margin: 0 }}>
                  {lang === 'en' ? 'Join a Study Group' : 'הצטרפות לקבוצת למידה'}
                </h2>
              </div>
            </Link>

            <Link href="/signup?intent=create" style={{ textDecoration: 'none' }}>
              <div className="glass-card" style={{ display: 'flex', alignItems: 'center', padding: '1.2rem 1.5rem', cursor: 'pointer', gap: '1.5rem', transition: 'transform 0.2s', borderLeft: lang === 'he' ? 'none' : '6px solid var(--primary-color)', borderRight: lang === 'he' ? '6px solid var(--primary-color)' : 'none', borderRadius: '16px' }}>
                <div style={{ fontSize: '2.5rem' }}>📝</div>
                <h2 style={{ fontSize: '1.4rem', color: 'var(--text-main)', margin: 0 }}>
                  {lang === 'en' ? 'Create a Study Group' : 'יצירת קבוצת למידה'}
                </h2>
              </div>
            </Link>

            <Link href="/signup?intent=offer" style={{ textDecoration: 'none' }}>
              <div className="glass-card" style={{ display: 'flex', alignItems: 'center', padding: '1.2rem 1.5rem', cursor: 'pointer', gap: '1.5rem', transition: 'transform 0.2s', borderLeft: lang === 'he' ? 'none' : '6px solid var(--primary-color)', borderRight: lang === 'he' ? '6px solid var(--primary-color)' : 'none', borderRadius: '16px' }}>
                <div style={{ fontSize: '2.5rem' }}>🤝</div>
                <h2 style={{ fontSize: '1.4rem', color: 'var(--text-main)', margin: 0 }}>
                  {lang === 'en' ? 'Offer Help' : 'מתן עזרה'}
                </h2>
              </div>
            </Link>

            <Link href="/signup?intent=request" style={{ textDecoration: 'none' }}>
              <div className="glass-card" style={{ display: 'flex', alignItems: 'center', padding: '1.2rem 1.5rem', cursor: 'pointer', gap: '1.5rem', transition: 'transform 0.2s', borderLeft: lang === 'he' ? 'none' : '6px solid var(--primary-color)', borderRight: lang === 'he' ? '6px solid var(--primary-color)' : 'none', borderRadius: '16px' }}>
                <div style={{ fontSize: '2.5rem' }}>🙋</div>
                <h2 style={{ fontSize: '1.4rem', color: 'var(--text-main)', margin: 0 }}>
                  {lang === 'en' ? 'Request Help' : 'בקשת עזרה'}
                </h2>
              </div>
            </Link>
          </div>

        </div>

      </div>

    </div>
  );
}
