"use client"
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/hooks/useLanguage';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function CreateGroupPage() {
  const router = useRouter();
  const { language, isReady } = useLanguage();
  const isHe = language === 'he';

  const [course, setCourse] = useState('');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [createDate, setCreateDate] = useState('');
  const [createTime, setCreateTime] = useState('');
  const [maxMems, setMaxMems] = useState('5');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDetailsPref, setShowDetailsPref] = useState('both');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUser(data.user);
    });
  }, []);

  if (!isReady) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
        alert(isHe ? 'אנא התחבר תחילה.' : 'Please log in first.');
        return;
    }

    setIsSubmitting(true);
    const dateLabel = (createDate || createTime) 
      ? `${createDate}${createDate && createTime ? ' | ' : ''}${createTime}` 
      : (isHe ? 'טרם נקבע' : 'TBD');

    // 1. Insert Group
    const { data: group, error: groupError } = await supabase
      .from('study_groups')
      .insert([{
        title: title || (isHe ? 'קבוצה חדשה' : 'New Group'),
        course: course,
        description: desc + `\n<!-- PREF:${showDetailsPref} -->`,
        session_time: dateLabel, 
        max_capacity: parseInt(maxMems),
        manager_id: currentUser.id
      }])
      .select()
      .single();

    if (groupError || !group) {
        alert('Error creating group: ' + groupError?.message);
        setIsSubmitting(false);
        return;
    }

    // 2. Automatically enroll the manager
    const { error: enrollError } = await supabase
      .from('group_enrollments')
      .insert([{
        group_id: group.id,
        user_id: currentUser.id,
        status: 'approved'
      }]);

    if (!enrollError) {
        alert(isHe ? 'הקבוצה הוקמה בהצלחה! ✨' : 'Group created successfully! ✨');
        router.push('/groups/' + group.id);
    } else {
        alert('Error enrolling manager: ' + enrollError.message);
        setIsSubmitting(false);
    }
  };

  return (
    <div className="app-wrapper" style={{ direction: isHe ? 'rtl' : 'ltr' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', paddingTop: '2rem', flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
          <Link href="/groups" className="btn-secondary" style={{ padding: '0.4rem 1rem' }}>
             {isHe ? '← חזרה' : '← Back'}
          </Link>
          <h1 style={{ fontSize: '2rem', margin: 0, fontFamily: '"DynaPuff", "Fredoka", "Outfit", cursive' }}>
            {isHe ? 'יצירת קבוצת למידה' : 'Create a Study Group'}
          </h1>
        </div>

        <div className="glass-card">
          <div style={{ background: 'rgba(255, 152, 0, 0.1)', border: '2px solid #ff9800', padding: '1rem', borderRadius: '8px', marginBottom: '2rem' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', color: '#e65100', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.2rem' }}>⚠️</span> {isHe ? 'שים/י לב: אין אנונימיות בקבוצות' : 'Notice: No Anonymity Here'}
            </h4>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-main)', lineHeight: '1.5' }}>
              {isHe 
                ? 'בקבוצות הלמידה מוצגים השמות והפרטים האמיתיים שלך (לא הכינוי האנונימי). מי שיצור את הקבוצה וכל מי שיצטרף אליה, יוכלו לראות ולהיראות בשמם המלא והאמיתי למען תהליך למידה אפקטיבי ואמין.'
                : 'Study groups display your real name and actual details (not your anonymous alias). The creator and all joiners will see and be seen with full transparency to ensure effective and reliable studying.'}
            </p>
          </div>

          <form style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} onSubmit={handleSubmit}>
            <div>
              <label style={{ display: 'block', fontWeight: '500', marginBottom: '0.5rem', color: 'var(--text-main)' }}>
                 {isHe ? 'איזה קורס?' : 'Which Course?'}
              </label>
              <input type="text" className="input-field" placeholder={isHe ? "לדוגמא: פרמקולוגיה, חדו״א 2" : "e.g. Pharmacology 101, Anatomy II"} value={course} onChange={e => setCourse(e.target.value)} required />
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: '500', marginBottom: '0.5rem', color: 'var(--text-main)' }}>
                {isHe ? 'כותרת ושם לקבוצה' : 'Group Title'}
              </label>
              <input type="text" className="input-field" placeholder={isHe ? "לדוגמא: מפגש הכנה למבחן האמצע" : "e.g. Midterm Revison..."} value={title} onChange={e => setTitle(e.target.value)} required />
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: '500', marginBottom: '0.5rem', color: 'var(--text-main)' }}>
                {isHe ? 'מה תלמדו? תאר/י את מטרת הקבוצה:' : 'What will you study? (Description)'}
              </label>
              <textarea className="input-field" placeholder={isHe ? "נעבור יחד על פרקים 3 ו-4 לקראת הבוחן..." : "We will review the chapters 3 & 4..."} rows={4} style={{ resize: 'vertical' }} value={desc} onChange={e => setDesc(e.target.value)} required></textarea>
            </div>

            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <label style={{ display: 'block', fontWeight: '500', marginBottom: '0.2rem', color: 'var(--text-main)' }}>
                  {isHe ? 'תאריך ושעה קבועים מראש' : 'Set Date & Time'}
                </label>
                <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  {isHe ? '(לא חובה למלא – ניתן לתאם מאוחר יותר)' : '(Optional - can be arranged later)'}
                </span>
                <div style={{ display: 'flex', gap: '0.8rem' }}>
                  <input type="date" className="input-field" style={{ flex: 1 }} value={createDate} onChange={e => setCreateDate(e.target.value)} required={false} />
                  <input type="time" className="input-field" style={{ flex: 1 }} value={createTime} onChange={e => setCreateTime(e.target.value)} required={false} />
                </div>
              </div>
              <div style={{ width: '150px' }}>
                <label style={{ display: 'block', fontWeight: '500', marginBottom: '0.5rem', color: 'var(--text-main)' }}>
                  {isHe ? 'מספר חברים מקסימלי' : 'Max Members'}
                </label>
                <input type="number" min="2" max="10" value={maxMems} onChange={e => setMaxMems(e.target.value)} className="input-field" required />
              </div>
            </div>

            <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.02)', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.05)' }}>
              <label style={{ display: 'block', fontWeight: '500', marginBottom: '0.8rem', color: 'var(--text-main)' }}>
                 {isHe ? 'אילו פרטים אישיים תרצה/י להציג בכרטיסיה של הקבוצה?' : 'What personal details to show on the group card?'}
              </label>
              <select className="input-field" value={showDetailsPref} onChange={e => setShowDetailsPref(e.target.value)}>
                <option value="both">{isHe ? 'שנה וחוג' : 'Major & Year'}</option>
                <option value="major">{isHe ? 'חוג בלבד' : 'Major Only'}</option>
                <option value="year">{isHe ? 'שנה בלבד' : 'Year Only'}</option>
                <option value="none">{isHe ? 'אל תציג פרטים' : 'Do not show details'}</option>
              </select>
            </div>

            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0.5rem 0' }}>
              {isHe ? 'תקבלו התראה למייל כשהקבוצה תתמלא במשתתפים. מעבר לכך משתמשים יכנסו לרשימת המתנה!' : "You'll receive an email notification when full. Extras go to the Waitlist!"}
            </p>

            <button type="submit" className="btn-primary" disabled={isSubmitting} style={{ marginTop: '1rem', padding: '1rem', fontSize: '1.1rem' }}>
              {isSubmitting ? '...' : (isHe ? 'הקם/י קבוצת למידה' : 'Launch Study Group')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
