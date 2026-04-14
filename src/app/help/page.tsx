"use client"
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/hooks/useLanguage';
import { translations } from '@/lib/i18n';
import { ScienceAvatar, ACCESSORIES } from '@/components/ScienceAvatar';
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
      .select('*, profiles:profiles!requester_id(alias, avatar_base, avatar_accessory, avatar_bg, degree, year, year_of_study)')
      .order('created_at', { ascending: false });

    if (!error && data) {
      const formatted = data.map(r => {
        let cleanContent = r.topic || '';
        let extractedDate = '';
        if (cleanContent.includes('[Date:')) {
           const match = cleanContent.match(/\[Date:\s*(.*?)\]/);
           if (match) {
             extractedDate = match[1];
             cleanContent = cleanContent.replace(/\[Date:.*?\]/, '').trim();
           }
        }

        const formatDate = (ds: string) => {
           if (!ds) return '';
           try {
             const d = new Date(ds);
             if (isNaN(d.getTime())) return ds;
             return `${d.getDate()}/${d.getMonth() + 1} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
           } catch(e) { return ds; }
        };

        return {
          id: r.id,
          avatarBase: r.profiles?.avatar_base || 'brain',
          avatarAccessory: r.profiles?.avatar_accessory || 'none',
          avatarBg: r.profiles?.avatar_bg || '#F3F0FF',
          nickname: r.profiles?.alias || 'Guest',
          degree: (t.degrees[r.profiles?.degree as keyof typeof t.degrees] as string) || r.profiles?.degree || 'Student',
          year: (t.years[r.profiles?.year_of_study as keyof typeof t.years] as string) || (t.years[r.profiles?.year as keyof typeof t.years] as string) || '',
          content: cleanContent,
          status: r.status,
          urgencyRaw: r.urgency_level,
          urgencyLabel: r.urgency_level === 'today' ? (isHe ? 'היום!' : 'Today!') : (r.urgency_level === 'this_week' ? (isHe ? 'השבוע' : 'This Week') : (isHe ? 'גמיש' : 'Flexible')),
          displayDate: formatDate(extractedDate || r.date_str),
          duration: r.duration_mins ? `${r.duration_mins}m` : '', 
          course: r.course || r.course_name, 
          isOwn: r.requester_id === userData?.user?.id,
          user_id: r.requester_id,
          created_at: r.created_at
        };
      });
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
    
    // 1. Get the request details to notify the requester
    const { data: reqData } = await supabase.from('help_requests').select('*, profiles:profiles!requester_id(alias)').eq('id', postId).single();
    
    // 2. Update status
    const { error } = await supabase.from('help_requests').update({ status: 'pending', helper_id: userId }).eq('id', postId);
    
    if (!error && reqData) {
      // 3. Create Update for the requester
      const myProfile = await supabase.from('profiles').select('alias').eq('id', userId).single();
      const helperName = myProfile.data?.alias || (isHe ? 'מישהו' : 'Someone');

      await supabase.from('updates').insert([{
        user_id: reqData.requester_id,
        type: 'help',
        request_id: postId,
        title_he: 'יש לך הצעה לעזרה! 🤝',
        title_en: 'Someone offered help! 🤝',
        content_he: `${helperName} הציע/ה לעזור לך ב${reqData.course || reqData.course_name}.`,
        content_en: `${helperName} offered to help you with ${reqData.course || reqData.course_name}.`
      }]);

      fetchData();
    }
  };

  const handleDeleteRequest = async (postId: string) => {
    if (confirm(isHe ? 'האם את/ה בטוח/ה שברצונך למחוק בקשה זו?' : 'Are you sure you want to delete this request?')) {
      const { error } = await supabase.from('help_requests').delete().eq('id', postId);
      if (!error) fetchData();
    }
  };

  return (
    <div className="app-wrapper" style={{ direction: isHe ? 'rtl' : 'ltr', background: '#FDFBFF' }}>
      
      <nav className="sidebar" style={{ background: 'white', borderRight: isHe ? 'none' : '1px solid rgba(0,0,0,0.05)', borderLeft: isHe ? '1px solid rgba(0,0,0,0.05)' : 'none' }}>
        <Link href="/dashboard" className="btn-secondary" style={{ marginBottom: '2.5rem', background: 'white', borderRadius: '15px', border: 'none', boxShadow: 'var(--shadow-sm)' }}>
          {isHe ? '← חזרה' : '← Back'}
        </Link>
        <h2 style={{ fontSize: '2.4rem', marginBottom: '1rem', fontFamily: '"DynaPuff", "Fredoka", "Outfit", cursive', color: 'var(--primary-color)' }}>
          {isHe ? 'מרכז עזרה' : 'Help Center'}
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '2.5rem', lineHeight: '1.6' }}>
          {isHe ? 'מרחב בטוח למציאת עזרה בלימודים.' : 'A safe space to find academic help.'}
        </p>

        <ul style={{ listStyle: 'none', padding: 0 }}>
          <li style={{ marginBottom: '1rem' }}>
            <Link href="/help/create" className="btn-primary" style={{ width: '100%', borderRadius: '25px', padding: '1rem', fontSize: '1.1rem' }}>
              {isHe ? 'בקשת עזרה חדשה 🙋' : 'Request New Help 🙋'}
            </Link>
          </li>
        </ul>
      </nav>
      
      <main className="main-content" style={{ padding: '2rem 3rem' }}>
        <header style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontSize: '2.5rem', margin: 0, fontFamily: '"DynaPuff", "Fredoka", "Outfit", cursive', color: 'var(--primary-color)' }}>
            {isHe ? 'בקשות עזרה' : 'Help Requests'}
          </h1>
        </header>

        {/* Info/Explanation Box */}
        <div style={{ 
          background: 'rgba(76, 175, 80, 0.08)', 
          border: '2px dashed #4CAF50', 
          padding: '1.2rem', 
          borderRadius: '15px', 
          marginBottom: '2.5rem',
          display: 'flex',
          gap: '1rem',
          alignItems: 'center'
        }}>
          <div style={{ fontSize: '2rem' }}>💡</div>
          <div>
            <h4 style={{ margin: '0 0 0.4rem 0', color: '#2E7D32', fontFamily: '"DynaPuff", "Fredoka", "Outfit", cursive' }}>
              {isHe ? 'איך זה עובד?' : 'How it works?'}
            </h4>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-main)', lineHeight: '1.5' }}>
              {isHe 
                ? 'כאן תוכלו למצוא חברים שיעזרו לכם במקצועות השונים. הציעו עזרה, צברו כוכבים ובנו קהילת למידה חזקה!' 
                : 'Find peers to help you with your studies. Offer help, earn stars, and build a strong learning community together!'}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div style={{ 
          display: 'flex', gap: '1rem', marginBottom: '3rem', flexWrap: 'nowrap', 
          background: 'white', padding: '1.2rem', borderRadius: '25px', 
          boxShadow: '0 8px 30px rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.02)'
        }}>
          <div style={{ flex: 1, minWidth: '240px' }}>
            <input 
              type="text" 
              className="input-field" 
              style={{ borderRadius: '15px', background: '#F9F7FF', border: 'none' }}
              placeholder={isHe ? 'חפש קורס...' : 'Search course...'} 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select className="input-field" style={{ width: '180px', borderRadius: '15px', background: '#F9F7FF', border: 'none' }} value={filterMajor} onChange={(e) => setFilterMajor(e.target.value)}>
            <option value="All">{isHe ? 'כל החוגים' : 'All Majors'}</option>
            {Object.entries(t.degrees).map(([k, v]) => (
              <option key={k} value={k}>{v as string}</option>
            ))}
          </select>
          <select className="input-field" style={{ width: '120px', borderRadius: '15px', background: '#F9F7FF', border: 'none' }} value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
            <option value="All">{isHe ? 'כל השנים' : 'All Years'}</option>
            {Object.entries(t.years).map(([k, v]) => (
              <option key={k} value={k}>{v as string}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '2.5rem' }}>
          {requests
            .filter(r => {
              const matchesSearch = r.course?.toLowerCase().includes(searchQuery.toLowerCase());
              const matchesMajor = filterMajor === 'All' || r.degree === filterMajor || (t.degrees[filterMajor as keyof typeof t.degrees] === r.degree);
              const matchesYear = filterYear === 'All' || r.year === filterYear || (t.years[filterYear as keyof typeof t.years] === r.year);
              return matchesSearch && matchesMajor && matchesYear;
            })
            .map((req) => (
            <div 
              key={req.id} 
              className="glass-card" 
              style={{ 
                display: 'flex', flexDirection: 'column', padding: '2rem',
                borderRadius: '35px', background: 'white',
                boxShadow: req.urgencyRaw === 'today' ? '0 0 30px rgba(244, 67, 54, 0.15)' : '0 15px 45px rgba(138, 99, 210, 0.06)',
                position: 'relative',
                border: req.urgencyRaw === 'today' ? '2px solid rgba(244, 67, 54, 0.1)' : '1px solid rgba(0,0,0,0.01)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem', marginBottom: '1.5rem' }}>
                <ScienceAvatar 
                   avatarId={req.avatarBase} 
                   avatarFile={`${req.avatarBase}.png`} 
                   accessory={ACCESSORIES.find(a => a.id === req.avatarAccessory) || null} 
                   size={70} 
                   backgroundColor={req.avatarBg} 
                />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <p style={{ fontWeight: '900', margin: 0, fontSize: '1.4rem', color: 'var(--primary-color)', fontFamily: '"DynaPuff", "Fredoka", "Outfit", cursive' }}>{req.nickname}</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.2rem 0 0 0', fontWeight: 'bold' }}>
                    {req.degree} • {req.year}
                  </p>
                </div>
              </div>

              <div style={{ flex: 1, marginBottom: '2.5rem' }}>
                <div style={{ display: 'flex', gap: '0.8rem', marginBottom: '1.5rem', flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                  <span style={{ 
                    background: '#F5F3FF', padding: '0.4rem 0.8rem', borderRadius: '12px', 
                    fontSize: '0.85rem', fontWeight: '900', color: 'var(--primary-color)',
                    whiteSpace: 'nowrap'
                  }}>
                    📚 {req.course}
                  </span>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <span style={{ 
                      background: req.urgencyRaw === 'today' ? '#FFEDED' : (req.urgencyRaw === 'this_week' ? '#FFF3E0' : '#F0FDF4'), 
                      color: req.urgencyRaw === 'today' ? '#CC0000' : (req.urgencyRaw === 'this_week' ? '#E67E22' : '#166534'), 
                      padding: '0.4rem 0.8rem', borderRadius: '12px', fontSize: '0.85rem', fontWeight: '900',
                      whiteSpace: 'nowrap'
                    }}>
                      {req.urgencyRaw === 'today' ? '🚨 ' : '📅 '} {req.urgencyLabel}
                    </span>
                    {req.urgencyRaw === 'this_week' && req.displayDate && (
                      <span style={{ fontSize: '0.75rem', color: '#999', fontWeight: 'bold', textAlign: 'center' }}>
                        {req.displayDate}
                      </span>
                    )}
                  </div>

                  {req.duration && (
                    <span style={{ 
                      background: '#F0FDF4', color: '#166534', padding: '0.4rem 0.8rem', 
                      borderRadius: '12px', fontSize: '0.85rem', fontWeight: '900',
                      whiteSpace: 'nowrap'
                    }}>
                      ⏱️ {req.duration}
                    </span>
                  )}
                </div>

                <p style={{ lineHeight: '1.7', margin: 0, fontSize: '1.15rem', color: '#444', fontWeight: '500' }}>{req.content}</p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #F3F0FF', paddingTop: '1.5rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  {req.isOwn ? (
                    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                      <button onClick={() => router.push(`/help/edit/${req.id}`)} style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '900' }}>
                          {isHe ? 'עריכה' : 'Edit'}
                      </button>
                      <button onClick={() => handleDeleteRequest(req.id)} style={{ background: 'none', border: 'none', color: '#FF7676', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '900' }}>
                          {isHe ? 'מחיקה' : 'Delete'}
                      </button>
                    </div>
                  ) : (
                    <div style={{ flex: 1 }}>
                       {req.status === 'pending' && (
                          <button onClick={() => router.push(`/chat/${req.id}`)} className="btn-primary" style={{ padding: '0.7rem 1.5rem', fontSize: '0.9rem', background: 'rgba(59, 130, 246, 0.1)', color: '#2563EB', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '18px', fontWeight: 'bold' }}>
                             {isHe ? 'עבור לצ׳אט' : 'Go to Chat'}
                          </button>
                       )}
                    </div>
                  )}
                  <span style={{ fontSize: '0.7rem', color: '#A0A0A0', fontWeight: '500' }}>
                    {isHe ? 'פורסם ב: ' : 'Posted at: '} 
                    {req.created_at ? new Date(req.created_at).toLocaleString(isHe ? 'he-IL' : 'en-US', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '...'}
                  </span>
                </div>
                
                {!req.isOwn && req.status === 'open' && (
                  <button onClick={() => handleOfferHelpClick(req.id)} className="btn-primary" style={{ padding: '0.8rem 1.8rem', fontSize: '1rem', background: 'rgba(138, 99, 210, 0.1)', color: 'var(--primary-color)', border: '1px solid var(--primary-light)', borderRadius: '18px', fontWeight: 'bold' }}>
                    {isHe ? 'הצע/י עזרה' : 'Offer Help'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
