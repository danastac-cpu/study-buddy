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
             return `${d.getDate()}/${d.getMonth() + 1}`;
           } catch(e) { return ds; }
        };

        return {
          id: r.id,
          avatarBase: r.profiles?.avatar_base || 'brain',
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
          user_id: r.requester_id
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

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  if (!isReady) return null;

  const handleOfferHelpClick = async (postId: string) => {
    if (!userId) return;
    const { error } = await supabase.from('help_requests').update({ status: 'pending', helper_id: userId }).eq('id', postId);
    if (!error) {
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
    <div className="app-wrapper" style={{ direction: isHe ? 'rtl' : 'ltr', background: '#F9F7FF' }}>
      
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

        <ul style={{ listStyle: 'none', padding: 0 }}>
          <li style={{ marginBottom: '1rem' }}>
            <Link href="/help/create" className="btn-primary" style={{ width: '100%', borderRadius: '20px', padding: '1rem', background: 'linear-gradient(135deg, #A78BFA, #8B5CF6)' }}>
              {isHe ? 'בקשת עזרה חדשה 🙋' : 'Request New Help 🙋'}
            </Link>
          </li>
        </ul>
      </nav>
      
      <main className="main-content" style={{ padding: '2rem' }}>
        <header style={{ marginBottom: '2.5rem' }}>
          <h1 style={{ fontSize: '2.8rem', color: 'var(--primary-dark)', fontFamily: '"DynaPuff", cursive' }}>
            {isHe ? 'בקשות עזרה' : 'Help Requests'}
          </h1>
        </header>

        {/* Anonymity Banner Restored */}
        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '25px', marginBottom: '2.5rem', display: 'flex', alignItems: 'center', gap: '1.2rem', boxShadow: '0 8px 30px rgba(0,0,0,0.03)' }}>
          <span style={{ fontSize: '2rem' }}>🔒</span>
          <p style={{ margin: 0, fontSize: '0.95rem', color: '#666', fontWeight: '600', lineHeight: '1.6' }}>
              {isHe 
                ? 'מרכז העזרה הוא מקום בטוח להתייעץ באנונימיות מוחלטת. הפרטים האישיים והשמות שלכם ייחשפו רק ברגע שתחליטו לאשר עזרה ותעברו לצאט פרטי אחד על אחד.' 
                : 'The Help Center is an anonymous safe space. Your personal details and names will be revealed only when you decide to approve help and start a 1-on-1 private chat.'}
          </p>
        </div>

        {/* Filters */}
        <div style={{ 
          display: 'flex', gap: '1rem', marginBottom: '3rem', flexWrap: 'wrap', 
          background: 'white', padding: '1.5rem', borderRadius: '30px', 
          boxShadow: '0 10px 25px rgba(0,0,0,0.03)' 
        }}>
          <div style={{ flex: 1, minWidth: '240px' }}>
            <input 
              type="text" 
              className="input-field" 
              style={{ borderRadius: '15px', background: '#FDFBFF', border: '1px solid #EEE' }}
              placeholder={isHe ? 'חפש קורס...' : 'Search course...'} 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select className="input-field" style={{ width: '180px', borderRadius: '15px', background: '#FDFBFF', border: '1px solid #EEE' }} value={filterMajor} onChange={(e) => setFilterMajor(e.target.value)}>
            <option value="All">{isHe ? 'כל החוגים' : 'All Majors'}</option>
            {Object.entries(t.degrees).map(([k, v]) => (
              <option key={k} value={k}>{v as string}</option>
            ))}
          </select>
          <select className="input-field" style={{ width: '120px', borderRadius: '15px', background: '#FDFBFF', border: '1px solid #EEE' }} value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
            <option value="All">{isHe ? 'כל השנים' : 'All Years'}</option>
            {Object.entries(t.years).map(([k, v]) => (
              <option key={k} value={k}>{v as string}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '2.5rem' }}>
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
                display: 'flex', flexDirection: 'column', padding: '2.2rem',
                borderRadius: '35px', background: 'white',
                boxShadow: req.urgencyRaw === 'today' ? '0 0 25px rgba(244, 67, 54, 0.4)' : '0 15px 45px rgba(138, 99, 210, 0.06)',
                position: 'relative',
                border: req.urgencyRaw === 'today' ? '2.5px solid rgba(244, 67, 54, 0.25)' : '1px solid rgba(0,0,0,0.02)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem', marginBottom: '1.5rem' }}>
                <ScienceAvatar avatarId={req.avatarBase} avatarFile={`${req.avatarBase}.png`} accessory={null} size={65} backgroundColor="#F3F0FF" />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <p style={{ fontWeight: '900', margin: 0, fontSize: '1.4rem', color: 'var(--primary-dark)', fontFamily: '"DynaPuff", cursive' }}>{req.nickname}</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0.3rem 0 0 0', fontWeight: '800' }}>
                    {req.degree} • {req.year}
                  </p>
                </div>
              </div>

              <div style={{ flex: 1, marginBottom: '2rem' }}>
                <div style={{ display: 'flex', gap: '0.8rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                  <span style={{ background: '#F5F3FF', padding: '0.5rem 1rem', borderRadius: '15px', fontSize: '0.85rem', fontWeight: '900', color: 'var(--primary-color)' }}>
                    📚 {req.course}
                  </span>
                  {req.duration && (
                    <span style={{ background: '#F0FDF4', color: '#166534', padding: '0.5rem 1rem', borderRadius: '15px', fontSize: '0.85rem', fontWeight: '900' }}>
                      ⏱️ {req.duration}
                    </span>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ 
                      background: req.urgencyRaw === 'today' ? '#FFEDED' : (req.urgencyRaw === 'this_week' ? '#000' : '#F0FDF4'), 
                      color: req.urgencyRaw === 'today' ? '#CC0000' : (req.urgencyRaw === 'this_week' ? '#FFD700' : '#166534'), 
                      padding: '0.5rem 1rem', borderRadius: '15px', fontSize: '0.85rem', fontWeight: '900',
                      textDecoration: req.urgencyRaw === 'this_week' ? 'underline' : 'none'
                    }}>
                      {req.urgencyRaw === 'today' ? '🚨 ' : '📅 '} {req.urgencyLabel}
                    </span>
                    {req.urgencyRaw === 'this_week' && req.displayDate && (
                      <span style={{ fontWeight: '900', color: '#000', fontSize: '0.9rem', borderBottom: '2px solid #000' }}>
                        {req.displayDate}
                      </span>
                    )}
                  </div>
                </div>

                <p style={{ lineHeight: '1.7', margin: 0, fontSize: '1.1rem', color: '#555' }}>{req.content}</p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #F3F0FF', paddingTop: '1.5rem' }}>
                {req.isOwn ? (
                  <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                    <button onClick={() => router.push(`/help/edit/${req.id}`)} style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}>
                        {isHe ? 'עריכה' : 'Edit'}
                    </button>
                    <button onClick={() => handleDeleteRequest(req.id)} style={{ background: 'none', border: 'none', color: '#FF7676', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}>
                        {isHe ? 'מחיקה' : 'Delete'}
                    </button>
                  </div>
                ) : (
                  <div style={{ width: '1px' }}></div>
                )}
                
                {!req.isOwn && req.status === 'open' && (
                  <button onClick={() => handleOfferHelpClick(req.id)} className="btn-primary" style={{ padding: '0.8rem 1.8rem', fontSize: '1rem', background: '#34D399', borderRadius: '18px' }}>
                    {isHe ? 'הצע/י עזרה' : 'Offer Help'}
                  </button>
                )}
                
                {req.status === 'pending' && (
                  <div style={{ padding: '0.8rem 1.2rem', background: '#F5F3FF', borderRadius: '15px', color: 'var(--primary-dark)', fontWeight: 'bold', fontSize: '0.95rem' }}>
                    {isHe ? '✅ הצעה הוגשה' : '✅ Offer Sent'}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
