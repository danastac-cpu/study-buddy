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

  const fetchGroups = async () => {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;
    setCurrentUser(user);

    // 1. Fetch All Groups
    const { data: groupsData, error: groupsError } = await supabase
      .from('study_groups')
      .select('*, profiles(alias, degree, year, real_first_name)')
      .order('created_at', { ascending: false });

    if (groupsError) return;

    // 2. Fetch All Enrollments with profiles
    const { data: enrollData } = await supabase
      .from('group_enrollments')
      .select('*, profiles(real_first_name, alias)');

    if (groupsData) {
      const formatted = groupsData.map((g: any) => {
        const groupEnrolls = enrollData?.filter(e => e.group_id === g.id) || [];
        const approved = groupEnrolls.filter(e => e.status === 'approved').map(e => ({ name: e.profiles?.real_first_name || e.profiles?.alias || 'Student', id: e.user_id }));
        const waiting = groupEnrolls.filter(e => e.status === 'waiting').map(e => ({ name: e.profiles?.real_first_name || e.profiles?.alias || 'Student', id: e.user_id }));
        
        const myEnroll = groupEnrolls.find(e => e.user_id === user?.id);
        const status = myEnroll ? myEnroll.status : 'none';

        return {
          id: g.id,
          title: g.topic,
          course: g.course,
          degree: g.profiles?.degree || '',
          year: g.profiles?.year || '',
          dateStr: g.date_str,
          description: g.description,
          manager: g.profiles?.real_first_name || g.profiles?.alias || 'Manager',
          maxMembers: g.max_members,
          members: approved,
          waitlist: waiting,
          joinedStatus: status as any
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
        // 1. Delete enrollment
        await supabase.from('group_enrollments').delete().eq('group_id', groupId).eq('user_id', currentUser.id);
        
        // 2. If I was 'approved', promote first 'waiting' if exists
        if (group.joinedStatus === 'approved' && group.waitlist.length > 0) {
            const nextInLine = group.waitlist[0];
            await supabase.from('group_enrollments').update({ status: 'approved' }).eq('group_id', groupId).eq('user_id', nextInLine.id);
            
            // 3. Notify them via 'updates' table
            await supabase.from('updates').insert([{
              user_id: nextInLine.id,
              type: 'waiting-list-open',
              title_he: 'התפנה לך מקום! 🎊',
              title_en: 'A spot opened up! 🎊',
              content_he: `מקום התפנה בקבוצה "${group.title}". הצטרפת אוטומטית!`,
              content_en: `A spot is available in "${group.title}". You've been added!`,
              group_id: group.id
            }]);
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

      {/* No Anonymity Warning */}
      <div style={{ background: 'rgba(255, 152, 0, 0.1)', border: '2px dashed #ff9800', padding: '1rem', borderRadius: '8px', marginBottom: '2rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <span style={{ fontSize: '1.5rem' }}>⚠️</span>
        <p style={{ margin: 0, color: 'var(--text-main)', fontSize: '0.9rem', fontWeight: '500' }}>
           {isHe ? 'כאן כל החברים מזוהים בשמם המלא ופרטיהם האישיים ליצירת סביבת לימודים מקצועית ואמינה.' : 'No Anonymity Here! Creating or joining a study group exposes your Real Name and Actual Details for an effective study environment.'}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
        {groups.map((group) => {
          const isFull = group.members.length >= group.maxMembers;
          
          let actionLabel = '';
          let btnClass = 'btn-primary';

          if (group.joinedStatus === 'approved') {
            actionLabel = isHe ? 'עזוב קבוצה' : 'Leave Group';
            btnClass = 'btn-secondary';
          } else if (group.joinedStatus === 'waiting') {
            actionLabel = isHe ? 'צא מהמתנה' : 'Leave Waitlist';
            btnClass = 'btn-secondary';
          } else {
            actionLabel = isFull ? (isHe ? 'רשימת המתנה' : 'Join Waitlist') : (isHe ? 'הצטרפות' : 'Join Group');
          }

          return (
            <div key={group.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--primary-color)' }}>{group.title}</h3>
                {isFull ? (
                  <span style={{ background: '#ffe0e0', color: '#cc0000', padding: '0.2rem 0.6rem', borderRadius: '1rem', fontSize: '0.8rem', fontWeight: 'bold' }}>
                    FULL ({group.members.length}/{group.maxMembers})
                  </span>
                ) : (
                  <span style={{ background: '#e0ffe0', color: '#008000', padding: '0.2rem 0.6rem', borderRadius: '1rem', fontSize: '0.8rem', fontWeight: 'bold' }}>
                    {group.maxMembers - group.members.length} SPOTS LEFT
                  </span>
                )}
              </div>
              
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                <span style={{ background: 'var(--primary-light)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '600' }}>📚 {group.course}</span>
                <span style={{ background: 'var(--primary-light)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '600' }}>🎓 {group.degree}</span>
              </div>

              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0', marginBottom: '1rem' }}>{group.description}</p>
              
              <div style={{ background: 'var(--background-bg)', padding: '1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                <p style={{ margin: '0 0 0.5rem 0' }}><strong>👑 {isHe ? 'מנהל:' : 'Manager:'}</strong> {group.manager}</p>
                <p style={{ margin: 0, color: 'var(--text-muted)' }}><strong>👥 {isHe ? 'חברים:' : 'Members:'}</strong> {group.members.map(m => m.name).join(', ')}</p>
                {group.waitlist.length > 0 && (
                  <p style={{ margin: '0.5rem 0 0 0', color: '#ff9800', fontSize: '0.8rem', fontWeight: 'bold' }}>
                    ⌛ {isHe ? 'מחכים:' : 'Waiting:'} {group.waitlist.length}
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>{group.dateStr}</span>
                <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                  {group.joinedStatus === 'approved' ? (
                    <>
                      <button onClick={() => router.push('/groups/' + group.id)} className="btn-primary" style={{ padding: '0.5rem 1rem' }}>
                        {isHe ? 'צ׳אט' : 'Chat'}
                      </button>
                      <button onClick={() => handleActionClick(group.id)} style={{ background: 'transparent', border: 'none', color: '#F44336', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.85rem' }}>
                        {isHe ? 'עזוב' : 'Leave'}
                      </button>
                    </>
                  ) : (
                    <button className={btnClass} style={{ padding: '0.5rem 1rem' }} onClick={() => handleActionClick(group.id)}>
                       {actionLabel}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
 
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
