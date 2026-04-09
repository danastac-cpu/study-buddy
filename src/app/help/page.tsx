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

  const [requests, setRequests] = useState<any[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [filterMajor, setFilterMajor] = useState('All');
  const [filterYear, setFilterYear] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

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
        year: r.profiles?.year || r.profiles?.year_of_study || '',
        content: r.topic,
        status: r.status,
        urgency: r.urgency_level === 'today' ? 'today' : (r.urgency_level === 'this_week' ? 'this_week' : 'flexible'),
        duration: r.duration_mins || '', 
        course: r.course || r.course_name, 
        dateStr: r.date_str,
        isOwn: r.requester_id === userData?.user?.id,
        user_id: r.requester_id
      }));
      setRequests(formatted);
    }
  };

  useEffect(() => {
    fetchData();
    const channel = supabase.channel('help_center_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'help_requests' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isHe]);

  if (!isReady) return null;

  const handleOfferHelpClick = async (postId: string) => {
    if (!userId) return;
    const { error } = await supabase.from('help_requests').update({ status: 'pending', helper_id: userId }).eq('id', postId);
    if (!error) {
      fetchData();
      const reqInfo = requests.find(r => r.id === postId);
      if (reqInfo) {
        await supabase.from('updates').insert([{
           user_id: reqInfo.user_id,
           type: 'help',
           title_he: 'הצעת עזרה חדשה! 🙋',
           title_en: 'New Help Offer! 🙋',
           content_he: `מישהו הציע לעזור לך בפוסט: "${reqInfo.course}".`,
           content_en: `Someone offered help for your post: "${reqInfo.course}".`,
           request_id: postId
        }]);
      }
    }
  };

  const handleDeleteRequest = async (postId: string) => {
    if (confirm(isHe ? 'האם את/ה בטוח/ה שברצונך למחוק בקשה זו?' : 'Are you sure you want to delete this request?')) {
      const { error } = await supabase.from('help_requests').delete().eq('id', postId);
      if (!error) fetchData();
    }
  };

  const prettyDate = (dateStr: string) => {
    if (!dateStr || dateStr === 'TBD' || dateStr === 'טרם נקבע') return isHe ? '📅 עדיין לא נקבע' : '📅 Not set';
    if (dateStr.includes('T') && dateStr.includes('-')) {
      try {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          return `${d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })}`;
        }
      } catch (e) {}
    }
    return dateStr;
  };

  return (
    <div className="app-wrapper" style={{ direction: isHe ? 'rtl' : 'ltr', background: '#FDFCFE' }}>
      
      <nav className="sidebar" style={{ background: '#FFF7FF', border: 'none', boxShadow: '10px 0 30px rgba(0,0,0,0.02)' }}>
        <Link href="/dashboard" className="btn-secondary" style={{ marginBottom: '2.5rem', background: 'white', borderRadius: '15px' }}>
          {isHe ? '← חזרה' : '← Back'}
        </Link>
        <h2 style={{ fontSize: '2.5rem', marginBottom: '1rem', fontFamily: '"DynaPuff", cursive', color: 'var(--primary-dark)' }}>
          {isHe ? 'מרכז עזרה' : 'Help Center'}
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2.5rem', lineHeight: '1.6' }}>
          {isHe ? 'מרחב בטוח למציאת עזרה בלימודים.' : 'A safe space to find academic help.'}
        </p>

        <Link href="/help/create" className="btn-primary" style={{ width: '100%', borderRadius: '20px', padding: '1rem', background: 'linear-gradient(135deg, #A78BFA, #8B5CF6)' }}>
          {isHe ? 'בקשת עזרה חדשה 🙋' : 'Request New Help 🙋'}
        </Link>
      </nav>
      
      <main className="main-content" style={{ padding: '2rem' }}>
        <style>{`
          @keyframes pulse-red {
            0% { box-shadow: 0 0 0 0 rgba(255, 118, 118, 0.4); }
            70% { box-shadow: 0 0 0 15px rgba(255, 118, 118, 0); }
            100% { box-shadow: 0 0 0 0 rgba(255, 118, 118, 0); }
          }
          .pulse-card {
            animation: pulse-red 2s infinite;
            border: 2px solid #FFEDED !important;
          }
        `}</style>

        <header style={{ marginBottom: '2.5rem' }}>
          <h1 style={{ fontSize: '2.5rem', color: 'var(--primary-dark)', fontFamily: '"DynaPuff", cursive' }}>
            {isHe ? 'בקשות עזרה' : 'Help Requests'}
          </h1>
        </header>

        {/* Filters */}
        <div style={{ 
          display: 'flex', gap: '1rem', marginBottom: '2.5rem', flexWrap: 'wrap', 
          background: 'white', padding: '1.5rem', borderRadius: '30px', 
          boxShadow: '0 10px 25px rgba(0,0,0,0.03)' 
        }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <input 
              type="text" 
              className="input-field" 
              style={{ borderRadius: '15px', background: '#F9F7FF' }}
              placeholder={isHe ? 'חפש קורס...' : 'Search course...'} 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select className="input-field" style={{ width: '180px', borderRadius: '15px', background: '#F9F7FF' }} value={filterMajor} onChange={(e) => setFilterMajor(e.target.value)}>
            <option value="All">{isHe ? 'כל החוגים' : 'All Majors'}</option>
            {Object.entries(t.degrees).map(([k, v]) => (
              <option key={k} value={k}>{v as string}</option>
            ))}
          </select>
          <select className="input-field" style={{ width: '120px', borderRadius: '15px', background: '#F9F7FF' }} value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
            <option value="All">{isHe ? 'כל השנים' : 'All Years'}</option>
            {Object.entries(t.years).map(([k, v]) => (
              <option key={k} value={k}>{v as string}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
          {requests
            .filter(r => {
              const matchesSearch = r.course?.toLowerCase().includes(searchQuery.toLowerCase());
              const matchesMajor = filterMajor === 'All' || r.degree === filterMajor;
              const matchesYear = filterYear === 'All' || r.year === filterYear || r.year === `year${filterYear}`;
              return matchesSearch && matchesMajor && matchesYear;
            })
            .map((req) => (
            <div 
              key={req.id} 
              className={`glass-card ${req.urgency === 'today' ? 'pulse-card' : ''}`}
              style={{ 
                padding: '2rem', borderRadius: '35px', background: 'white', border: 'none',
                boxShadow: req.urgency === 'today' ? 'none' : '0 15px 35px rgba(138, 99, 210, 0.08)', 
                position: 'relative', display: 'flex', flexDirection: 'column', height: '100%'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.2rem' }}>
                <ScienceAvatar avatarId={req.avatarBase} avatarFile={`${req.avatarBase}.png`} accessory={null} size={55} backgroundColor="#F3F0FF" />
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '900' }}>{req.nickname}</h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>
                    {t.degrees[req.degree as keyof typeof t.degrees] || req.degree}
                    {req.year && ` • ${t.years[req.year as keyof typeof t.years] || req.year}`}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.2rem', flexWrap: 'wrap' }}>
                 <span style={{ background: '#F5F3FF', color: 'var(--primary-color)', padding: '0.4rem 0.8rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '900' }}>
                   📚 {req.course}
                 </span>
                 {req.duration && (
                   <span style={{ background: '#FDF2F8', color: '#DB2777', padding: '0.4rem 0.8rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '900' }}>
                     🕒 {req.duration}m
                   </span>
                 )}
                 <span style={{ 
                    background: req.urgency === 'today' ? '#FFEDED' : (req.urgency === 'this_week' ? '#FFFBEB' : '#F0FDF4'), 
                    color: req.urgency === 'today' ? '#FF7676' : (req.urgency === 'this_week' ? '#B45309' : '#166534'),
                    padding: '0.4rem 0.8rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '900' 
                 }}>
                   {req.urgency === 'today' ? (isHe ? 'היום!' : 'Today!') : (req.urgency === 'this_week' ? (isHe ? 'השבוע' : 'This Week') : (isHe ? 'גמיש' : 'Flexible'))}
                 </span>
              </div>

              <div style={{ flex: 1, marginBottom: '1.5rem' }}>
                <p style={{ lineHeight: '1.6', fontSize: '1rem', color: '#444' }}>{req.content}</p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #F8F7FF', paddingTop: '1.2rem' }}>
                 <span style={{ fontSize: '0.8rem', color: '#999', fontWeight: '800' }}>
                    {prettyDate(req.dateStr)}
                 </span>

                 <div style={{ display: 'flex', gap: '0.8rem' }}>
                    {req.isOwn ? (
                       <>
                         <button onClick={() => router.push(`/help/edit/${req.id}`)} style={{ color: 'var(--primary-color)', border: 'none', background: 'none', fontSize: '0.85rem', fontWeight: 'bold', cursor: 'pointer' }}>
                           {isHe ? 'ערוך' : 'Edit'}
                         </button>
                         <button onClick={() => handleDeleteRequest(req.id)} style={{ color: '#FF7676', border: 'none', background: 'none', fontSize: '0.85rem', fontWeight: 'bold', cursor: 'pointer' }}>
                           {isHe ? 'מחק' : 'Delete'}
                         </button>
                       </>
                    ) : req.status === 'open' && (
                       <button onClick={() => handleOfferHelpClick(req.id)} className="btn-primary" style={{ padding: '0.6rem 1.2rem', borderRadius: '15px', fontSize: '0.9rem' }}>
                         {isHe ? 'הצע/י עזרה' : 'Offer Help'}
                       </button>
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
