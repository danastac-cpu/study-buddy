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
          return `${d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })}`;
        }
      } catch (e) { /* fallback */ }
    }
    return dateStr;
  };

  const getUrgencyStars = (urgency: string) => {
    if (urgency.includes('דחוף') || urgency.includes('Urgent') || urgency.includes('היום') || urgency.includes('Today')) {
       return '⭐️⭐️⭐️';
    }
    if (urgency.includes('השבוע') || urgency.includes('Week')) {
       return '⭐️⭐️';
    }
    return '⭐️';
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
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2.5rem' }}>
          {isHe ? 'מרחב בטוח למציאת עזרה בלימודים.' : 'A safe space to find academic help.'}
        </p>

        <Link href="/help/create" className="btn-primary" style={{ width: '100%', borderRadius: '20px', padding: '1rem', background: 'linear-gradient(135deg, #A78BFA, #8B5CF6)' }}>
          {isHe ? 'בקשת עזרה חדשה 🙋' : 'Request New Help 🙋'}
        </Link>
      </nav>
      
      <main className="main-content" style={{ padding: '2rem' }}>
        <header style={{ marginBottom: '2.5rem' }}>
          <h1 style={{ fontSize: '2.5rem', color: 'var(--primary-dark)', fontFamily: '"DynaPuff", cursive' }}>
            {isHe ? 'בקשות עזרה (אנונימי 🔒)' : 'Help Requests (Anonymous 🔒)'}
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
              return (matchesSearch || !searchQuery) && matchesMajor && matchesYear;
            })
            .map((req) => (
            <div 
              key={req.id} 
              className="glass-card" 
              style={{ 
                padding: '2rem', borderRadius: '35px', background: 'white', border: 'none',
                boxShadow: '0 15px 35px rgba(138, 99, 210, 0.08)', position: 'relative',
                display: 'flex', flexDirection: 'column', height: '100%'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.2rem' }}>
                <ScienceAvatar avatarId={req.avatarBase} avatarFile={`${req.avatarBase}.png`} accessory={null} size={55} backgroundColor="#F3F0FF" />
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '900' }}>{req.nickname}</h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{getUrgencyStars(req.urgency)}</span>
                </div>
              </div>

              <div style={{ marginBottom: '1.2rem' }}>
                 <span style={{ background: '#F0EFFF', color: 'var(--primary-color)', padding: '0.4rem 0.8rem', borderRadius: '12px', fontSize: '0.8rem', fontWeight: '800' }}>
                   📚 {req.course}
                 </span>
              </div>

              <div style={{ flex: 1, marginBottom: '1.5rem' }}>
                <p style={{ lineHeight: '1.6', fontSize: '1rem', color: '#444' }}>{req.content}</p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #F0F0F0', paddingTop: '1.2rem' }}>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>
                      {t.degrees[req.degree as keyof typeof t.degrees] || req.degree}
                    </span>
                    {req.dateStr && req.dateStr !== 'TBD' && (
                      <span style={{ fontSize: '0.85rem', color: 'var(--primary-color)', fontWeight: '900' }}>
                        📅 {prettyDate(req.dateStr)}
                      </span>
                    )}
                 </div>

                 {req.isOwn ? (
                    <button onClick={() => handleDeleteRequest(req.id)} style={{ color: '#FF7676', border: 'none', background: 'none', fontSize: '0.85rem', fontWeight: 'bold', cursor: 'pointer' }}>
                      {isHe ? 'מחק' : 'Delete'}
                    </button>
                 ) : req.status === 'open' && (
                    <button onClick={() => handleOfferHelpClick(req.id)} className="btn-primary" style={{ padding: '0.6rem 1.2rem', borderRadius: '15px', fontSize: '0.9rem' }}>
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
