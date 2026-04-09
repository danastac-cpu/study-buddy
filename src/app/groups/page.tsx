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

  const prettyDate = (dateStr: string) => {
    if (!dateStr || dateStr === 'TBD' || dateStr === 'טרם נקבע') {
       return isHe ? '📅 עדיין לא נקבע תאריך' : '📅 Date not yet set';
    }
    // Check if it's an ISO string (contains T and -)
    if (dateStr.includes('T') && dateStr.includes('-')) {
      try {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          return `📅 ${d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })} | ${d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`;
        }
      } catch (e) { /* fallback to raw */ }
    }
    return `📅 ${dateStr}`;
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', paddingTop: '2.5rem', paddingBottom: '5rem', direction: isHe ? 'rtl' : 'ltr' }}>
      
      {/* Language Toggle */}
      <div style={{ position: 'fixed', top: '2rem', right: '2rem', zIndex: 100 }}>
        <button 
          onClick={() => setLanguage(language === 'he' ? 'en' : 'he')}
          style={{ padding: '0.5rem 1rem', borderRadius: '3rem', border: '1px solid rgba(138, 99, 210, 0.3)', background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(10px)', color: 'var(--primary-dark)', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}
        >
          {language === 'he' ? 'English (En)' : 'עברית (He)'}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
          <Link href="/dashboard" className="btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', borderRadius: '12px' }}>
            {isHe ? '← חזרה' : '← Back'}
          </Link>
          <h1 style={{ fontSize: '3rem', margin: 0, fontFamily: '"DynaPuff", cursive', background: 'linear-gradient(135deg, var(--primary-color), var(--primary-dark))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {isHe ? 'קבוצות למידה' : 'Study Groups'}
          </h1>
        </div>
        <Link href="/groups/create" className="btn-primary" style={{ padding: '0.8rem 1.8rem', fontSize: '1rem', borderRadius: '16px', boxShadow: '0 8px 25px rgba(138, 99, 210, 0.4)' }}>
          {isHe ? '+ יצירת קבוצה חדשה' : '+ Start a Group'}
        </Link>
      </div>

      {/* Filters */}
      <div style={{ 
        display: 'flex', gap: '1.2rem', marginBottom: '3rem', flexWrap: 'wrap', 
        background: 'rgba(255, 255, 255, 0.4)', backdropFilter: 'blur(20px)', padding: '1.8rem', 
        borderRadius: '24px', border: '1px solid rgba(255, 255, 255, 0.5)', 
        boxShadow: '0 10px 40px rgba(138, 99, 210, 0.08)' 
      }}>
        <div style={{ flex: 1, minWidth: '240px' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '800', marginBottom: '0.6rem', color: 'var(--primary-dark)', opacity: 0.8 }}>
            🔍 {isHe ? 'חפש לפי קורס או נושא' : 'Search by Course/Topic'}
          </label>
          <input 
            type="text" 
            className="input-field" 
            style={{ borderRadius: '14px', border: '1px solid rgba(138, 99, 210, 0.15)', background: 'white' }}
            placeholder={isHe ? 'למשל: אנטומיה, פיזיקה 1...' : 'e.g. Anatomy, Physics...'} 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div style={{ width: '200px' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '800', marginBottom: '0.6rem', color: 'var(--primary-dark)', opacity: 0.8 }}>
            🎓 {isHe ? 'חוג' : 'Major'}
          </label>
          <select className="input-field" style={{ borderRadius: '14px', border: '1px solid rgba(138, 99, 210, 0.15)', background: 'white' }} value={filterMajor} onChange={(e) => setFilterMajor(e.target.value)}>
            <option value="All">{isHe ? 'כל החוגים' : 'All Majors'}</option>
            {Object.entries(t.degrees).map(([k, v]) => (
              <option key={k} value={k}>{v as string}</option>
            ))}
          </select>
        </div>
        <div style={{ width: '150px' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '800', marginBottom: '0.6rem', color: 'var(--primary-dark)', opacity: 0.8 }}>
            🗓️ {isHe ? 'שנה' : 'Year'}
          </label>
          <select className="input-field" style={{ borderRadius: '14px', border: '1px solid rgba(138, 99, 210, 0.15)', background: 'white' }} value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
            <option value="All">{isHe ? 'כל השנים' : 'All Years'}</option>
            {Object.entries(t.years).map(([k, v]) => (
              <option key={k} value={k}>{v as string}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '2.5rem' }}>
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
            actionLabel = isFull ? (isHe ? 'רשימת המתנה' : 'Join Waitlist') : (isHe ? 'הצטרפות לקבוצה' : 'Join Group');
            if (isFull) btnClass = 'btn-secondary'; 
          }

          return (
            <div key={group.id} className="glass-card" style={{ 
              display: 'flex', flexDirection: 'column', padding: '2.2rem', 
              transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)', position: 'relative', overflow: 'hidden',
              border: '1px solid rgba(255, 255, 255, 0.6)',
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.9) 0%, rgba(255, 255, 255, 0.7) 100%)',
              boxShadow: '0 15px 35px rgba(138, 99, 210, 0.1)',
              borderRadius: '28px',
              height: '100%'
            }}>
              {/* Status Badge */}
              <div style={{ position: 'absolute', top: '20px', right: isHe ? 'auto' : '20px', left: isHe ? '20px' : 'auto', zIndex: 2 }}>
                {isFull ? (
                  <span style={{ 
                    background: 'linear-gradient(135deg, #FF7676, #E53E3E)', color: 'white', 
                    padding: '0.5rem 1rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '900', 
                    boxShadow: '0 4px 12px rgba(229, 62, 62, 0.2)' 
                  }}>
                    {isHe ? 'התמלאה 🔒' : 'FULL 🔒'}
                  </span>
                ) : (
                  <span style={{ 
                    background: 'linear-gradient(135deg, #6FCF97, #27AE60)', color: 'white', 
                    padding: '0.5rem 1rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '900',
                    boxShadow: '0 4px 12px rgba(39, 174, 96, 0.2)'
                  }}>
                    {isHe ? `פנוי: ${group.maxMembers - group.members.length}` : `OPEN: ${group.maxMembers - group.members.length}`}
                  </span>
                )}
              </div>

              <div style={{ marginBottom: '1.5rem', marginTop: '1.8rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.8rem' }}>
                  <span style={{ 
                    fontSize: '0.75rem', fontWeight: '900', color: 'white', 
                    background: 'var(--primary-color)', padding: '0.4rem 0.8rem', borderRadius: '10px', 
                    letterSpacing: '0.5px' 
                  }}>
                    {isHe ? 'קורס' : 'Course'}: {group.course}
                  </span>
                </div>
                <h3 style={{ margin: '0 0 1.2rem 0', fontSize: '1.8rem', color: 'var(--primary-dark)', fontWeight: '900', lineHeight: 1.15 }}>
                  {group.title}
                </h3>
                
                <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
                  {group.degree && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--primary-dark)', background: '#F4F0FF', padding: '0.4rem 0.8rem', borderRadius: '12px', fontWeight: '700' }}>
                      🎓 {t.degrees[group.degree as keyof typeof t.degrees] || group.degree}
                    </div>
                  )}
                  {group.year && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--primary-dark)', background: '#F4F0FF', padding: '0.4rem 0.8rem', borderRadius: '12px', fontWeight: '700' }}>
                      🗓️ {t.years[group.year as keyof typeof t.years] || group.year.replace('year', '')}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ flex: 1, marginBottom: '2rem' }}>
                <div style={{ 
                  background: 'rgba(255, 255, 255, 0.6)', 
                  padding: '1.4rem', borderRadius: '20px', border: '1px solid rgba(138, 99, 210, 0.08)',
                  fontSize: '1rem', color: 'var(--text-main)', lineHeight: 1.6, position: 'relative',
                  fontStyle: group.description ? 'normal' : 'italic', opacity: group.description ? 1 : 0.6
                }}>
                  {group.description || (isHe ? 'אין תיאור לקבוצה זו...' : 'No description provided...')}
                </div>
              </div>
              
              <div style={{ borderTop: '2px dashed rgba(138, 99, 210, 0.12)', paddingTop: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ 
                      width: '44px', height: '44px', borderRadius: '16px', background: 'white', 
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', 
                      boxShadow: '0 6px 15px rgba(138, 99, 210, 0.15)', border: '1px solid rgba(138, 99, 210, 0.1)'
                    }}>👑</div>
                    <div>
                      <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: '900', color: 'var(--primary-dark)' }}>{group.manager}</p>
                      <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '700' }}>{isHe ? 'מנהל/ת הקבוצה' : 'Group Manager'}</p>
                    </div>
                  </div>
                  <div 
                    onClick={() => setSelectedParticipants(group.members)}
                    style={{ 
                      textAlign: isHe ? 'left' : 'right', cursor: 'pointer', padding: '0.6rem 1rem', 
                      borderRadius: '16px', transition: 'all 0.2s', background: 'rgba(138, 99, 210, 0.05)'
                    }}
                    className="hover-bg-light"
                  >
                    <p style={{ margin: 0, fontSize: '1rem', fontWeight: '900', color: 'var(--primary-color)' }}>{group.members.length} / {group.maxMembers}</p>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '800' }}>{isHe ? 'משתתפים 👥' : 'Joiners 👥'}</p>
                  </div>
                </div>

                <div style={{ 
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                  background: 'white', padding: '1.2rem', borderRadius: '20px', 
                  boxShadow: '0 8px 25px rgba(0,0,0,0.02)', border: '1px solid rgba(138, 99, 210, 0.08)' 
                }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: '900', color: 'var(--primary-dark)' }}>
                    {prettyDate(group.dateStr)}
                  </span>
                  <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                    {group.joinedStatus === 'approved' ? (
                      <>
                         <button 
                          onClick={() => handleActionClick(group.id)} 
                          style={{ background: 'none', border: 'none', color: '#FF5252', fontSize: '0.85rem', cursor: 'pointer', fontWeight: '900', padding: '0.5rem' }}
                        >
                          {isHe ? 'עזוב' : 'Leave'}
                        </button>
                        <button 
                          onClick={() => router.push('/groups/' + group.id)} 
                          className="btn-primary" 
                          style={{ padding: '0.6rem 1.4rem', fontSize: '0.9rem', fontWeight: '900', borderRadius: '14px', boxShadow: '0 8px 20px rgba(138, 99, 210, 0.3)' }}
                        >
                          {actionLabel}
                        </button>
                      </>
                    ) : (
                      <button 
                        className={btnClass} 
                        style={{ padding: '0.7rem 1.8rem', fontSize: '0.9rem', fontWeight: '900', borderRadius: '14px' }} 
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
        <div className="modal-overlay" style={{ backdropFilter: 'blur(15px)' }} onClick={() => setSelectedParticipants(null)}>
          <div className="modal-content glass-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px', borderRadius: '32px', padding: '2.5rem' }}>
            <h3 style={{ margin: '0 0 2rem 0', color: 'var(--primary-dark)', fontSize: '2rem', textAlign: 'center', fontFamily: '"DynaPuff", cursive' }}>
              {isHe ? 'משתתפי הקבוצה' : 'Group Members'}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {selectedParticipants.map(participant => (
                <div key={participant.id} style={{ display: 'flex', alignItems: 'center', gap: '1.2rem', padding: '1rem', background: 'rgba(138, 99, 210, 0.04)', borderRadius: '18px', border: '1px solid rgba(138, 99, 210, 0.1)' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>👤</div>
                  <span style={{ fontWeight: '800', flex: 1, fontSize: '1.1rem', color: 'var(--primary-dark)' }}>{participant.name}</span>
                  {groups.find(g => g.members.some(m => m.id === participant.id))?.managerId === participant.id && (
                     <span style={{ fontSize: '0.75rem', background: 'var(--primary-color)', color: 'white', padding: '0.4rem 0.8rem', borderRadius: '2rem', fontWeight: '900' }}>{isHe ? 'מנהל/ת הקבוצה' : 'Group Manager'}</span>
                  )}
                </div>
              ))}
            </div>
            <button className="btn-primary" style={{ marginTop: '2.5rem', width: '100%', padding: '1rem', borderRadius: '16px' }} onClick={() => setSelectedParticipants(null)}>
               {isHe ? 'סגירה' : 'Close'}
            </button>
          </div>
        </div>
      )}

      {groups.length === 0 && !isLoading && (
        <div style={{ textAlign: 'center', padding: '6rem', background: 'rgba(255,255,255,0.4)', borderRadius: '32px', border: '2px dashed rgba(138, 99, 210, 0.2)', marginTop: '3rem' }}>
          <p style={{ color: 'var(--primary-dark)', fontSize: '1.4rem', fontWeight: '800' }}>
            {isHe ? 'עוד אין קבוצות פעילות. תהיה הראשון לפתוח אחת! 🚀' : 'No active study groups yet. Start the first one! 🚀'}
          </p>
        </div>
      )}
    </div>
  );
}
