"use client"
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/hooks/useLanguage';
import { translations } from '@/lib/i18n';
import { ScienceAvatar } from '@/components/ScienceAvatar';
import { emailService } from '@/lib/emailService';

export default function HelpCenterPage() {
  const router = useRouter();
  const { language, isReady } = useLanguage();
  const t = translations[language];
  const isHe = language === 'he';

  // Live Data from Supabase
  const [requests, setRequests] = useState<any[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  
  const [filterMajor, setFilterMajor] = useState('All');
  const [filterYear, setFilterYear] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  useEffect(() => {
    const user_id_temp = userId;
    const fetchData = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) setUserId(userData.user.id);

      const { data, error } = await supabase
        .from('help_requests')
        .select('*, profiles:profiles!requester_id(alias, avatar_base, degree, year, year_of_study)')
        .order('created_at', { ascending: false });

      if (!error && data) {
        const formatted = data.map(r => ({
          id: r.id,
          avatarBase: r.profiles?.avatar_base || 'brain',
          nickname: r.profiles?.alias || 'Guest',
          degree: r.profiles?.degree || 'Student',
          year: r.profiles?.year || '',
          content: r.topic,
          status: r.status,
          urgency: r.urgency_level === 'today' ? (isHe ? 'היום!' : 'Today!') : (r.urgency_level === 'this_week' ? (isHe ? 'השבוע' : 'This Week') : (isHe ? 'גמיש' : 'Flexible')),
          duration: r.duration_mins ? `${r.duration_mins}m` : '', 
          course: r.course || r.course_name, 
          dateStr: r.date_str,
          isOwn: r.requester_id === user_id_temp || r.requester_id === userData?.user?.id,
          user_id: r.requester_id
        }));
        setRequests(formatted);
      }
    };

    fetchData();

    // Realtime listener
    const channel = supabase.channel('help_center_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'help_requests' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isHe, userId]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  if (!isReady) return null;

  const handleOfferHelpClick = async (postId: string) => {
    if (!userId) return;
    const { error } = await supabase
      .from('help_requests')
      .update({ status: 'pending', helper_id: userId })
      .eq('id', postId);

    if (!error) {
      setRequests(requests.map(r => r.id === postId ? { ...r, status: 'pending' } : r));
      
      // 2. Fetch requester profile to send notification & email
      const reqInfo = requests.find(r => r.id === postId);
      if (reqInfo && reqInfo.user_id !== userId) {
        // Create DB Update/Notification
        await supabase.from('updates').insert([{
           user_id: reqInfo.user_id,
           type: 'help',
           title_he: 'הצעת עזרה חדשה! 🙋',
           title_en: 'New Help Offer! 🙋',
           content_he: `מישהו הציע לעזור לך בפוסט: "${reqInfo.course}".`,
           content_en: `Someone offered help for your post: "${reqInfo.course}".`,
           request_id: postId
        }]);

        // Send Email
        const { data: prof } = await supabase.from('profiles').select('email, real_first_name, alias').eq('id', reqInfo.user_id).single();
        if (prof?.email) {
          emailService.sendNotificationEmail(
            prof.email,
            prof.real_first_name || prof.alias || 'Buddy',
            `היי! מישהו הציע לעזור לך בשיעורי הבית ב-${reqInfo.course}! ✨ כנס/י לאתר כדי לאשר את העזרה.`,
            `Hi! Someone offered to help with your ${reqInfo.course} homework! ✨ Log in to the site to approve the help.`
          );
        }
      }
    }
  };

  const handleDeleteRequest = async (postId: string) => {
    const request = requests.find((r: any) => r.id === postId);
    if (!request) return;

    if (request.status === 'offered' || request.status === 'pending') {
      alert(isHe ? 'לא ניתן למחוק בקשה זו מכיוון שמישהו כבר הציע עזרה!' : 'Cannot delete this request because someone already offered help!');
      return;
    }
    
    if (confirm(isHe ? 'האם את/ה בטוח/ה שברצונך למחוק בקשה זו?' : 'Are you sure you want to delete this request?')) {
      const { error } = await supabase.from('help_requests').delete().eq('id', postId);
      if (!error) setRequests(requests.filter(r => r.id !== postId));
    }
  };

  const handleStartEdit = (req: any) => {
    setEditingId(req.id);
    setEditContent(req.content);
  };

  const handleSaveEdit = async (postId: string) => {
    const { error } = await supabase
      .from('help_requests')
      .update({ topic: editContent })
      .eq('id', postId);

    if (!error) {
        setRequests(requests.map(r => r.id === postId ? { ...r, content: editContent } : r));
        setEditingId(null);
    }
  };

  const prettyDate = (dateStr: string) => {
    if (!dateStr || dateStr === 'TBD' || dateStr === 'טרם נקבע') return null;
    if (dateStr.includes('T') && dateStr.includes('-')) {
      try {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          return `${d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })} | ${d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`;
        }
      } catch (e) { /* fallback */ }
    }
    return dateStr;
  };

  return (
    <div className="app-wrapper" style={{ direction: isHe ? 'rtl' : 'ltr', background: '#F8F9FE' }}>
      
      <nav className="sidebar" style={{ background: 'white', borderLeft: isHe ? '1px solid rgba(0,0,0,0.05)' : 'none', borderRight: !isHe ? '1px solid rgba(0,0,0,0.05)' : 'none' }}>
        <Link href="/dashboard" className="btn-secondary" style={{ marginBottom: '2.5rem', padding: '0.6rem 1.2rem', fontSize: '0.9rem', borderRadius: '12px' }}>
          {isHe ? '← חזרה לחשבון' : '← Back to Account'}
        </Link>
        <h2 style={{ fontSize: '2.8rem', marginBottom: '1rem', fontFamily: '"DynaPuff", cursive', color: 'var(--primary-dark)', lineHeight: 1.1 }}>
          {isHe ? 'מרכז עזרה' : 'Help Center'}
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '2.5rem', lineHeight: 1.6 }}>
          {isHe ? 'כאן פונים לחברים כדי למצוא עזרה ושיעורים פרטיים 1-על-1 באווירה סטודנטיאלית.' : 'Find 1-on-1 tutoring and academic help from fellow students.'}
        </p>

        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          <li>
            <Link href="/help/create" className="btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '1rem', borderRadius: '16px', boxShadow: '0 8px 25px rgba(138, 99, 210, 0.3)' }}>
              {isHe ? 'בקשת עזרה חדשה 🙋' : 'Request New Help 🙋'}
            </Link>
          </li>
        </ul>
      </nav>
      
      <main className="main-content" style={{ padding: '3rem' }}>
        <header style={{ marginBottom: '3rem' }}>
          <h1 style={{ fontSize: '2.8rem', margin: 0, fontWeight: '900', color: 'var(--primary-dark)', letterSpacing: '-0.5px' }}>
            {isHe ? 'בקשות עזרה (אנונימי 🔒)' : 'Help Requests (Anonymous 🔒)'}
          </h1>
        </header>

        {/* Filters */}
        <div style={{ 
          display: 'flex', gap: '1.2rem', marginBottom: '3rem', flexWrap: 'wrap', 
          background: 'rgba(255, 255, 255, 0.8)', backdropFilter: 'blur(20px)', padding: '2rem', 
          borderRadius: '24px', border: '1px solid rgba(138, 99, 210, 0.1)',
          boxShadow: '0 10px 40px rgba(0,0,0,0.03)'
        }}>
          <div style={{ flex: 1, minWidth: '240px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '800', marginBottom: '0.6rem', color: 'var(--primary-dark)', opacity: 0.7 }}>
              🔍 {isHe ? 'חפש לפי קורס' : 'Search by Course'}
            </label>
            <input 
              type="text" 
              className="input-field" 
              style={{ borderRadius: '14px', border: '1px solid rgba(138, 99, 210, 0.15)' }}
              placeholder={isHe ? 'למשל: ביוכימיה, פיזיולוגיה...' : 'e.g. Biochemistry...'} 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div style={{ width: '200px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '800', marginBottom: '0.6rem', color: 'var(--primary-dark)', opacity: 0.7 }}>
              🎓 {isHe ? 'חוג' : 'Major'}
            </label>
            <select className="input-field" style={{ borderRadius: '14px', border: '1px solid rgba(138, 99, 210, 0.15)' }} value={filterMajor} onChange={(e) => setFilterMajor(e.target.value)}>
              <option value="All">{isHe ? 'כל החוגים' : 'All Majors'}</option>
              {Object.entries(t.degrees).map(([k, v]) => (
                <option key={k} value={k}>{v as string}</option>
              ))}
            </select>
          </div>
          <div style={{ width: '150px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '800', marginBottom: '0.6rem', color: 'var(--primary-dark)', opacity: 0.7 }}>
              🗓️ {isHe ? 'שנה' : 'Year'}
            </label>
            <select className="input-field" style={{ borderRadius: '14px', border: '1px solid rgba(138, 99, 210, 0.15)' }} value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
              <option value="All">{isHe ? 'כל השנים' : 'All Years'}</option>
              {Object.entries(t.years).map(([k, v]) => (
                <option key={k} value={k}>{v as string}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Anonymity Banner */}
        <div style={{ 
          background: 'linear-gradient(135deg, rgba(76, 175, 80, 0.05), rgba(76, 175, 80, 0.1))', 
          border: '1px solid rgba(76, 175, 80, 0.15)', padding: '1.2rem 2rem', 
          borderRadius: '20px', marginBottom: '3rem', display: 'flex', alignItems: 'center', gap: '1.2rem' 
        }}>
          <span style={{ fontSize: '1.8rem' }}>🔒</span>
          <p style={{ margin: 0, fontSize: '0.95rem', color: '#2E7D32', fontWeight: '600', lineHeight: 1.5 }}>
              {isHe 
                ? 'מרכז העזרה הוא מקום בטוח להתייעץ באנונימיות מוחלטת. זהותכם תיחשף רק לאחר אישור העזרה ע"י המבקש.' 
                : 'The Help Center is anonymous. Your identity is revealed only after help is approved.'}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {requests
            .filter(r => {
              const matchesSearch = r.course?.toLowerCase().includes(searchQuery.toLowerCase());
              const matchesMajor = filterMajor === 'All' || r.degree === filterMajor;
              const matchesYear = filterYear === 'All' || r.year === filterYear || r.year === `year${filterYear}`;
              return (matchesSearch || !searchQuery) && matchesMajor && matchesYear;
            })
            .map((req) => (
            <div 
              key={req.id} 
              className="glass-card" 
              style={{ 
                display: 'flex', flexDirection: 'column', padding: '2.5rem',
                border: '1px solid rgba(255, 255, 255, 0.6)',
                borderRadius: '28px',
                background: 'rgba(255, 255, 255, 0.9)',
                transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                position: 'relative'
              }}
            >
              
              {/* Header: User Info & Badges */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
                  <div style={{ border: '3px solid white', borderRadius: '50%', boxShadow: '0 4px 15px rgba(0,0,0,0.08)' }}>
                    <ScienceAvatar avatarId={req.avatarBase} avatarFile={`${req.avatarBase}.png`} accessory={null} size={65} backgroundColor="#F3F0FF" />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '900', color: 'var(--primary-dark)' }}>{req.nickname}</h3>
                    <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '700' }}>
                      {t.degrees[req.degree as keyof typeof t.degrees] || req.degree} • {t.years[req.year as keyof typeof t.years] || req.year.replace('year', '')}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                   <span style={{ 
                     background: 'var(--primary-color)', color: 'white', padding: '0.5rem 1rem', 
                     borderRadius: '12px', fontSize: '0.75rem', fontWeight: '900', textTransform: 'uppercase' 
                   }}>
                    📚 {req.course}
                  </span>
                  <span style={{ 
                    background: req.urgency.includes('דחוף') || req.urgency.includes('Urgent') ? '#FFEDED' : '#F0FDF4', 
                    color: req.urgency.includes('דחוף') || req.urgency.includes('Urgent') ? '#E53E3E' : '#22C55E', 
                    padding: '0.5rem 1rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '900' 
                  }}>
                    {req.urgency.includes('דחוף') || req.urgency.includes('Urgent') ? '🚨 ' : '⚡ '} {req.urgency}
                  </span>
                </div>
              </div>

              {/* Content Body */}
              <div style={{ flex: 1, marginBottom: '2rem' }}>
                <div style={{ 
                  background: 'rgba(138, 99, 210, 0.03)', padding: '1.8rem', borderRadius: '22px', 
                  border: '1px solid rgba(138, 99, 210, 0.08)', position: 'relative' 
                }}>
                  {editingId === req.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                          <textarea 
                              className="input-field" 
                              rows={4} 
                              value={editContent} 
                              onChange={(e) => setEditContent(e.target.value)}
                              style={{ width: '100%', fontSize: '1rem', background: 'white' }}
                          />
                          <div style={{ display: 'flex', gap: '0.8rem' }}>
                              <button onClick={() => handleSaveEdit(req.id)} className="btn-primary" style={{ padding: '0.6rem 1.5rem', fontSize: '0.9rem' }}>{isHe ? 'שמור שינויים' : 'Save'}</button>
                              <button onClick={() => setEditingId(null)} className="btn-secondary" style={{ padding: '0.6rem 1rem', fontSize: '0.9rem' }}>{isHe ? 'ביטול' : 'Cancel'}</button>
                          </div>
                      </div>
                  ) : (
                      <p style={{ lineHeight: '1.7', margin: 0, fontSize: '1.1rem', color: '#333', fontWeight: '500' }}>
                          {req.content}
                      </p>
                  )}
                  
                  {/* Repositioned Date Display */}
                  {req.dateStr && req.dateStr !== 'TBD' && (
                    <div style={{ 
                      marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', 
                      fontSize: '0.85rem', fontWeight: '800', color: 'var(--primary-color)',
                      opacity: 0.9, background: 'white', padding: '0.4rem 1rem', borderRadius: '10px',
                      width: 'fit-content', boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                    }}>
                       🕒 {isHe ? 'מועד מבוקש:' : 'Preferred:'} {prettyDate(req.dateStr)}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer Actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1.5rem', borderTop: '2px dashed rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', gap: '1.5rem' }}>
                  {req.isOwn ? (
                    <>
                      <button onClick={() => handleStartEdit(req)} style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                         ✏️ {isHe ? 'עריכה' : 'Edit'}
                      </button>
                      <button onClick={() => handleDeleteRequest(req.id)} style={{ background: 'none', border: 'none', color: '#FF7676', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                         🗑️ {isHe ? 'מחיקה' : 'Delete'}
                      </button>
                    </>
                  ) : (
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '700' }}>
                      ⏱️ {isHe ? 'משך פגישה משוער:' : 'Est. Duration:'} {req.duration || (isHe ? 'גמיש' : 'Flexible')}
                    </div>
                  )}
                </div>

                {/* Status or Offer Action */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  {req.isOwn && req.status === 'pending' && (
                    <div style={{ padding: '0.8rem 1.5rem', background: '#FFF7ED', borderRadius: '16px', border: '1px solid #FFEDD5', color: '#C2410C', fontWeight: '900', fontSize: '0.9rem' }}>
                      {isHe ? 'מישהו הציע עזרה! בדוק/י בעדכונים.' : "Help offered! Check your updates."}
                    </div>
                  )}
                  
                  {!req.isOwn && req.status === 'open' && (
                    <button 
                      onClick={() => handleOfferHelpClick(req.id)}
                      className="btn-primary" 
                      style={{ padding: '0.8rem 2rem', fontSize: '1rem', background: '#22C55E', borderRadius: '16px', boxShadow: '0 6px 18px rgba(34, 197, 94, 0.3)' }}
                    >
                      {isHe ? 'אני יכול/ה לעזור! 🙋' : 'I can help! 🙋'}
                    </button>
                  )}

                  {req.status === 'offered' && (
                    <span style={{ fontSize: '1rem', color: '#22C55E', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      ✅ {isHe ? 'עזרה פעילה בצ׳אט' : 'Active in Chat'}
                    </span>
                  )}
                </div>
              </div>

            </div>
          ))}

        </div>
      </main>
    </div>
  );
}
