"use client"
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { translations } from '@/lib/i18n';
import { useLanguage } from '@/hooks/useLanguage';
import { supabase } from '@/lib/supabase';
import { emailService } from '@/lib/emailService';

interface StudyGroup {
  id: string;
  title: string;
  course: string;
  degree: string;
  year: string;
  dateStr: string;
  description: string;
  manager: string;
  managerId: string;
  maxMembers: number;
  members: { name: string, id: string }[];
  waitlist: { name: string, id: string }[];
  joinedStatus: 'none' | 'approved' | 'waiting';
}

export default function GroupsBrowserPage() {
  const router = useRouter();
  const { language, isReady, setLanguage } = useLanguage();
  const t = translations[language];
  const isHe = language === 'he';

  const [filterMajor, setFilterMajor] = useState('All');
  const [filterYear, setFilterYear] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const [groups, setGroups] = useState<StudyGroup[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedParticipants, setSelectedParticipants] = useState<{ id: string, name: string }[] | null>(null);

  const fetchGroups = async () => {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;
    setCurrentUser(user);

    // 1. Fetch All Groups
    const { data: groupsData, error: groupsError } = await supabase
      .from('study_groups')
      .select('*, profiles:profiles!manager_id(alias, degree, year, year_of_study, real_first_name)')
      .order('created_at', { ascending: false });

    if (groupsError) return;

    // 2. Fetch All Enrollments with profiles
    const { data: enrollData } = await supabase
      .from('group_enrollments')
      .select('*, profiles:profiles!user_id(real_first_name, alias)');

    if (groupsData) {
      const formatted = groupsData.map((g: any) => {
        const groupEnrolls = enrollData?.filter(e => e.group_id === g.id) || [];
        const approved = groupEnrolls.filter(e => e.status === 'approved').map(e => ({ name: e.profiles?.real_first_name || e.profiles?.alias || 'Student', id: e.user_id }));
        const waiting = groupEnrolls.filter(e => e.status === 'waiting').map(e => ({ name: e.profiles?.real_first_name || e.profiles?.alias || 'Student', id: e.user_id }));
        
        const myEnroll = groupEnrolls.find(e => e.user_id === user?.id);
        const status = myEnroll ? myEnroll.status : 'none';

        let rawDesc = g.description || g.text || g.content || '';
        let pref = 'both';
        if (rawDesc.includes('<!-- PREF:')) {
           const match = rawDesc.match(/<!-- PREF:(.*?) -->/);
           if (match) pref = match[1];
           rawDesc = rawDesc.replace(/<!-- PREF:.*?-->/, '').trim();
        }

        let deg = g.profiles?.degree || g.profiles?.major || '';
        let yr = g.profiles?.year_of_study || g.profiles?.year || '';

        if (pref === 'none') { deg = ''; yr = ''; }
        else if (pref === 'major') { yr = ''; }
        else if (pref === 'year') { deg = ''; }

        return {
          id: g.id,
          title: g.title,
          course: g.course,
          degree: deg,
          year: yr,
          dateStr: g.session_time,
          description: rawDesc,
          manager: g.profiles?.real_first_name || g.profiles?.alias || 'Manager',
          managerId: g.manager_id,
          maxMembers: g.max_capacity,
          members: approved,
          waitlist: waiting,
          joinedStatus: g.manager_id === user?.id ? 'approved' : status as any
        };
      });
      setGroups(formatted);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchGroups();

    const channel = supabase.channel('groups_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'study_groups' }, () => {
        fetchGroups();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_enrollments' }, () => {
        fetchGroups();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isHe]);

  if (!isReady) return null;

  const handleActionClick = async (groupId: string) => {
    if (!currentUser) return;
    const group = groups.find(g => g.id === groupId);
    if (!group) return;

    // LEAVE Logic
    if (group.joinedStatus !== 'none') {
      const confirmLeave = confirm(isHe ? 'האם אתה מעוניין לעזוב את קבוצת הלמידה?' : 'Are you sure you want to leave this study group?');
      if (confirmLeave) {
        // 1. Check if I'm the manager
        const { data: groupData } = await supabase.from('study_groups').select('manager_id').eq('id', groupId).single();
        const isManager = groupData?.manager_id === currentUser.id;

        if (isManager) {
          const otherMembers = group.members.filter(m => m.id !== currentUser.id);
          if (otherMembers.length === 0) {
            // Delete group if empty
            await supabase.from('study_groups').delete().eq('id', groupId);
          } else {
            // Transfer ownership to next member
            const nextManager = otherMembers[0];
            await supabase.from('study_groups').update({ manager_id: nextManager.id }).eq('id', groupId);
            // Delete my enrollment
            await supabase.from('group_enrollments').delete().eq('group_id', groupId).eq('user_id', currentUser.id);
          }
        } else {
          // Just leave
          await supabase.from('group_enrollments').delete().eq('group_id', groupId).eq('user_id', currentUser.id);
          
          // promote next in line if I was approved
          if (group.joinedStatus === 'approved' && group.waitlist.length > 0) {
              const nextInLine = group.waitlist[0];
              await supabase.from('group_enrollments').update({ status: 'approved' }).eq('group_id', groupId).eq('user_id', nextInLine.id);
          }
        }
        
        fetchGroups();
      }
      return;
    }

    // JOIN Logic
    if (group.joinedStatus === 'none') {
      const isFull = group.members.length >= group.maxMembers;
      const status = isFull ? 'waiting' : 'approved';

      const { error } = await supabase.from('group_enrollments').insert([{
        group_id: groupId,
        user_id: currentUser.id,
        status: status
      }]);

      if (!error) {
        // 2. Fetch Manager email & Create Update
        const getManagerInfo = async () => {
          const { data: groupData } = await supabase.from('study_groups').select('manager_id, topic, course').eq('id', groupId).single();
          if (groupData) {
            // Create Notification
            await supabase.from('updates').insert([{
              user_id: groupData.manager_id,
              type: status === 'approved' ? 'new-member' : 'waitlist-join',
              title_he: status === 'approved' ? 'חבר חדש הצטרף! 🎉' : 'מישהו הצטרף להמתנה ⌛',
              title_en: status === 'approved' ? 'New Member Joined! 🎉' : 'Someone joined waitlist ⌛',
              content_he: `המשתמש ${currentUser.profile?.alias || 'Sudent'} הצטרף לקבוצה "${groupData.topic}".`,
              content_en: `User ${currentUser.profile?.alias || 'Student'} joined your group "${groupData.topic}".`,
              group_id: groupId
            }]);

            // Send Email to Manager
            const { data: managerProf } = await supabase.from('profiles').select('email, real_first_name, alias').eq('id', groupData.manager_id).single();
            if (managerProf?.email) {
              emailService.sendNotificationEmail(
                managerProf.email,
                managerProf.real_first_name || managerProf.alias || 'Manager',
                `חדשות טובות! מישהו הצטרף לקבוצת הלמידה שלך ב-${groupData.course || 'Study Group'}. בוא/י לצ׳אט כדי להתחיל! 🚀`,
                `Good news! Someone joined your study group in ${groupData.course || 'Study Group'}. Head to the chat to start! 🚀`
              );
            }
          }
        };
        getManagerInfo();

        if (status === 'approved') {
          alert(isHe ? 'הצטרפת לקבוצה בהצלחה! לשם האמיתי שלך יחשף לכולם.' : 'Joined successfully! Your real name is now visible.');
          router.push(`/groups/${groupId}`);
        } else {
          alert(isHe ? 'נרשמת לרשימת המתנה. הקבוצה מלאה, תצורף חזרה במידה ומישהו יעזוב.' : 'You joined the waitlist. You will be auto-added if someone leaves.');
          fetchGroups();
        }
      }
    }
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', paddingTop: '2rem', paddingBottom: '4rem', direction: isHe ? 'rtl' : 'ltr' }}>
      
      {/* Language Toggle */}
      <div style={{ position: 'fixed', top: '2rem', right: '2rem', zIndex: 100 }}>
        <button 
          onClick={() => setLanguage(language === 'he' ? 'en' : 'he')}
          style={{ padding: '0.4rem 0.8rem', borderRadius: '2rem', border: '1px solid var(--primary-color)', background: 'white', cursor: 'pointer', fontWeight: 'bold' }}
        >
          {language === 'he' ? 'English (En)' : 'עברית (He)'}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link href="/dashboard" className="btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
            {isHe ? '← חזרה לחשבון' : '← Back to Account'}
          </Link>
          <h1 style={{ fontSize: '2.5rem', margin: 0, fontFamily: '"DynaPuff", "Fredoka", "Outfit", cursive', color: 'var(--primary-color)' }}>
            {isHe ? 'קבוצות למידה' : 'Study Groups'}
          </h1>
        </div>
        <Link href="/groups/create" className="btn-primary">
          {isHe ? '+ יצירת קבוצה' : '+ Create Group'}
        </Link>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap', background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--primary-light)' }}>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--primary-dark)' }}>
            🔍 {isHe ? 'חיפוש חופשי' : 'Search Groups'}
          </label>
          <input 
            type="text" 
            className="input-field" 
            placeholder={isHe ? 'לפי כותרת או קורס...' : 'Search by title or course...'} 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div style={{ width: '180px' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--primary-dark)' }}>
            🎓 {isHe ? 'סינון לפי חוג' : 'Filter by Major'}
          </label>
          <select className="input-field" value={filterMajor} onChange={(e) => setFilterMajor(e.target.value)}>
            <option value="All">{isHe ? 'הכל' : 'All'}</option>
            {Object.entries(t.degrees).map(([k, v]) => (
              <option key={k} value={k}>{v as string}</option>
            ))}
          </select>
        </div>
        <div style={{ width: '120px' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--primary-dark)' }}>
            🗓️ {isHe ? 'שנה' : 'Year'}
          </label>
          <select className="input-field" value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
            <option value="All">{isHe ? 'הכל' : 'All'}</option>
            {Object.entries(t.years).map(([k, v]) => (
              <option key={k} value={k}>{v as string}</option>
            ))}
          </select>
        </div>
      </div>

      {/* No Anonymity Warning */}
      <div style={{ background: 'rgba(255, 152, 0, 0.05)', border: '1px solid #ff9800', padding: '1rem', borderRadius: '8px', marginBottom: '2rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <span style={{ fontSize: '1.5rem' }}>⚠️</span>
        <p style={{ margin: 0, color: 'var(--text-main)', fontSize: '0.9rem', fontWeight: '500' }}>
           {isHe ? 'כאן כל החברים מזוהים בשמם המלא ופרטיהם האישיים ליצירת סביבת לימודים מקצועית ואמינה.' : 'No Anonymity Here! Creating or joining a study group exposes your Real Name and Actual Details for an effective study environment.'}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
        {groups
          .filter(g => {
            const matchesSearch = g.title.toLowerCase().includes(searchQuery.toLowerCase()) || g.course.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesMajor = filterMajor === 'All' || g.degree === filterMajor;
            const matchesYear = filterYear === 'All' || g.year === `year${filterYear}` || g.year === filterYear;
            return matchesSearch && matchesMajor && matchesYear;
          })
          .map((group) => {
          const isFull = group.members.length >= group.maxMembers;
          const isManager = group.managerId === currentUser?.id;
          
          let actionLabel = '';
          let btnClass = 'btn-primary';

          if (group.joinedStatus === 'approved') {
            actionLabel = isHe ? (isManager ? 'עבור לצאט' : 'הצטרפת! כנס לצ׳אט') : (isManager ? 'Go to Chat' : 'Joined! Go to Chat');
            btnClass = 'btn-primary';
          } else if (group.joinedStatus === 'waiting') {
            actionLabel = isHe ? 'צא מהמתנה' : 'Leave Waitlist';
            btnClass = 'btn-secondary';
          } else {
            actionLabel = isFull ? (isHe ? 'רשימת המתנה' : 'Join Waitlist') : (isHe ? 'הצטרפות' : 'Join Group');
            if (isFull) btnClass = 'btn-secondary'; 
          }

          return (
            <div key={group.id} className="glass-card" style={{ 
              display: 'flex', flexDirection: 'column', padding: '1.8rem', 
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', position: 'relative', overflow: 'hidden',
              border: isFull ? '1px solid rgba(0,0,0,0.05)' : '1px solid rgba(138, 99, 210, 0.2)',
              boxShadow: '0 8px 32px rgba(138, 99, 210, 0.05)',
              transform: 'translateY(0)'
            }}>
              {/* Top Banner Status */}
              <div style={{ position: 'absolute', top: '15px', right: isHe ? 'auto' : '15px', left: isHe ? '15px' : 'auto', zIndex: 2 }}>
                {isFull ? (
                  <span style={{ background: '#FFF5F5', color: '#E53E3E', padding: '0.4rem 0.8rem', borderRadius: '2rem', fontSize: '0.7rem', fontWeight: '800', border: '1px solid rgba(229, 62, 62, 0.15)', boxShadow: '0 2px 4px rgba(229, 62, 62, 0.1)' }}>
                    {isHe ? 'קבוצה מלאה 🔒' : 'FULL 🔒'}
                  </span>
                ) : (
                  <span style={{ background: '#F0FFF4', color: '#38A169', padding: '0.4rem 0.8rem', borderRadius: '2rem', fontSize: '0.7rem', fontWeight: '800', border: '1px solid rgba(56, 161, 105, 0.15)', boxShadow: '0 2px 4px rgba(56, 161, 105, 0.1)' }}>
                    {isHe ? `נותרו ${group.maxMembers - group.members.length} מקומות` : `${group.maxMembers - group.members.length} SPOTS LEFT`}
                  </span>
                )}
              </div>

              <div style={{ marginBottom: '1.2rem', marginTop: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--primary-color)', background: 'rgba(138, 99, 210, 0.1)', padding: '0.2rem 0.6rem', borderRadius: '4px', textTransform: 'uppercase' }}>
                    {isHe ? 'קורס' : 'Course'}: {group.course}
                  </span>
                </div>
                <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.5rem', color: 'var(--primary-dark)', fontWeight: '800', lineHeight: 1.2 }}>
                  {group.title}
                </h3>
                
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                  {group.degree && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: '#666', background: 'rgba(0,0,0,0.03)', padding: '0.2rem 0.6rem', borderRadius: '6px', fontWeight: '500' }}>
                      🎓 {t.degrees[group.degree as keyof typeof t.degrees] || group.degree}
                    </div>
                  )}
                  {group.year && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: '#666', background: 'rgba(0,0,0,0.03)', padding: '0.2rem 0.6rem', borderRadius: '6px', fontWeight: '500' }}>
                      🗓️ {isHe ? 'שנה' : 'Year'} {t.years[group.year as keyof typeof t.years] || group.year.replace('year', '')}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ flex: 1, marginBottom: '1.5rem' }}>
                <div style={{ 
                  background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.4) 100%)', 
                  padding: '1.2rem', borderRadius: '16px', border: '1px solid rgba(138, 99, 210, 0.1)',
                  fontSize: '0.9rem', color: 'var(--text-main)', lineHeight: 1.6, position: 'relative'
                }}>
                  {group.description}
                </div>
              </div>
              
              <div style={{ borderTop: '1px solid rgba(138, 99, 210, 0.1)', paddingTop: '1.2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', boxShadow: '0 4px 12px rgba(138, 99, 210, 0.15)' }}>👑</div>
                    <div>
                      <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--primary-dark)' }}>{group.manager}</p>
                      <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-muted)' }}>{isHe ? 'מנהל הקבוצה' : 'Group Manager'}</p>
                    </div>
                  </div>
                  <div 
                    onClick={() => setSelectedParticipants(group.members)}
                    style={{ textAlign: isHe ? 'left' : 'right', cursor: 'pointer', padding: '0.4rem 0.8rem', borderRadius: '10px', transition: 'background 0.2s' }}
                    className="hover-bg-light"
                  >
                    <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: '800', color: 'var(--primary-color)' }}>{group.members.length} / {group.maxMembers}</p>
                    <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>{isHe ? 'משתתפים 👥' : 'Participants 👥'}</p>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.9)', padding: '1rem', borderRadius: '14px', border: '1px solid rgba(138, 99, 210, 0.1)', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: '800', color: (group.dateStr && group.dateStr !== 'TBD') ? 'var(--primary-color)' : '#999' }}>
                    {(group.dateStr && group.dateStr !== 'TBD' && group.dateStr !== 'טרם נקבע') ? `🕒 ${group.dateStr}` : (isHe ? '🕒 מועד גמיש' : '🕒 Flexible Time')}
                  </span>
                  <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                    {group.joinedStatus === 'approved' ? (
                      <>
                         <button 
                          onClick={() => handleActionClick(group.id)} 
                          style={{ background: 'none', border: 'none', color: '#FF5252', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 'bold', padding: '0.4rem' }}
                        >
                          {isHe ? 'עזוב' : 'Leave'}
                        </button>
                        <button 
                          onClick={() => router.push('/groups/' + group.id)} 
                          className="btn-primary" 
                          style={{ padding: '0.5rem 1.2rem', fontSize: '0.85rem', fontWeight: '800', borderRadius: '10px', boxShadow: '0 4px 12px rgba(138, 99, 210, 0.3)' }}
                        >
                          {actionLabel}
                        </button>
                      </>
                    ) : (
                      <button 
                        className={btnClass} 
                        style={{ padding: '0.5rem 1.5rem', fontSize: '0.85rem', fontWeight: '800', borderRadius: '10px' }} 
                        onClick={() => handleActionClick(group.id)}
                      >
                         {actionLabel}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
 
      {/* Participant Modal */}
      {selectedParticipants && (
        <div className="modal-overlay" onClick={() => setSelectedParticipants(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <h3 style={{ margin: '0 0 1.5rem 0', color: 'var(--primary-dark)', fontSize: '1.5rem', textAlign: 'center' }}>
              {isHe ? 'משתתפים בקבוצה' : 'Group Participants'}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              {selectedParticipants.map(participant => (
                <div key={participant.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.8rem', background: 'rgba(138, 99, 210, 0.05)', borderRadius: '12px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>👤</div>
                  <span style={{ fontWeight: '600', flex: 1 }}>{participant.name}</span>
                  {groups.find(g => g.members.some(m => m.id === participant.id))?.managerId === participant.id && (
                     <span style={{ fontSize: '0.7rem', background: 'var(--primary-color)', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '2rem' }}>{isHe ? 'מנהל/ת הקבוצה' : 'Group Manager'}</span>
                  )}
                </div>
              ))}
            </div>
            <button className="btn-primary" style={{ marginTop: '2rem', width: '100%' }} onClick={() => setSelectedParticipants(null)}>
               {isHe ? 'סגור' : 'Close'}
            </button>
          </div>
        </div>
      )}

      {groups.length === 0 && !isLoading && (
        <div style={{ textAlign: 'center', padding: '4rem', background: 'rgba(0,0,0,0.02)', borderRadius: '16px', border: '1px dashed rgba(0,0,0,0.1)', marginTop: '2rem' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
            {isHe ? 'אין עדיין קבוצות למידה פעילות. תהיה הראשון לפתוח אחת!' : 'No active study groups yet. Be the first to start one!'}
          </p>
        </div>
      )}
    </div>
  );
}
