"use client"
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useLanguage } from '@/hooks/useLanguage';
import { translations } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

export default function CreateHelpRequestPage() {
  const router = useRouter();
  const { language, isReady } = useLanguage();
  const t = translations[language];
  const isHe = language === 'he';

  const [urgency, setUrgency] = useState('today');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUser(data.user);
    });
  }, []);

  if (!isReady) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
        alert(isHe ? 'אנא התחבר כדי לבצע פעולות.' : 'Please log in first.');
        return;
    }

    setIsSubmitting(true);
    const formData = new FormData(e.target as HTMLFormElement);
    const content = formData.get('content') as string;
    const course = formData.get('course') as string;
    const durationVal = formData.get('duration') as string;
    const targetDate = formData.get('targetDate') as string;
    
    // Map duration for display
    const durationLabel = durationVal === '15m' ? '15' : 
                         durationVal === '30m' ? '30' : '45';

    const { error } = await supabase.from('help_requests').insert([{
        user_id: currentUser.id,
        course: course,
        description: content,
        urgency: urgency,
        duration: durationLabel,
        target_date: urgency === 'this_week' ? targetDate : (urgency === 'today' ? new Date().toISOString() : null),
        status: 'open'
    }]);

    if (!error) {
        alert(isHe ? 'בקשת התמיכה הועלתה בהצלחה!' : 'Help Request Posted successfully!');
        router.push('/help');
    } else {
        alert('Error: ' + error.message);
        setIsSubmitting(false);
    }
  };

  return (
    <div className="app-wrapper" style={{ direction: isHe ? 'rtl' : 'ltr' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', paddingTop: '2rem', flex: 1, paddingBottom: '4rem' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
          <Link href="/help" className="btn-secondary" style={{ padding: '0.4rem 1rem' }}>
             {isHe ? '← חזרה' : '← Back'}
          </Link>
          <h1 style={{ fontSize: '2rem', margin: 0, fontFamily: '"DynaPuff", "Fredoka", "Outfit", cursive' }}>
            {isHe ? 'בקשת עזרה חדשה 🙋' : 'Request Help 🙋'}
          </h1>
        </div>

        <div className="glass-card">
          <form style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} onSubmit={handleSubmit}>
            
            <div>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--text-main)' }}>
                 {isHe ? 'במה את/ה צריך עזרה?' : 'What do you need help with?'}
              </label>
              <textarea 
                name="content"
                className="input-field" 
                placeholder={isHe ? "לדוגמא: נתקעתי בתרגיל 3 באינפי, אשמח שמישהו יעזור לי להבין את הרעיון..." : "e.g. Stuck on Calculus Assignment 3..."} 
                rows={4} 
                style={{ resize: 'vertical' }} 
                required
              ></textarea>
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--text-main)' }}>
                 {isHe ? 'קורס' : 'Course'}
              </label>
              <input name="course" type="text" className="input-field" placeholder={isHe ? "לדוגמא: פיזיקה 1" : "e.g. Physics 101"} required />
            </div>

            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '150px' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--text-main)' }}>
                  {isHe ? 'כמה זמן נדרש?' : 'Estimated Duration'}
                </label>
                <select name="duration" className="input-field">
                  <option value="15m">{isHe ? '15 דקות' : '15 Mins'}</option>
                  <option value="30m">{isHe ? '30 דקות' : '30 Mins'}</option>
                  <option value="45m">{isHe ? '45 דקות' : '45 Mins'}</option>
                </select>
              </div>

              <div style={{ flex: 1, minWidth: '150px' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--text-main)' }}>
                  {isHe ? 'רמת דחיפות (מתי?)' : 'Urgency (When?)'}
                </label>
                <select className="input-field" value={urgency} onChange={(e) => setUrgency(e.target.value)}>
                  <option value="today">{isHe ? 'דחוף (היום)' : 'Urgent (Today)'}</option>
                  <option value="this_week">{isHe ? 'השבוע' : 'This Week'}</option>
                  <option value="not_urgent">{isHe ? 'לא דחוף / גמיש' : 'Not Urgent / Flexible'}</option>
                </select>
              </div>
            </div>

            {urgency === 'this_week' && (
              <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--text-main)' }}>
                  {isHe ? 'תאריך מועדף השבוע' : 'Preferred Date This Week'}
                </label>
                <input name="targetDate" type="date" className="input-field" required />
              </div>
            )}

            <button type="submit" className="btn-primary" disabled={isSubmitting} style={{ marginTop: '1rem', padding: '1rem', fontSize: '1.1rem' }}>
              {isSubmitting ? '...' : (isHe ? 'שתף/י בקשה לחברים' : 'Post Request to Peers')}
            </button>

          </form>
        </div>
      </div>
    </div>
  );
}
