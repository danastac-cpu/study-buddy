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
        degree: (t.degrees[r.profiles?.degree as keyof typeof t.degrees] as string) || r.profiles?.degree || 'Student',
        year: (t.years[r.profiles?.year_of_study as keyof typeof t.years] as string) || (t.years[r.profiles?.year as keyof typeof t.years] as string) || '',
        content: r.topic,
        status: r.status,
        urgency: r.urgency_level === 'today' ? (isHe ? 'היום!' : 'Today!') : (r.urgency_level === 'this_week' ? (isHe ? 'השבוע' : 'This Week') : (isHe ? 'גמיש' : 'Flexible')),
        urgencyRaw: r.urgency_level,
        duration: r.duration_mins ? `${r.duration_mins}m` : '', 
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

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

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

  const handleStartEdit = (req: any) => {
    setEditingId(req.id);
    setEditContent(req.content);
  };

  const handleSaveEdit = async (postId: string) => {
    const { error } = await supabase.from('help_requests').update({ topic: editContent }).eq('id', postId);
    if (!error) {
        fetchData();
        setEditingId(null);
    }
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

        <ul style={{ listStyle: 'none', padding: 0 }}>
          <li style={{ marginBottom: '1rem' }}>
            <Link href="/help/create" className="btn-primary" style={{ width: '100%', borderRadius: '20px', padding: '1rem', background: 'linear-gradient(135deg, #A78BFA, #8B5CF6)' }}>
              {isHe ? 'בקשת עזרה חדשה 🙋' : 'Request New Help 🙋'}
            </Link>
          </li>
        </ul>
      </nav>
      
      <main className="main-content" style={{ padding: '2rem' }}>
        <header style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '2.5rem', margin: 0, color: 'var(--primary-color)', fontFamily: '"DynaPuff", cursive' }}>
            {isHe ? 'בקשות עזרה' : 'Help Requests'}
          </h1>
        </header>

        {/* Anonymity Banner Restored */}
        <div style={{ background: 'rgba(76, 175, 80, 0.08)', border: '1px solid rgba(76, 175, 80, 0.2)', padding: '1.5rem', borderRadius: '15px', marginBottom: '2.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '2rem' }}>🔒</span>
          <p style={{ margin: 0, fontSize: '0.95rem', color: '#2E7D32', fontWeight: '600', lineHeight: '1.5' }}>
              {isHe 
                ? 'מרכז העזרה הוא מקום בטוח להתייעץ באנונימיות מוחלטת. הפרטים האישיים והשמות שלכם ייחשפו רק ברגע שתחליטו לאשר עזרה ותעברו לצאט פרטי אחד על אחד.' 
                : 'The Help Center is an anonymous safe space. Your personal details and names will be revealed only when you decide to approve help and start a 1-on-1 private chat.'}
          </p>
        </div>

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
          <select className="input-field" style={{ width: '180px', borderRadius: '15px' }} value={filterMajor} onChange={(e) => setFilterMajor(e.target.value)}>
            <option value="All">{isHe ? 'כל החוגים' : 'All Majors'}</option>
            {Object.entries(t.degrees).map(([k, v]) => (
              <option key={k} value={k}>{v as string}</option>
            ))}
          </select>
          <select className="input-field" style={{ width: '120px', borderRadius: '15px' }} value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
            <option value="All">{isHe ? 'כל השנים' : 'All Years'}</option>
            {Object.entries(t.years).map(([k, v]) => (
              <option key={k} value={k}>{v as string}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
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
                borderRadius: '35px',
                boxShadow: req.urgencyRaw === 'today' ? '0 0 20px rgba(244, 67, 54, 0.4)' : '0 15px 35px rgba(138, 99, 210, 0.08)',
                position: 'relative',
                border: req.urgencyRaw === 'today' ? '2px solid rgba(244, 67, 54, 0.2)' : 'none'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem', marginBottom: '1.2rem' }}>
                <ScienceAvatar avatarId={req.avatarBase} avatarFile={`${req.avatarBase}.png`} accessory={null} size={65} backgroundColor="#F3F0FF" />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <p style={{ fontWeight: '900', margin: 0, fontSize: '1.3rem', color: 'var(--primary-dark)' }}>{req.nickname}</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0.3rem 0 0 0', fontWeight: '800' }}>
                    {req.degree} • {req.year}
                  </p>
                </div>
              </div>

              <div style={{ flex: 1, marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', gap: '0.8rem', marginBottom: '1.2rem', flexWrap: 'wrap' }}>
                  <span style={{ background: '#F5F3FF', padding: '0.4rem 0.8rem', borderRadius: '12px', fontSize: '0.85rem', fontWeight: '900', color: 'var(--primary-color)' }}>
                    📚 {req.course}
                  </span>
                  <span style={{ background: '#F0FDF4', color: '#166534', padding: '0.4rem 0.8rem', borderRadius: '12px', fontSize: '0.85rem', fontWeight: '900' }}>
                    ⏱️ {req.duration}
                  </span>
                  <span style={{ 
                    background: req.urgencyRaw === 'today' ? '#FFEDED' : (req.urgencyRaw === 'this_week' ? '#FFFBEB' : '#F0FDF4'), 
                    color: req.urgencyRaw === 'today' ? '#CC0000' : (req.urgencyRaw === 'this_week' ? '#B45309' : '#166534'), 
                    padding: '0.4rem 0.8rem', borderRadius: '12px', fontSize: '0.85rem', fontWeight: '900' 
                  }}>
                    {req.urgencyRaw === 'today' ? '🚨 ' : '📅 '} {req.urgency}
                  </span>
                </div>

                {editingId === req.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <textarea className="input-field" rows={4} value={editContent} onChange={(e) => setEditContent(e.target.value)} />
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button onClick={() => handleSaveEdit(req.id)} className="btn-primary" style={{ padding: '0.6rem 1.2rem' }}>{isHe ? 'שמירה' : 'Save'}</button>
                            <button onClick={() => setEditingId(null)} className="btn-secondary">{isHe ? 'ביטול' : 'Cancel'}</button>
                        </div>
                    </div>
                ) : (
                    <p style={{ lineHeight: '1.6', margin: 0, fontSize: '1.05rem', color: '#444' }}>{req.content}</p>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #F3F0FF', paddingTop: '1.2rem' }}>
                {req.isOwn ? (
                  <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                    <button onClick={() => handleStartEdit(req)} style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold' }}>
                        {isHe ? 'ערוך בקשה' : 'Edit'}
                    </button>
                    <button onClick={() => handleDeleteRequest(req.id)} style={{ background: 'none', border: 'none', color: '#FF7676', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold' }}>
                        {isHe ? 'מחק בקשה' : 'Delete'}
                    </button>
                  </div>
                ) : (
                  <div style={{ width: '1px' }}></div>
                )}
                
                {!req.isOwn && req.status === 'open' && (
                  <button onClick={() => handleOfferHelpClick(req.id)} className="btn-primary" style={{ padding: '0.7rem 1.8rem', fontSize: '1rem', background: '#4CAF50' }}>
                    {isHe ? 'הצע/י עזרה' : 'Offer Help'}
                  </button>
                )}
                
                {req.status === 'pending' && (
                  <div style={{ padding: '0.8rem 1.2rem', background: '#F5F3FF', borderRadius: '15px', color: 'var(--primary-dark)', fontWeight: 'bold' }}>
                    {isHe ? 'הצעת עזרה נשלחה! מחכה לאישור.' : 'Offer sent! Awaiting approval.'}
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
