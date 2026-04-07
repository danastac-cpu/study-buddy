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

  return (
    <div className="app-wrapper" style={{ direction: isHe ? 'rtl' : 'ltr' }}>
      
      <nav className="sidebar">
        <Link href="/dashboard" className="btn-secondary" style={{ marginBottom: '2rem', padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
          {isHe ? '← חזרה לחשבון' : '← Back to Account'}
        </Link>
        <h2 style={{ fontSize: '2.5rem', marginBottom: '0.5rem', fontFamily: '"DynaPuff", "Fredoka", "Outfit", cursive', color: 'var(--primary-color)' }}>
          {isHe ? 'מרכז עזרה' : 'Help Center'}
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>
          {isHe ? 'כאן פונים לחברים כדי למצוא עזרה ושיעורים פרטיים 1-על-1.' : 'Here you can reach out for 1-on-1 tutoring and help.'}
        </p>

        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <li>
            <Link href="/help/create" className="btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
              {isHe ? 'בקשת עזרה חדשה 🙋' : 'Request New Help 🙋'}
            </Link>
          </li>
        </ul>
      </nav>
      
      <main className="main-content">
        <header style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '2.5rem', margin: 0, color: 'var(--primary-color)', fontFamily: '"DynaPuff", "Fredoka", "Outfit", cursive' }}>
            {isHe ? 'בקשות עזרה (אנונימי 🔒)' : 'Help Requests (Anonymous 🔒)'}
          </h1>
        </header>

        {/* Anonymity Banner */}
        <div style={{ background: 'rgba(76, 175, 80, 0.08)', border: '1px solid rgba(76, 175, 80, 0.2)', padding: '1.5rem', borderRadius: '12px', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '1.5rem' }}>🔒</span>
          <p style={{ margin: 0, fontSize: '0.95rem', color: '#2E7D32', fontWeight: '500', lineHeight: '1.5' }}>
              {isHe 
                ? 'מרכז העזרה הוא מקום בטוח להתייעץ באנונימיות מוחלטת. הפרטים האישיים והשמות שלכם ייחשפו רק ברגע שתחליטו לאשר עזרה ותעברו לצאט פרטי אחד על אחד.' 
                : 'The Help Center is an anonymous safe space. Your personal details and names will be revealed only when you decide to approve help and start a 1-on-1 private chat.'}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {requests.map((req) => (
            <div 
              key={req.id} 
              className="glass-card" 
              style={{ 
                display: 'flex', flexDirection: 'column', padding: '1.5rem',
                border: req.urgency.includes('דחוף') || req.urgency.includes('Urgent') ? '2px solid rgba(244, 67, 54, 0.5)' : undefined,
                boxShadow: req.urgency.includes('דחוף') || req.urgency.includes('Urgent') ? '0 0 15px rgba(244, 67, 54, 0.3)' : undefined
              }}
            >
              
              {/* Horizontal Header: Avatar on side, Info beside it */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                <ScienceAvatar avatarId={req.avatarBase} avatarFile={`${req.avatarBase}.png`} accessory={null} size={60} backgroundColor="var(--primary-light)" />
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <p style={{ fontWeight: '800', margin: 0, fontSize: '1.2rem', color: 'var(--primary-dark)' }}>{req.nickname}</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.2rem 0 0 0', fontWeight: '500' }}>
                    {req.degree} • {req.year}
                  </p>
                </div>
              </div>

              {/* Content */}
              <div style={{ flex: 1, marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                  <span style={{ background: 'var(--primary-light)', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--primary-dark)' }}>
                    📚 {req.course}
                  </span>
                  <span style={{ background: 'rgba(0,188,212,0.1)', color: '#0097A7', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                    ⏱️ {req.duration}
                  </span>
                  <span style={{ background: req.urgency.includes('דחוף') || req.urgency.includes('Urgent') ? '#ffe0e0' : (req.urgency.includes('השבוע') || req.urgency.includes('Week') ? '#fff3e0' : '#e0ffe0'), color: req.urgency.includes('דחוף') || req.urgency.includes('Urgent') ? '#cc0000' : (req.urgency.includes('השבוע') || req.urgency.includes('Week') ? '#e65100' : '#008000'), padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                    {req.urgency.includes('דחוף') || req.urgency.includes('Urgent') ? '🚨 ' : '📅 '} {req.urgency}
                  </span>
                </div>
                {editingId === req.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                        <textarea 
                            className="input-field" 
                            rows={4} 
                            value={editContent} 
                            onChange={(e) => setEditContent(e.target.value)}
                            style={{ width: '100%', fontSize: '1rem', lineHeight: '1.5' }}
                        />
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button onClick={() => handleSaveEdit(req.id)} className="btn-primary" style={{ padding: '0.4rem 1.2rem', fontSize: '0.85rem' }}>{isHe ? 'שמור שינויים' : 'Save Changes'}</button>
                            <button onClick={() => setEditingId(null)} className="btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}>{isHe ? 'ביטול' : 'Cancel'}</button>
                        </div>
                    </div>
                ) : (
                    <p style={{ lineHeight: '1.6', margin: 0, fontSize: '1rem' }}>
                        {req.content}
                    </p>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: '1rem', marginTop: 'auto' }}>
                {req.isOwn ? (
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <button 
                        onClick={() => handleStartEdit(req)}
                        style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold' }}
                    >
                        {isHe ? 'ערוך תוכן' : 'Edit Content'}
                    </button>
                    <button 
                        onClick={() => handleDeleteRequest(req.id)}
                        style={{ background: 'none', border: 'none', color: '#F44336', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold' }}
                    >
                        {isHe ? 'מחק בקשה שלי' : 'Delete My Request'}
                    </button>
                  </div>
                ) : (
                  <div style={{ width: '100px' }}></div> // Spacer
                )}
                
                {/* Status Messages */}
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  {req.isOwn && req.status === 'pending' && (
                    <div style={{ padding: '0.6rem 1rem', background: 'rgba(255, 152, 0, 0.1)', borderRadius: '12px', border: '1px solid #ff9800', color: '#e65100', fontWeight: 'bold', fontSize: '0.9rem' }}>
                      {isHe ? 'נרשמו לעזור לך! מחכים לאישור שלך.' : "Someone signed up to help! Waiting for your approval."}
                    </div>
                  )}
                  
                  {!req.isOwn && req.status === 'pending' && (
                    <div style={{ padding: '0.6rem 1rem', background: 'rgba(138, 99, 210, 0.08)', borderRadius: '12px', border: '1px solid var(--primary-light)', color: 'var(--primary-dark)', fontWeight: 'bold', fontSize: '0.9rem' }}>
                      {isHe ? 'נרשמת לעזור, מחכים לאישור המשתמש השני' : 'Registered to help, waiting for approval'}
                    </div>
                  )}
                  
                  {req.status === 'offered' && (
                    <span style={{ fontSize: '0.9rem', color: '#4CAF50', fontWeight: 'bold' }}>
                      {isHe ? 'העזרה אושרה! הצ׳אט פעיל' : 'Help Approved! Chat is active'}
                    </span>
                  )}
                </div>

                {!req.isOwn && req.status === 'open' && (
                  <button 
                    onClick={() => handleOfferHelpClick(req.id)}
                    className="btn-primary" 
                    style={{ padding: '0.5rem 1.5rem', fontSize: '0.95rem', background: '#4CAF50' }}
                  >
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
