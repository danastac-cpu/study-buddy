"use client"
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/hooks/useLanguage';
import { ScienceAvatar, ACCESSORIES, AVATARS, PASTEL_COLORS } from '@/components/ScienceAvatar';
import { formatDateIsrael, getUrgencyLabel } from '@/lib/dateUtils';
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
  const [allUserHelpRequests, setAllUserHelpRequests] = useState<any[]>([]);
  const [acceptedGroups, setAcceptedGroups] = useState<any[]>([]);
  const [activeHelpSessions, setActiveHelpSessions] = useState<any[]>([]);

  // Notifications / Updates State
  const [notifications, setNotifications] = useState<any[]>([]);
  const [userLatestPost, setUserLatestPost] = useState<any>(null);
  const [showTour, setShowTour] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
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
          // FORCE RESET TOUR FOR TESTING (Using localStorage to prevent re-popups)
          const tourResetKey = 'studybuddy_tour_reset_v7';
          if (!localStorage.getItem(tourResetKey)) {
            setShowTour(true);
            localStorage.setItem(tourResetKey, 'true');
          } else if (!profileData.has_completed_tour) {
            setShowTour(true);
          }
        }

        // 2. Fetch Updates/Notifications
        const { data: updatesData } = await supabase
          .from('updates')
          .select('*')
          .eq('user_id', authData.user.id)
          .order('created_at', { ascending: false });

        if (updatesData) {
          setNotifications(updatesData.map(u => ({
            id: u.id,
            type: u.type,
            titleHe: u.title_he,
            titleEn: u.title_en,
            contentHe: u.content_he,
            contentEn: u.content_en,
            requestId: u.request_id,
            groupId: u.group_id
          })));
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
          ...(enrolled?.map(e => e.study_groups).filter(Boolean) || []),
          ...(managed || [])
        ].filter((v, i, a) => v && v.id && a.findIndex(t => t?.id === v.id) === i); // Unique & Safe

        setAcceptedGroups(allGroups.map(g => ({
          id: g.id,
          title: isHe ? (g.title || g.topic || 'קבוצה') : (g.title || g.topic || 'Group'),
          details: (g.session_time === 'TBD' || !g.session_time) ? (isHe ? 'טרם נקבע' : 'TBD') : g.session_time,
          displayDate: formatDateIsrael(g.session_time, language),
          urgency: getUrgencyLabel(g.session_time)
        })));

        // 4. Fetch Active Help Sessions (1-on-1 Chats)
        const { data: helpData } = await supabase
          .from('help_requests')
          .select('*, profiles:profiles!requester_id(alias, avatar_base, avatar_bg), helper_profile:profiles!helper_id(alias, avatar_base, avatar_bg)')
          .or(`requester_id.eq.${authData.user.id},helper_id.eq.${authData.user.id}`)
          .not('status', 'eq', 'resolved');

        if (helpData) {
          const activeHelp = helpData.map(h => {
            const isRequester = h.requester_id === authData.user.id;
            const otherParty = isRequester ? h.helper_profile : h.profiles;
            const hasNewMessage = updatesData?.some(u => u.type === 'new_message' && u.request_id === h.id);

            return {
              id: h.id,
              type: 'help',
              isRequester,
              status: h.status,
              hasNewMessage,
              topic: h.course_name && !h.course_name.includes('-') ? h.course_name : (h.course && !h.course.includes('-') ? h.course : (isHe ? 'שיעור עזרה' : 'Help Lesson')),
              dateStr: h.date_str || (isHe ? 'טרם נקבע' : 'TBD')
            };
          });
          setActiveHelpSessions(activeHelp.filter(h => h.status === 'offered' || h.status === 'active'));
          setAllUserHelpRequests(helpData.filter(h => h.requester_id === authData.user.id));
        }

        // 5. Fetch User's Latest Feed Post
        const { data: latestPost } = await supabase
          .from('feed_posts')
          .select('*, feed_comments(id)')
          .eq('user_id', authData.user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(); // Better than single() if 0 or 1 expected

        if (latestPost) {
          const content = latestPost.text || latestPost.content || '';
          setUserLatestPost({
            text: content,
            commentCount: latestPost.feed_comments?.length || 0,
            id: latestPost.id
          });
        } else {
          setUserLatestPost(null);
        }

        // 6. Check for Past Due Help Requests (Reschedule Logic)
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        const pastDue = helpData?.filter(h => {
          if (!h.date_str || h.status !== 'open' || h.date_str === 'TBD') return false;
          try {
            const datePart = h.date_str.split(' ')[0];
            const reqDate = new Date(datePart);
            if (isNaN(reqDate.getTime())) return false;
            
            // Only past due if it is strictly BEFORE today
            return reqDate < startOfToday && !updatesData?.some(u => u.type === 'reschedule' && u.request_id === h.id);
          } catch(e) { return false; }
        });

        if (pastDue && pastDue.length > 0) {
          for (const req of pastDue) {
            await supabase.from('updates').insert([{
              user_id: authData.user.id,
              type: 'reschedule',
              request_id: req.id,
              title_he: 'האם תרצה לעדכן את בקשת העזרה?',
              title_en: 'Would you like to reschedule your request?',
              content_he: `התאריך שקבעת לבקשה ב-${req.course_name} עבר. תרצה לעדכן או למחוק?`,
              content_en: `The date for your ${req.course_name} request has passed. Update or delete?`
            }]);
          }
          // Refetch updates to show them immediately
          const { data: newUpdates } = await supabase.from('updates').select('*').eq('user_id', authData.user.id).order('created_at', { ascending: false });
          if (newUpdates) setNotifications(newUpdates.map(u => ({ id: u.id, type: u.type, titleHe: u.title_he, titleEn: u.title_en, contentHe: u.content_he, contentEn: u.content_en, requestId: u.request_id, groupId: u.group_id })));
        }

        setIsLoading(false);
      } catch (error) {
        console.error('FATAL DASHBOARD ERROR:', error);
        setIsLoading(false);
      }
    };

    fetchData();

    // Realtime listeners
    const channel = supabase.channel('dashboard_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'updates' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'help_requests' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_enrollments' }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isHe, router]);

  const handleActionWithCleanup = async (notifId: string, action: () => void) => {
    const { error } = await supabase.from('updates').delete().eq('id', notifId);
    if (error) console.error('DELETE NOTIFICATION ERROR:', error);
    setNotifications(prev => prev.filter(n => n.id !== notifId));
    action();
    router.refresh(); // Sync server state
  };

  const handleWaitlistAccept = async (notifId: string, groupId: string) => {
    // 1. Delete notification from DB
    await supabase.from('updates').delete().eq('id', notifId);
    setNotifications(prev => prev.filter(n => n.id !== notifId));

    // 2. Update status in enrollments
    const { data: authData } = await supabase.auth.getUser();
    if (authData?.user) {
      await supabase
        .from('group_enrollments')
        .update({ status: 'approved' })
        .eq('group_id', groupId)
        .eq('user_id', authData.user.id);
    }

    if (profile?.email) {
      emailService.sendNotificationEmail(
        profile.email,
        profile.real_first_name || profile.alias || 'Buddy',
        `שלום, הצטרפת בהצלחה לקבוצה. נתראה שם!`,
        `Hi, you've successfully joined the group. See you there!`
      );
    }

    alert(isHe ? 'יופי! הקבוצה התווספה למפגשים הקרובים שלך.' : 'Great! The group has been added to your upcoming sessions.');
    router.push(`/groups/${groupId}`);
    router.refresh();
  };

  const handleWaitlistDecline = async (notifId: string) => {
    await supabase.from('updates').delete().eq('id', notifId);
    setNotifications(prev => prev.filter(n => n.id !== notifId));
    alert(isHe ? 'בחרת לא להצטרף לקבוצה.' : 'You chose not to join the group.');
    router.refresh();
  };

  const handleCollectStars = async (notifId: string) => {
    if (!profile) return;
    const { data: authData } = await supabase.auth.getUser();
    if (authData?.user) {
      const { data: pData } = await supabase.from('profiles').select('helper_stars').eq('id', authData.user.id).single();
      const currentStars = pData?.helper_stars || 0;
      const { error } = await supabase.from('profiles').update({ helper_stars: currentStars + 2 }).eq('id', authData.user.id);
      
      if (!error) {
        await supabase.from('updates').delete().eq('id', notifId);
        setNotifications(prev => prev.filter(n => n.id !== notifId));
        setProfile((prev: any) => ({ ...prev, helper_stars: currentStars + 2 }));
        alert(isHe ? 'הכוכבים נאספו בהצלחה! ✨' : 'Stars collected successfully! ✨');
      } else {
        alert(isHe ? 'שגיאה באיסוף הכוכבים.' : 'Error collecting stars.');
      }
    }
  };

  const handleDeclineUpdate = async (notifId: string, requestId?: string) => {
    await supabase.from('updates').delete().eq('id', notifId);
    setNotifications(prev => prev.filter(n => n.id !== notifId));

    if (requestId) {
      await supabase.from('help_requests').delete().eq('id', requestId);
      alert(isHe ? 'הבקשה בוטלה והוסרה.' : 'The request has been canceled and removed.');
    }
    router.refresh();
  };

  const handleSaveAvatar = async () => {
    if (!profile) return;

    const { data: authData } = await supabase.auth.getUser();
    if (authData?.user) {
      const { error } = await supabase.from('profiles').update({
        avatar_base: tempAvatarId,
        avatar_accessory: tempAccessoryId,
        avatar_bg: tempColor
      }).eq('id', authData.user.id);

      if (!error) {
        setProfile((prev: any) => ({
          ...prev,
          avatar_base: tempAvatarId,
          avatar_accessory: tempAccessoryId,
          avatar_bg: tempColor
        }));
      }
    }

    setIsEditModalOpen(false);
    alert(isHe ? 'האווטר עודכן בהצלחה! ✨' : 'Avatar updated successfully! ✨');
  };

  const openEditModal = () => {
    if (!profile) return;
    setTempAvatarId(profile.avatar_base || 'brain');
    setTempAccessoryId(profile.avatar_accessory || 'none');
    setTempColor(profile.avatar_bg || '#E0C8F0');
    setIsEditModalOpen(true);
  };

  const handleTourComplete = async () => {
    setShowTour(false);
    if (!profile) return;
    const { data: authData } = await supabase.auth.getUser();
    if (authData?.user) {
      await supabase.from('profiles').update({ has_completed_tour: true }).eq('id', authData.user.id);
      setProfile((prev: any) => ({ ...prev, has_completed_tour: true }));
    }
  };

  if (!isReady) return null;

  return (
    <div className="app-wrapper" style={{ position: 'relative', direction: isHe ? 'rtl' : 'ltr' }}>
      {showTour && <OnboardingTour onComplete={handleTourComplete} />}

      {/* Avatar Studio Modal */}
      {isEditModalOpen && (
        <div className="modal-overlay" onClick={() => setIsEditModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px' }}>
            <h2 style={{ fontSize: '2rem', marginBottom: '1.5rem', textAlign: 'center' }}>{isHe ? ' עריכת הדמות 🎨' : 'Edit Avatar 🎨'}</h2>

            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
              {/* Left: Preview */}
              <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                <div style={{ padding: '2rem', background: 'rgba(255,255,255,0.5)', borderRadius: '24px', border: '1px solid var(--primary-light)' }}>
                  <ScienceAvatar
                    avatarId={tempAvatarId}
                    avatarFile={`${tempAvatarId}.png`}
                    accessory={ACCESSORIES.find(a => a.id === tempAccessoryId) || null}
                    backgroundColor={tempColor}
                    size={160}
                  />
                </div>
                <p style={{ fontWeight: 'bold', color: 'var(--primary-dark)' }}>{isHe ? 'תצוגה מקדימה' : 'Live Preview'}</p>

                {/* Background Color Picker */}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                  {PASTEL_COLORS.map(c => (
                    <div
                      key={c.id}
                      onClick={() => setTempColor(c.color)}
                      style={{
                        width: '32px', height: '32px', borderRadius: '50%', background: c.color,
                        cursor: 'pointer', border: tempColor === c.color ? '3px solid var(--primary-color)' : '2px solid white',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Right: Selectors */}
              <div style={{ flex: '2 1 300px' }}>
                {/* Category Selection */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                  <button onClick={() => setActiveCategory('none')} style={{ padding: '0.4rem 0.8rem', borderRadius: '2rem', fontSize: '0.8rem', background: activeCategory === 'none' ? 'var(--primary-color)' : 'white', color: activeCategory === 'none' ? 'white' : '#666', border: '1px solid var(--primary-light)' }}>{isHe ? 'דמויות' : 'Avatars'}</button>
                  <button onClick={() => setActiveCategory('hats')} style={{ padding: '0.4rem 0.8rem', borderRadius: '2rem', fontSize: '0.8rem', background: activeCategory === 'hats' ? 'var(--primary-color)' : 'white', color: activeCategory === 'hats' ? 'white' : '#666', border: '1px solid var(--primary-light)' }}>{isHe ? 'כובעים' : 'Hats'}</button>
                  <button onClick={() => setActiveCategory('glasses')} style={{ padding: '0.4rem 0.8rem', borderRadius: '2rem', fontSize: '0.8rem', background: activeCategory === 'glasses' ? 'var(--primary-color)' : 'white', color: activeCategory === 'glasses' ? 'white' : '#666', border: '1px solid var(--primary-light)' }}>{isHe ? 'משקפיים' : 'Glasses'}</button>
                  <button onClick={() => setActiveCategory('medical')} style={{ padding: '0.4rem 0.8rem', borderRadius: '2rem', fontSize: '0.8rem', background: activeCategory === 'medical' ? 'var(--primary-color)' : 'white', color: activeCategory === 'medical' ? 'white' : '#666', border: '1px solid var(--primary-light)' }}>{isHe ? 'רפואי' : 'Medical'}</button>
                </div>

                <div className="picker-grid" style={{ maxHeight: '250px', overflowY: 'auto', padding: '0.5rem' }}>
                  {activeCategory === 'none' ? (
                    AVATARS.map(av => (
                      <div key={av.id} className={`picker-item ${tempAvatarId === av.id ? 'active' : ''}`} onClick={() => setTempAvatarId(av.id)}>
                        <img src={`/avatars/${av.file}`} alt={av.id} style={{ width: '80%', height: '80%', objectFit: 'contain' }} />
                      </div>
                    ))
                  ) : (
                    ACCESSORIES.filter(a => a.category === activeCategory || a.id === 'none').map(acc => (
                      <div key={acc.id} className={`picker-item ${tempAccessoryId === acc.id ? 'active' : ''}`} onClick={() => setTempAccessoryId(acc.id)}>
                        {acc.file ? <img src={`/acessories/${acc.file}`} alt={acc.id} style={{ width: '80%', height: '80%', objectFit: 'contain' }} /> : <span>✖️</span>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2.5rem', borderTop: '1px solid var(--primary-light)', paddingTop: '1.5rem' }}>
              <button onClick={() => setIsEditModalOpen(false)} className="btn-secondary" style={{ padding: '0.8rem 2rem' }}>{isHe ? 'ביטול' : 'Cancel'}</button>
              <button onClick={handleSaveAvatar} className="btn-primary" style={{ padding: '0.8rem 2.5rem' }}>{isHe ? 'שמור שינויים ✨' : 'Save Changes ✨'}</button>
            </div>
          </div>
        </div>
      )}
      {/* Language Toggle */}
      <div style={{ position: 'absolute', top: '1rem', right: '1rem', zIndex: 100 }}>
        <button
          onClick={() => setLanguage(language === 'he' ? 'en' : 'he')}
          style={{ padding: '0.4rem 0.8rem', borderRadius: '2rem', border: '1px solid var(--primary-color)', background: 'white', cursor: 'pointer', fontWeight: 'bold' }}
        >
          {language === 'he' ? 'English (En)' : 'עברית (He)'}
        </button>
      </div>

      <nav className="sidebar">

        {/* NEW LAYOUT: Logo top, text middle, user bottom */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '2.5rem', borderBottom: '1px solid var(--primary-light)', paddingBottom: '2rem' }}>
          <img src="/new_logo.png" alt="StudyBuddy Logo" style={{ width: '100%', maxWidth: '220px', height: 'auto', objectFit: 'contain', marginBottom: '0.5rem' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          <h2 style={{ fontSize: '2.6rem', color: 'var(--primary-color)', margin: '0 0 1rem 0', fontWeight: '800', fontFamily: '"DynaPuff", "Fredoka", "Outfit", cursive', textAlign: 'center' }}>
            StudyBuddy
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', position: 'relative' }}>
            {isLoading ? (
              <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--primary-light)', animation: 'pulse 1.5s infinite' }} />
            ) : (profile && profile.avatar_base) ? (
              <div style={{ position: 'relative', cursor: 'pointer' }} onClick={openEditModal} title={isHe ? 'עריכת אווטר' : 'Edit Avatar'}>
                <ScienceAvatar
                  avatarId={profile?.avatar_base?.replace('.png', '').replace('virus1', 'virus') || 'brain'}
                  avatarFile={profile?.avatar_base?.replace('virus1', 'virus').includes('.png') ? profile.avatar_base.replace('virus1', 'virus') : `${profile?.avatar_base?.replace('virus1', 'virus') || 'brain'}.png`}
                  accessory={ACCESSORIES.find((a: any) => a.id === profile?.avatar_accessory || a.file === profile?.avatar_accessory) || null}
                  backgroundColor={profile?.avatar_bg || '#8A63D2'}
                  size={80}
                />
                <div style={{ position: 'absolute', bottom: '-5px', right: '-5px', background: 'white', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.2)', border: '1px solid var(--primary-light)' }}>
                  ✏️
                </div>
              </div>
            ) : (
              <ScienceAvatar avatarId="brain" avatarFile="brain.png" accessory={null} size={80} backgroundColor="#8A63D2" />
            )}
            <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
              <p style={{ margin: 0, fontWeight: 'bold', fontSize: '1.2rem', color: 'var(--primary-dark)' }}>
                {profile?.alias || (isHe ? 'אורח' : 'Guest')}
              </p>
              {profile?.real_first_name && (
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {profile.real_first_name} {profile?.real_last_name || ''}
                </p>
              )}
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {isHe ? 'חוג' : 'Degree'}: {profile?.degree === 'Tzameret' ? (isHe ? 'צמרת' : 'Tzameret') : (profile?.degree || '')} • {isHe ? 'שנה' : 'Year'}: {profile?.year === 'year4' ? (isHe ? 'ד\'' : '4') : (profile?.year_of_study || profile?.year || '')}
              </p>
            </div>
          </div>
        </div>

        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <li>
            <Link href="/dashboard" className="btn-secondary" style={{ width: '100%', justifyContent: 'flex-start', background: 'var(--primary-light)', color: 'var(--primary-color)', border: 'none' }}>
              {isHe ? 'אזור אישי' : 'Personal Area'}
            </Link>
          </li>
          <li>
            <Link href="/groups" className="btn-secondary" style={{ width: '100%', justifyContent: 'flex-start', border: 'none' }}>
              {isHe ? 'קבוצות למידה' : 'Study Groups'}
            </Link>
          </li>
          <li>
            <Link href="/help" className="btn-secondary" style={{ width: '100%', justifyContent: 'flex-start', border: 'none' }}>
              {isHe ? 'מרכז עזרה' : 'Help Center'}
            </Link>
          </li>
          <li>
            <Link href="/feed" className="btn-secondary" style={{ width: '100%', justifyContent: 'flex-start', border: 'none' }}>
              {isHe ? 'פיד קהילתי' : 'Community Feed'}
            </Link>
          </li>
        </ul>
      </nav>

      <main className="main-content">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
          <h1 style={{ fontSize: '2.5rem', margin: 0, fontFamily: '"DynaPuff", "Fredoka", "Outfit", cursive', color: 'var(--primary-color)' }}>
            {isHe
              ? `${profile?.real_first_name || 'חבר קהילה'}, כיף לראות אותך 💜`
              : `Welcome back, ${profile?.real_first_name || 'Friend'}.`}
          </h1>
          <Link href="/" className="btn-secondary" onClick={async () => await supabase.auth.signOut()}>
            {isHe ? 'התנתק' : 'Log out'}
          </Link>
        </header>

        {/* Stats Section - Kept as requested */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '4rem' }}>
          <div className="glass-card">
            <h3 style={{ fontSize: '1rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
              {isHe ? 'קבוצות למידה פעילות' : 'Active Study Groups'}
            </h3>
            <p style={{ fontSize: '2.5rem', fontWeight: '800', fontFamily: '"DynaPuff", cursive', color: 'var(--primary-color)', margin: 0 }}>{acceptedGroups.length}</p>
          </div>
          <div className="glass-card">
            <h3 style={{ fontSize: '1rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
              {isHe ? 'בקשות עזרה' : 'Help Requests'}
            </h3>
            <p style={{ fontSize: '2.5rem', fontWeight: '800', fontFamily: '"DynaPuff", cursive', color: 'var(--primary-color)', margin: 0 }}>
              {allUserHelpRequests.filter(h => h.status !== 'resolved').length}
            </p>
          </div>
          <div className="glass-card tooltip-container" style={{ background: 'var(--primary-color)', color: 'white' }}>
            <h3 style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.8)', marginBottom: '0.5rem' }}>
              {isHe ? 'כוכבי עזרה שנצברו' : 'Helper Stars Earned'}
            </h3>
            <p style={{ fontSize: '2.5rem', fontWeight: '800', fontFamily: '"DynaPuff", cursive', margin: 0 }}>{profile?.helper_stars || 0} ⭐</p>

            <div className="tooltip-popup">
              <strong style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--primary-dark)', fontSize: '1.05rem' }}>{isHe ? 'איך מרוויחים כוכבים? ⭐' : 'How to earn stars? ⭐'}</strong>
              <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', fontWeight: '400', color: '#666', lineHeight: '1.4' }}>
                {isHe ? 'על כל שיעור שאת/ה מעביר/ה ועוזר/ת בו, מקבלים כוכבים בהתאם למשך העזרה:' : 'For every lesson you help with, you earn stars based on the duration:'}
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '2.5rem', color: '#666' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
                  <div style={{ background: 'rgba(255, 215, 0, 0.12)', padding: '0.4rem', borderRadius: '8px', minWidth: '40px', display: 'flex', justifyContent: 'center' }}>
                    <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>⭐</span>
                  </div>
                  <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--primary-dark)' }}>15 {isHe ? 'דק׳' : 'Min'}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
                  <div style={{ background: 'rgba(255, 215, 0, 0.12)', padding: '0.4rem', borderRadius: '8px', minWidth: '60px', display: 'flex', justifyContent: 'center' }}>
                    <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>⭐⭐</span>
                  </div>
                  <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--primary-dark)' }}>30 {isHe ? 'דק׳' : 'Min'}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
                  <div style={{ background: 'rgba(255, 215, 0, 0.12)', padding: '0.4rem', borderRadius: '8px', minWidth: '80px', display: 'flex', justifyContent: 'center' }}>
                    <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>⭐⭐⭐</span>
                  </div>
                  <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--primary-dark)' }}>45 {isHe ? 'דק׳' : 'Min'}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '2.2rem', fontFamily: '"DynaPuff", "Fredoka", "Outfit", cursive', color: 'var(--primary-color)' }}>
              {isHe ? 'מפגשים וצ׳אטים קרובים' : 'Upcoming Sessions & Chats'}
            </h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Unified Sessions List: Groups + Confirmed Help */}
            {[
              ...acceptedGroups.map(g => ({ ...g, type: 'group' })),
              ...activeHelpSessions.map(h => ({ ...h, type: 'help', urgency: getUrgencyLabel(h.dateStr), displayDate: formatDateIsrael(h.dateStr, language) }))
            ].sort((a, b) => 0).map((session, idx) => (
              <Link 
                key={`${session.type}-${session.id}-${idx}`} 
                href={session.type === 'group' ? `/groups/${session.id}` : `/chat/${session.id}`} 
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div 
                  className="glass-card" 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '1.5rem', 
                    cursor: 'pointer', 
                    transition: 'transform 0.2s', 
                    borderLeft: isHe ? 'none' : `6px solid ${session.urgency === 'today' ? '#FF5252' : (session.type === 'group' ? 'var(--primary-color)' : '#4CAF50')}`, 
                    borderRight: isHe ? `6px solid ${session.urgency === 'today' ? '#FF5252' : (session.type === 'group' ? 'var(--primary-color)' : '#4CAF50')}` : 'none',
                    position: 'relative',
                    boxShadow: session.urgency === 'today' ? '0 0 15px rgba(255, 82, 82, 0.2)' : undefined,
                    animation: session.urgency === 'today' ? 'pulse-border 2s infinite' : undefined
                  }}
                >
                  <style>{`
                    @keyframes pulse-border {
                      0% { box-shadow: 0 0 15px rgba(255, 82, 82, 0.2); }
                      50% { box-shadow: 0 0 25px rgba(255, 82, 82, 0.4); }
                      100% { box-shadow: 0 0 15px rgba(255, 82, 82, 0.2); }
                    }
                  `}</style>
                  <div style={{ 
                    width: '60px', 
                    height: '60px', 
                    borderRadius: '50%', 
                    background: session.type === 'group' ? 'var(--primary-light)' : 'rgba(76, 175, 80, 0.1)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    fontSize: '1.5rem' 
                  }}>
                    {session.type === 'group' ? '📚' : '🤝'}
                  </div>
                  
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
                      <span style={{ 
                        background: session.type === 'group' ? 'rgba(138, 99, 210, 0.1)' : 'rgba(76, 175, 80, 0.1)', 
                        color: session.type === 'group' ? 'var(--primary-color)' : '#2E7D32', 
                        fontSize: '0.7rem', 
                        fontWeight: '800', 
                        padding: '0.2rem 0.6rem', 
                        borderRadius: '8px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>
                        {session.type === 'group' ? (isHe ? '📚 קבוצת למידה' : '📚 Group') : (isHe ? '🤝 עזרה 1-על-1' : '🤝 1-on-1 Help')}
                      </span>
                      {session.hasNewMessage && (
                        <span style={{ 
                          background: '#25D366', 
                          color: 'white', 
                          fontSize: '0.7rem', 
                          padding: '0.2rem 0.5rem', 
                          borderRadius: '10px',
                          fontWeight: 'bold',
                          animation: 'pulse 2s infinite'
                        }}>
                          {isHe ? 'הודעה חדשה!' : 'New Message!'}
                        </span>
                      )}
                    </div>
                    
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '800', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {session.title || session.topic}
                    </h3>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.4rem' }}>
                      <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.85rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        {session.type === 'group' ? (
                          <span style={{ opacity: 0.8 }}>{session.details}</span>
                        ) : (
                          <>
                             <span>👤</span> {isHe ? 'עם' : 'With'} {session.otherName}
                          </>
                        )}
                      </p>
                      
                        <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.3rem', 
                        color: session.urgency === 'today' ? '#FF5252' : (session.displayDate === 'טרם נקבע' || session.displayDate === 'TBD' ? '#999' : 'var(--primary-color)'),
                        fontSize: '0.85rem',
                        fontWeight: '800'
                      }}>
                        <span>🕒</span> {session.displayDate}
                        {session.urgency === 'today' && <span style={{ marginLeft: '0.3rem', animation: 'blink 1s infinite' }}>🚨 {isHe ? 'היום!' : 'Today!'}</span>}
                      </div>
                    </div>
                  </div>

                  <style>{`
                    @keyframes blink {
                      0% { opacity: 1; }
                      50% { opacity: 0.5; }
                      100% { opacity: 1; }
                    }
                  `}</style>

                  <div style={{ color: session.type === 'group' ? 'var(--primary-color)' : '#4CAF50', fontWeight: '800', fontSize: '0.9rem' }}>
                    {isHe ? 'לך לצ׳אט' : 'Go to Chat'} &rarr;
                  </div>
                </div>
              </Link>
            ))}

            {acceptedGroups.length === 0 && activeHelpSessions.length === 0 && (
              <div style={{ padding: '2rem', textAlign: 'center', background: 'rgba(0,0,0,0.02)', borderRadius: '16px', border: '1px dashed rgba(0,0,0,0.1)' }}>
                <p style={{ color: 'var(--text-muted)', margin: 0 }}>
                  {isHe ? 'אין כרגע מפגשים קרובים. זה הזמן להצטרף לקבוצה או לבקש עזרה!' : 'No upcoming sessions. Time to join a group or ask for help!'}
                </p>
              </div>
            )}
            
            {/* My Active Feed Post (Dynamic) */}
            <Link href="/feed" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', cursor: 'pointer', transition: 'transform 0.2s', borderLeft: isHe ? 'none' : '6px solid #FF9800', borderRight: isHe ? '6px solid #FF9800' : 'none' }}>
                <div style={{ position: 'relative' }}>
                  <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(255, 152, 0, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>📢</div>
                  {userLatestPost && userLatestPost.commentCount > 0 && (
                    <div style={{ position: 'absolute', top: '-5px', right: '-5px', background: 'var(--primary-color)', color: 'white', fontSize: '0.8rem', fontWeight: 'bold', width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 10px rgba(138, 99, 210, 0.6)' }}>
                      {userLatestPost.commentCount}
                    </div>
                  )}
                </div>

                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#e65100' }}>
                    {isHe ? 'הפוסט שלי בקהילה' : 'My Community Post'}
                  </h3>
                  <p style={{ color: 'var(--text-main)', margin: '0.2rem 0', fontSize: '0.95rem', fontWeight: '500' }}>
                    {userLatestPost
                      ? (userLatestPost.text?.length > 40 ? userLatestPost.text.substring(0, 40) + '...' : (userLatestPost.text || ''))
                      : (isHe ? 'עדיין לא פרסמת בפיד. בואו לשתף משהו!' : 'No posts yet. Share something with the community!')}
                  </p>
                  {userLatestPost && (
                    <p style={{ color: 'var(--primary-color)', margin: 0, fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <span>💬</span> {isHe ? `${userLatestPost.commentCount} תגובות` : `${userLatestPost.commentCount} replies`}
                    </p>
                  )}
                </div>
                <div style={{ color: '#FF9800', fontSize: '1.2rem' }}>&rarr;</div>
              </div>
            </Link>

          </div>
        </section>

        {/* Notifications / Updates Area */}
        {notifications?.length > 0 && (
          <section style={{ marginTop: '4rem' }}>
            <h2 style={{ fontSize: '2.2rem', fontFamily: '"DynaPuff", "Fredoka", "Outfit", cursive', marginBottom: '1.5rem', color: '#ff9800' }}>
              {isHe ? 'עדכונים חשובים' : 'Important Updates'}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {notifications.map(notif => {
                let cardBg = 'rgba(255, 255, 255, 0.9)';
                let cardBorder = '2px solid rgba(138, 99, 210, 0.1)';
                let icon = '🔔';
                let accentColor = 'var(--primary-color)';

                if (notif.type === 'approval' || notif.type === 'help') {
                   cardBg = 'rgba(76, 175, 80, 0.08)';
                   cardBorder = '2px solid rgba(76, 175, 80, 0.2)';
                   icon = '🤝';
                   accentColor = '#2E7D32';
                } else if (notif.type === 'new-member' || notif.type === 'helper-approved') {
                   cardBg = 'rgba(33, 150, 243, 0.08)';
                   cardBorder = '2px solid rgba(33, 150, 243, 0.2)';
                   icon = '✨';
                   accentColor = '#1565C0';
                } else if (notif.type === 'reschedule') {
                   cardBg = 'rgba(255, 193, 7, 0.08)';
                   cardBorder = '2px solid rgba(255, 193, 7, 0.3)';
                   icon = '⏳';
                   accentColor = '#FF8F00';
                } else if (notif.type === 'waitlist' || notif.type === 'waiting-list-open') {
                   cardBg = 'rgba(255, 152, 0, 0.08)';
                   cardBorder = '2px solid rgba(255, 152, 0, 0.2)';
                   icon = '⌛';
                   accentColor = '#E65100';
                } else if (notif.type === 'star-received') {
                   cardBg = 'rgba(255, 215, 0, 0.05)';
                   cardBorder = '2px solid rgba(255, 215, 0, 0.2)';
                   icon = '🌟';
                   accentColor = '#D4AF37';
                }

                return (
                  <div key={notif.id} className="glass-card" style={{
                    border: cardBorder,
                    background: cardBg,
                    padding: '1.5rem',
                    borderRadius: '24px',
                    boxShadow: notif.type === 'helper-approved' ? '0 0 20px rgba(33, 150, 243, 0.2)' : 'var(--shadow-sm)',
                    animation: (notif.type === 'helper-approved' || notif.type === 'star-received') ? 'pulse-glow 3s infinite' : undefined
                  }}>
                    <style>{`
                      @keyframes pulse-glow {
                        0% { transform: scale(1); box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
                        50% { transform: scale(1.02); box-shadow: 0 8px 16px rgba(0,0,0,0.1); }
                        100% { transform: scale(1); box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
                      }
                    `}</style>
                    <div style={{ display: 'flex', gap: '1.2rem', alignItems: 'center' }}>
                      <div style={{ fontSize: '3rem', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }}>{icon}</div>
                      <div style={{ flex: 1 }}>
                        <h3 style={{ margin: '0 0 0.3rem 0', color: accentColor, fontWeight: '900', fontSize: '1.3rem', fontFamily: '"DynaPuff", "Fredoka", "Outfit", cursive' }}>
                          {isHe ? notif.titleHe : notif.titleEn}
                        </h3>
                        <p style={{ margin: 0, color: 'var(--text-main)', fontSize: '0.95rem', fontWeight: '500', lineHeight: '1.4' }}>
                          {isHe ? notif.contentHe : notif.contentEn}
                        </p>
                        <div style={{ marginTop: '1.2rem', display: 'flex', gap: '0.8rem' }}>
                          {notif.type === 'approval' || notif.type === 'help' ? (
                            <>
                               <button onClick={() => handleActionWithCleanup(notif.id, async () => {
                                    await supabase.from('help_requests').update({ status: 'active', requester_revealed: true }).eq('id', notif.requestId);
                                    router.push(`/chat/${notif.requestId}?role=requester`);
                                })} className="btn-primary" style={{ background: '#4CAF50', padding: '0.6rem 1.2rem', fontSize: '0.9rem', fontWeight: 'bold', borderRadius: '15px' }}>
                                  {isHe ? 'הבנתי! אעבור לצ׳אט' : 'Got it! Go to Chat'}
                                </button>
                                <button onClick={() => handleDeclineUpdate(notif.id, notif.requestId)} className="btn-secondary" style={{ padding: '0.6rem 1rem', fontSize: '0.9rem', borderRadius: '15px' }}>
                                  {isHe ? 'דחה את הבקשה' : 'Decline Request'}
                                </button>
                              </>
                            ) : notif.type === 'helper-approved' ? (
                              <button onClick={() => handleActionWithCleanup(notif.id, () => router.push(`/chat/${notif.requestId}?role=helper`))} className="btn-primary" style={{ background: '#2196F3', padding: '0.6rem 1.5rem', fontSize: '0.9rem', fontWeight: 'bold', borderRadius: '15px' }}>
                                {isHe ? 'הבנתי! אעבור לצ׳אט' : 'Got it! Go to Chat'}
                              </button>
                            ) : notif.type === 'waiting-list-open' ? (
                              <>
                                <button onClick={() => handleWaitlistAccept(notif.id, notif.groupId)} className="btn-primary" style={{ background: '#FF9800', padding: '0.6rem 1.5rem', fontSize: '0.9rem', fontWeight: 'bold', borderRadius: '15px' }}>
                                  {isHe ? 'הצטרף לקבוצה!' : 'Join Group!'}
                                </button>
                                <button onClick={() => handleWaitlistDecline(notif.id)} className="btn-secondary" style={{ padding: '0.6rem 1.5rem', fontSize: '0.9rem', fontWeight: 'bold', borderRadius: '15px' }}>
                                  {isHe ? 'איני מעוניין יותר' : 'No longer interested'}
                                </button>
                              </>
                            ) : notif.type === 'reschedule' ? (
                            <>
                              <button className="btn-primary" style={{ background: '#FFC107', color: 'black', padding: '0.6rem 1.2rem', fontSize: '0.9rem', fontWeight: 'bold', borderRadius: '15px' }} onClick={() => setShowRescheduleModal(true)}>
                                {isHe ? 'כן, עדכן' : 'Yes, Update'}
                              </button>
                              <button onClick={() => handleDeclineUpdate(notif.id, notif.requestId)} className="btn-secondary" style={{ padding: '0.6rem 1rem', fontSize: '0.9rem', borderRadius: '15px' }}>
                                {isHe ? 'דחה' : 'Decline'}
                              </button>
                            </>
                          ) : (notif.type === 'waitlist' || notif.type === 'waiting-list-open') ? (
                            <>
                              <button onClick={() => handleWaitlistAccept(notif.id, notif.groupId || '')} className="btn-primary" style={{ background: '#4CAF50', padding: '0.6rem 1.2rem', fontSize: '0.9rem', borderRadius: '15px' }}>
                                {isHe ? 'הצטרף לקבוצה!' : 'Join Group Now!'}
                              </button>
                              <button onClick={() => handleWaitlistDecline(notif.id)} className="btn-secondary" style={{ padding: '0.6rem 1rem', fontSize: '0.9rem', borderRadius: '15px' }}>
                                {isHe ? 'דחה' : 'Decline'}
                              </button>
                            </>
                          ) : notif.type === 'star-received' ? (
                             <button onClick={() => handleCollectStars(notif.id)} className="btn-primary" style={{ background: '#D4AF37', border: 'none', padding: '0.7rem 1.8rem', fontSize: '1rem', fontWeight: '900', borderRadius: '15px', boxShadow: '0 4px 15px rgba(212, 175, 55, 0.3)' }}>
                               {isHe ? 'אסוף כוכבים ✨' : 'Collect Stars ✨'}
                             </button>
                          ) : (
                             <button onClick={() => handleDeclineUpdate(notif.id, '')} className="btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', borderRadius: '12px' }}>
                               {isHe ? 'הבנתי' : 'Got it'}
                             </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

      </main>

      {/* Reschedule Modal */}
      {showRescheduleModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-card" style={{ width: '400px', maxWidth: '90%', padding: '2rem' }}>
            <h3 style={{ margin: '0 0 1rem 0', color: 'var(--primary-dark)', fontSize: '1.4rem' }}>
              {isHe ? 'עדכון זמני הבקשה' : 'Update Request Times'}
            </h3>

            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--text-main)' }}>
              {isHe ? 'רמת דחיפות מועדפת' : 'Preferred Urgency'}
            </label>
            <select className="input-field" style={{ marginBottom: '1.5rem', width: '100%' }}>
              <option value="this_week">{isHe ? 'השבוע' : 'This Week'}</option>
              <option value="not_urgent">{isHe ? 'גמיש / לא דחוף' : 'Flexible / Not Urgent'}</option>
            </select>

            <label style={{ display: 'block', fontWeight: 'bold', margin: '0 0 0.1rem 0', color: 'var(--text-main)' }}>
              {isHe ? 'תאריך ושעה' : 'Date & Time'}
            </label>
            <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.6rem' }}>
              {isHe ? '(אופציונאלי)' : '(Optional)'}
            </span>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
              <input type="date" className="input-field" style={{ flex: 1 }} />
              <input type="time" className="input-field" style={{ width: '150px' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
              <button className="btn-secondary" onClick={() => setShowRescheduleModal(false)}>{isHe ? 'ביטול' : 'Cancel'}</button>
              <button className="btn-primary" onClick={() => { setShowRescheduleModal(false); alert(isHe ? 'הזמנים עודכנו בהצלחה!' : 'Times updated successfully!'); }}>{isHe ? 'שמור' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
