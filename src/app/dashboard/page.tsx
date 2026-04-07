"use client"
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/hooks/useLanguage';
import { ScienceAvatar, ACCESSORIES, AVATARS, PASTEL_COLORS } from '@/components/ScienceAvatar';
import { translations } from '@/lib/i18n';
import { emailService } from '@/lib/emailService';
import { OnboardingTour } from '@/components/OnboardingTour';

export default function DashboardPage() {
  const router = useRouter();
  const { language, isReady, setLanguage } = useLanguage();
  const t = translations[language];
  const isHe = language === 'he';
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);

  // Avatar Studio Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [tempAvatarId, setTempAvatarId] = useState('');
  const [tempAccessoryId, setTempAccessoryId] = useState('');
  const [tempColor, setTempColor] = useState('');
  const [activeCategory, setActiveCategory] = useState('none');

  // Real Profile State
  const [profile, setProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [ownHelpCount, setOwnHelpCount] = useState(0);
  const [acceptedGroups, setAcceptedGroups] = useState<any[]>([]);
  const [activeHelpSessions, setActiveHelpSessions] = useState<any[]>([]);

  // Notifications / Updates State
  const [notifications, setNotifications] = useState<any[]>([]);
  const [userLatestPost, setUserLatestPost] = useState<any>(null);
  const [showTour, setShowTour] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) {
        router.push('/');
        return;
      }

      // 1. Fetch Profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authData.user.id)
        .single();
      
      if (profileData) {
        setProfile(profileData);
        const tourResetKey = 'studybuddy_tour_reset_v7';
        if (!localStorage.getItem(tourResetKey)) {
           setShowTour(true);
           localStorage.setItem(tourResetKey, 'true');
        } else if(!profileData.has_completed_tour) {
           setShowTour(true);
        }
      }

      // 2. Fetch Updates/Notifications
      const { data: updatesData } = await supabase
        .from('updates')
        .select('*')
        .eq('user_id', authData.user.id)
        .order('created_at', { ascending: false });
      
      let realNotifs: any[] = [];
      if (updatesData) {
        realNotifs = updatesData.map(u => ({
          id: u.id,
          type: u.type,
          title_he: u.title_he,
          title_en: u.title_en,
          content_he: u.content_he,
          content_en: u.content_en,
          request_id: u.request_id,
          group_id: u.group_id
        }));
      }

      // 3. Fetch Accepted Groups (Approved Enrollment OR Managed)
      const { data: enrolled } = await supabase
        .from('group_enrollments')
        .select('*, study_groups(*)')
        .eq('user_id', authData.user.id)
        .eq('status', 'approved');
      
      const { data: managed } = await supabase
        .from('study_groups')
        .select('*')
        .eq('manager_id', authData.user.id);

      const allGroups = [
        ...(enrolled?.map(e => e.study_groups) || []),
        ...(managed || [])
      ].filter((v, i, a) => v && a.findIndex(t => t && t.id === v.id) === i); // Unique

      setAcceptedGroups(allGroups.map(g => ({
        id: g.id,
        title: g.title,
        details: g.session_time
      })));

      // 4. Fetch Active Help Sessions (1-on-1 Chats)
      const { data: helpData } = await supabase
        .from('help_requests')
        .select('*, profiles:profiles!requester_id(alias, avatar_base, avatar_bg), helper_profile:profiles!helper_id(alias, avatar_base, avatar_bg)')
        .or(`requester_id.eq.${authData.user.id},helper_id.eq.${authData.user.id}`)
        .not('status', 'eq', 'resolved');
 
      if (helpData) {
        const mySessions = helpData.map(h => {
          const isRequester = h.requester_id === authData.user.id;
          const otherParty = isRequester ? h.helper_profile : h.profiles;
          return {
            id: h.id,
            topic: h.course,
            otherName: otherParty?.alias || (isHe ? 'ממתין לעוזר...' : 'Waiting for helper...'),
            isRequester
          };
        });
        setActiveHelpSessions(mySessions);
        setOwnHelpCount(mySessions.filter(s => s.isRequester).length);
      }

      // 5. Expired Check
      const expiredNotifications: any[] = [];
      if (helpData) {
        const userOwnRequests = helpData.filter(h => h.requester_id === authData.user.id && h.status === 'open');
        const now = new Date();
        
        userOwnRequests.forEach(req => {
          let isExpired = false;
          const createdAt = new Date(req.created_at);
          
          if (req.urgency_level === 'today') {
            if (now.getTime() - createdAt.getTime() > 24 * 60 * 60 * 1000) isExpired = true;
          } else if (req.urgency_level === 'this_week') {
            const dateMatch = req.topic.match(/\[Date:\s*(\d{4}-\d{2}-\d{2})\]/);
            if (dateMatch) {
              const targetDate = new Date(dateMatch[1]);
              if (now > targetDate) isExpired = true;
            }
          }
          
          if (isExpired) {
            expiredNotifications.push({
              id: `expired-${req.id}`,
              type: 'expired',
              request_id: req.id,
              title_he: 'הבקשה שלך פגה תוקף ⏳',
              title_en: 'Your request has expired ⏳',
              content_he: `הזמן שביקשת לעזרה ב${req.course} עבר. האם ברצונך לעדכן זמנים או למחוק את הבקשה?`,
              content_en: `The time for your ${req.course} help request has passed. Would you like to reschedule or delete it?`
            });
          }
        });
      }

      setNotifications([...realNotifs, ...expiredNotifications]);
      setIsLoading(false);
    };

    fetchData();

    const channel = supabase.channel('dashboard_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'updates' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'help_requests' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_enrollments' }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isHe, router]);

  const handleWaitlistAccept = async (notifId: string, groupId: string) => {
    await supabase.from('updates').delete().eq('id', notifId);
    const { data: authData } = await supabase.auth.getUser();
    if (authData?.user) {
      await supabase.from('group_enrollments').update({ status: 'approved' }).eq('group_id', groupId).eq('user_id', authData.user.id);
    }
    alert(isHe ? 'הצטרפת לקבוצה!' : 'Joined group!');
    router.push(`/groups/${groupId}`);
  };

  const handleWaitlistDecline = async (notifId: string) => {
    if (!confirm(isHe ? 'בטוח/ה?' : 'Sure?')) return;
    await supabase.from('updates').delete().eq('id', notifId);
    setNotifications(prev => prev.filter(n => n.id !== notifId));
  };

  const handleDeclineUpdate = async (notifId: string, requestId?: string) => {
    if (!confirm(isHe ? 'בטוח/ה?' : 'Sure?')) return;
    if (!notifId.startsWith('expired-')) await supabase.from('updates').delete().eq('id', notifId);
    setNotifications(prev => prev.filter(n => n.id !== notifId));
    if (requestId) {
      await supabase.from('help_requests').delete().eq('id', requestId);
      alert(isHe ? 'הבקשה נמחקה!' : 'Request deleted!');
    }
  };

  const handleApproveHelpAndChat = async (notifId: string, requestId: string) => {
    await supabase.from('help_requests').update({ status: 'offered' }).eq('id', requestId);
    await supabase.from('updates').delete().eq('id', notifId);
    router.push(`/chat/${requestId}?role=requester`);
  };

  const handleDismissNotification = async (notifId: string) => {
    await supabase.from('updates').delete().eq('id', notifId);
    setNotifications(prev => prev.filter(n => n.id !== notifId));
  };

  const openEditModal = () => {
    if (!profile) return;
    setTempAvatarId(profile.avatar_base || 'brain');
    setTempAccessoryId(profile.avatar_accessory || 'none');
    setTempColor(profile.avatar_bg || '#E0C8F0');
    setIsEditModalOpen(true);
  };

  const handleSaveAvatar = async () => {
    const { data: authData } = await supabase.auth.getUser();
    if (authData?.user) {
      const { error } = await supabase.from('profiles').update({
        avatar_base: tempAvatarId,
        avatar_accessory: tempAccessoryId,
        avatar_bg: tempColor
      }).eq('id', authData.user.id);
      if (!error) {
        setProfile((prev: any) => ({ ...prev, avatar_base: tempAvatarId, avatar_accessory: tempAccessoryId, avatar_bg: tempColor }));
      }
    }
    setIsEditModalOpen(false);
  };

  if (!isReady) return null;

  return (
    <div className="app-wrapper" style={{ direction: isHe ? 'rtl' : 'ltr' }}>
      
      {/* DEBUG BANNER - COMFIRM SYNC */}
      <div style={{ 
          background: '#8A63D2', color: 'white', padding: '10px', textAlign: 'center', 
          borderRadius: '8px', marginBottom: '20px', fontWeight: 'bold', fontSize: '1.2rem',
          boxShadow: '0 4px 12px rgba(138, 99, 210, 0.3)', border: '2px solid white'
      }}>
        🚀 עובדים על הגרסה העדכנית (v1.2.5) - אם את רואה את זה, הסנכרון עובד!
      </div>
      {showTour && <OnboardingTour onComplete={() => setShowTour(false)} />}
      
      {isEditModalOpen && (
        <div className="modal-overlay" onClick={() => setIsEditModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>{isHe ? 'עריכת דמות' : 'Edit Avatar'}</h2>
            <div style={{ display: 'flex', gap: '2rem', justifyContent: 'center', marginBottom: '2rem' }}>
              <div style={{ background: tempColor, padding: '1rem', borderRadius: '1rem' }}>
                <ScienceAvatar avatarId={tempAvatarId} avatarFile={`${tempAvatarId}.png`} accessory={ACCESSORIES.find(a => a.id === tempAccessoryId) || null} backgroundColor={tempColor} size={120} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
               <button onClick={() => setIsEditModalOpen(false)} className="btn-secondary">{isHe ? 'ביטול' : 'Cancel'}</button>
               <button onClick={handleSaveAvatar} className="btn-primary">{isHe ? 'שמור' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      <nav className="sidebar">
        <div style={{ textAlign: 'center', marginBottom: '2rem', borderBottom: '1px solid var(--primary-light)', paddingBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.8rem', color: 'var(--primary-color)', fontFamily: '"DynaPuff", cursive' }}>StudyBuddy</h2>
          <div onClick={openEditModal} style={{ cursor: 'pointer', display: 'inline-block', position: 'relative' }}>
             <ScienceAvatar avatarId={profile?.avatar_base || 'brain'} avatarFile={`${profile?.avatar_base || 'brain'}.png`} accessory={ACCESSORIES.find(a => a.id === profile?.avatar_accessory) || null} backgroundColor={profile?.avatar_bg || 'var(--primary-light)'} size={80} />
             <div style={{ position: 'absolute', bottom: 0, right: 0, background: 'white', borderRadius: '50%', padding: '2px' }}>✏️</div>
          </div>
          <p style={{ fontWeight: 'bold', margin: '0.5rem 0 0 0' }}>{profile?.alias}</p>
        </div>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          <li><Link href="/dashboard" className="btn-secondary" style={{ width: '100%', marginBottom: '0.5rem', background: 'var(--primary-light)' }}>{isHe ? 'אזור אישי' : 'Dashboard'}</Link></li>
          <li><Link href="/groups" className="btn-secondary" style={{ width: '100%', marginBottom: '0.5rem' }}>{isHe ? 'קבוצות למידה' : 'Study Groups'}</Link></li>
          <li><Link href="/help" className="btn-secondary" style={{ width: '100%', marginBottom: '0.5rem' }}>{isHe ? 'מרכז עזרה' : 'Help Center'}</Link></li>
          <li><Link href="/feed" className="btn-secondary" style={{ width: '100%', marginBottom: '0.5rem' }}>{isHe ? 'פיד קהילתי' : 'Community Feed'}</Link></li>
        </ul>
      </nav>

      <main className="main-content">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontFamily: '"DynaPuff", cursive' }}>{isHe ? `שלום ${profile?.real_first_name || ''} 💜` : `Hello ${profile?.real_first_name || ''}`}</h1>
          <button onClick={() => supabase.auth.signOut()} className="btn-secondary">{isHe ? 'התנתק' : 'Logout'}</button>
        </header>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '3rem' }}>
          <div className="glass-card">
            <h4 style={{ margin: 0, color: 'var(--text-muted)' }}>{isHe ? 'קבוצות פעילות' : 'Active Groups'}</h4>
            <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: 0 }}>{acceptedGroups.length}</p>
          </div>
          <div className="glass-card">
            <h4 style={{ margin: 0, color: 'var(--text-muted)' }}>{isHe ? 'בקשות עזרה' : 'My Help Requests'}</h4>
            <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: 0 }}>{ownHelpCount}</p>
          </div>
          <div className="glass-card" style={{ background: 'var(--primary-color)', color: 'white' }}>
            <h4 style={{ margin: 0, opacity: 0.8 }}>{isHe ? 'כוכבי עזרה' : 'Help Stars'}</h4>
            <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: 0 }}>{profile?.helper_stars || 0} ⭐</p>
          </div>
        </section>

        <section style={{ marginBottom: '3rem' }}>
          <h3>{isHe ? 'מפגשים וצ׳אטים קרובים' : 'Upcoming Sessions'}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {acceptedGroups.map(g => (
              <Link key={g.id} href={`/groups/${g.id}`} className="glass-card" style={{ display: 'flex', textDecoration: 'none', color: 'inherit', alignItems: 'center', gap: '1rem', borderRight: isHe ? '5px solid var(--primary-color)' : 'none', borderLeft: !isHe ? '5px solid var(--primary-color)' : 'none' }}>
                <div style={{ fontSize: '1.5rem' }}>📚</div>
                <div style={{ flex: 1 }}>
                  <h4 style={{ margin: 0 }}>{g.title}</h4>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{g.details}</p>
                </div>
                <div>&rarr;</div>
              </Link>
            ))}
            {activeHelpSessions.map(s => (
              <Link key={s.id} href={`/chat/${s.id}`} className="glass-card" style={{ display: 'flex', textDecoration: 'none', color: 'inherit', alignItems: 'center', gap: '1rem', borderRight: isHe ? '5px solid #4CAF50' : 'none', borderLeft: !isHe ? '5px solid #4CAF50' : 'none' }}>
                <div style={{ fontSize: '1.5rem' }}>🤝</div>
                <div style={{ flex: 1 }}>
                  <h4 style={{ margin: 0 }}>{s.topic} ({s.isRequester ? (isHe ? 'לבקשתך' : 'Your Request') : (isHe ? 'את/ה עוזר/ת' : 'Helping')})</h4>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{isHe ? 'עם' : 'With'} {s.otherName}</p>
                </div>
                <div>&rarr;</div>
              </Link>
            ))}
          </div>
        </section>

        {notifications.length > 0 && (
          <section>
            <h3>{isHe ? 'עדכונים חשובים' : 'Important Updates'}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {notifications.map(n => (
                <div key={n.id} className="glass-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'white', border: '1px solid var(--primary-light)' }}>
                  <div style={{ flex: 1 }}>
                    <h5 style={{ margin: 0 }}>{isHe ? n.title_he : n.title_en}</h5>
                    <p style={{ margin: 0, fontSize: '0.9rem' }}>{isHe ? n.content_he : n.content_en}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {n.type === 'approval' && (
                      <>
                        <button onClick={() => handleApproveHelpAndChat(n.id, n.request_id)} className="btn-primary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}>{isHe ? 'אשר חשיפת פרטים ולך לצאט!' : 'Approve & Chat'}</button>
                        <button onClick={() => handleDeclineUpdate(n.id, n.request_id)} className="btn-secondary" style={{ fontSize: '0.8rem', color: 'red' }}>{isHe ? 'דחה' : 'Decline'}</button>
                      </>
                    )}
                    {n.type === 'star-received' && <button onClick={() => handleDismissNotification(n.id)} className="btn-primary" style={{ fontSize: '0.8rem' }}>{isHe ? 'אשר' : 'Confirm'}</button>}
                    {n.type === 'helper-approved' && <Link href={`/chat/${n.request_id}`} className="btn-primary" style={{ fontSize: '0.8rem', textDecoration: 'none' }}>{isHe ? 'לך לצאט' : 'Go to Chat'}</Link>}
                    {n.type === 'waitlist-open' && (
                      <>
                        <button onClick={() => handleWaitlistAccept(n.id, n.group_id)} className="btn-primary" style={{ fontSize: '0.8rem' }}>{isHe ? 'הצטרף' : 'Join'}</button>
                        <button onClick={() => handleWaitlistDecline(n.id)} className="btn-secondary" style={{ fontSize: '0.8rem' }}>{isHe ? 'דחה' : 'Decline'}</button>
                      </>
                    )}
                    {n.type === 'expired' && (
                      <>
                         <button onClick={() => setShowRescheduleModal(true)} className="btn-primary" style={{ fontSize: '0.8rem' }}>{isHe ? 'כן, עדכן זמנים' : 'Yes, Update'}</button>
                         <button onClick={() => handleDeclineUpdate(n.id, n.request_id)} className="btn-secondary" style={{ fontSize: '0.8rem' }}>{isHe ? 'לא, מחק בקשה' : 'No, Delete Request'}</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {showRescheduleModal && (
        <div className="modal-overlay" onClick={() => setShowRescheduleModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>{isHe ? 'עדכון זמנים' : 'Update Times'}</h3>
            <p>{isHe ? 'בחר מועד חדש לבקשה שלך' : 'Select a new time for your request'}</p>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
              <input type="date" className="input-field" />
              <input type="time" className="input-field" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
              <button onClick={() => setShowRescheduleModal(false)} className="btn-secondary">{isHe ? 'ביטול' : 'Cancel'}</button>
              <button onClick={() => { setShowRescheduleModal(false); alert('Done'); }} className="btn-primary">{isHe ? 'שמור' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
