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

    const { data: groupsData, error: groupsError } = await supabase
      .from('study_groups')
      .select('*, profiles:profiles!manager_id(alias, degree, year, year_of_study, real_first_name)')
      .order('created_at', { ascending: false });

    if (groupsError) return;

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
        let deg = g.profiles?.degree || g.profiles?.major || '';
        let yr = g.profiles?.year_of_study || g.profiles?.year || '';

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'study_groups' }, () => fetchGroups())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_enrollments' }, () => fetchGroups())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isHe]);

  if (!isReady) return null;

  const handleActionClick = async (groupId: string) => {
    if (!currentUser) return;
    const group = groups.find(g => g.id === groupId);
    if (!group) return;

    if (group.joinedStatus !== 'none') {
      const confirmLeave = confirm(isHe ? 'האם אתה מעוניין לעזוב את קבוצת הלמידה?' : 'Are you sure you want to leave this study group?');
      if (confirmLeave) {
        await supabase.from('group_enrollments').delete().eq('group_id', groupId).eq('user_id', currentUser.id);
        fetchGroups();
      }
      return;
    }

    if (group.joinedStatus === 'none') {
      const isFull = group.members.length >= group.maxMembers;
      const status = isFull ? 'waiting' : 'approved';
      await supabase.from('group_enrollments').insert([{ group_id: groupId, user_id: currentUser.id, status: status }]);
      fetchGroups();
      if (status === 'approved') router.push(`/groups/${groupId}`);
    }
  };

  const prettyDate = (dateStr: string) => {
    if (!dateStr || dateStr === 'TBD' || dateStr === 'טרם נקבע') {
       return isHe ? '📅 עדיין לא נקבע תאריך' : '📅 Date not yet set';
    }
    if (dateStr.includes('T') && dateStr.includes('-')) {
      try {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          return `📅 ${d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })} | ${d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`;
        }
      } catch (e) {}
    }
    return `📅 ${dateStr}`;
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', paddingTop: '2.5rem', paddingBottom: '5rem', direction: isHe ? 'rtl' : 'ltr' }}>
      
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2.5rem', padding: '0 1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
          <Link href="/dashboard" className="btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', borderRadius: '12px' }}>
            {isHe ? '← חזרה' : '← Back'}
          </Link>
          <h1 style={{ fontSize: '2.5rem', margin: 0, fontFamily: '"DynaPuff", cursive', color: 'var(--primary-dark)' }}>
            {isHe ? 'קבוצות למידה' : 'Study Groups'}
          </h1>
        </div>
        <Link href="/groups/create" className="btn-primary" style={{ padding: '0.8rem 1.8rem', fontSize: '1rem', borderRadius: '16px' }}>
          {isHe ? '+ יצירת קבוצה' : '+ Start Group'}
        </Link>
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem', padding: '1rem' }}>
        {groups
          .filter(g => {
            const matchesSearch = g.title.toLowerCase().includes(searchQuery.toLowerCase()) || g.course.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesMajor = filterMajor === 'All' || g.degree === filterMajor;
            return matchesSearch && matchesMajor;
          })
          .map((group) => {
          const isFull = group.members.length >= group.maxMembers;
          const isManager = group.managerId === currentUser?.id;
          let actionLabel = isHe ? (isFull ? 'רשימת המתנה' : 'הצטרפות') : (isFull ? 'Waitlist' : 'Join');
          if (group.joinedStatus === 'approved') actionLabel = isHe ? 'עבור לצאט' : 'Go to Chat';
          if (group.joinedStatus === 'waiting') actionLabel = isHe ? 'בהמתנה' : 'Waiting';

          return (
            <div key={group.id} className="glass-card" style={{ 
              display: 'flex', flexDirection: 'column', padding: '1.8rem', 
              background: 'white', borderRadius: '35px', border: 'none',
              boxShadow: '0 10px 30px rgba(138, 99, 210, 0.06)', position: 'relative'
            }}>
              <div style={{ position: 'absolute', top: '20px', right: isHe ? 'auto' : '20px', left: isHe ? '20px' : 'auto' }}>
                <span style={{ 
                  background: isFull ? '#FFEDED' : '#F0FDF4', 
                  color: isFull ? '#FF7676' : '#22C55E', 
                  padding: '0.4rem 0.8rem', borderRadius: '10px', fontSize: '0.7rem', fontWeight: '900' 
                }}>
                  {isFull ? (isHe ? 'מלא' : 'FULL') : (isHe ? `פנוי: ${group.maxMembers - group.members.length}` : `OPEN: ${group.maxMembers - group.members.length}`)}
                </span>
              </div>

              <div style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: '900', color: 'var(--primary-color)', background: '#F5F3FF', padding: '0.3rem 0.6rem', borderRadius: '8px' }}>
                  📚 {group.course}
                </span>
                <h3 style={{ margin: '0.5rem 0 0 0', fontSize: '1.4rem', color: 'var(--primary-dark)', fontWeight: '900' }}>
                  {group.title}
                </h3>
              </div>

              <p style={{ fontSize: '0.9rem', color: '#666', lineHeight: 1.5, flex: 1, marginBottom: '1.5rem' }}>
                {group.description || (isHe ? 'בואו ללמוד יחד!' : "Let's study together!")}
              </p>

              <div style={{ borderTop: '1px solid #F8F7FF', paddingTop: '1.2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#F5F3FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>👑</div>
                    <span style={{ fontSize: '0.85rem', fontWeight: '800' }}>{group.manager}</span>
                  </div>
                  <span 
                    onClick={() => setSelectedParticipants(group.members)}
                    style={{ cursor: 'pointer', fontSize: '0.85rem', fontWeight: '800', color: 'var(--primary-color)', background: '#F5F3FF', padding: '0.3rem 0.6rem', borderRadius: '10px' }}
                  >
                    {group.members.length}/{group.maxMembers} 👥
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#999' }}>{prettyDate(group.dateStr)}</span>
                  <button 
                    onClick={() => group.joinedStatus === 'approved' ? router.push(`/groups/${group.id}`) : handleActionClick(group.id)}
                    className="btn-primary" 
                    style={{ padding: '0.6rem 1.2rem', borderRadius: '14px', fontSize: '0.85rem' }}
                  >
                    {actionLabel}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Participant Modal */}
      {selectedParticipants && (
        <div className="modal-overlay" style={{ backdropFilter: 'blur(10px)', zIndex: 1000 }} onClick={() => setSelectedParticipants(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px', borderRadius: '30px', padding: '2rem', background: 'white' }}>
            <h3 style={{ textAlign: 'center', marginBottom: '1.5rem', fontFamily: '"DynaPuff", cursive' }}>{isHe ? 'משתתפי הקבוצה' : 'Members'}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              {selectedParticipants.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.8rem', background: '#F9F7FF', borderRadius: '15px' }}>
                  <span>👤</span>
                  <span style={{ fontWeight: '800' }}>{p.name}</span>
                </div>
              ))}
            </div>
            <button className="btn-primary" style={{ marginTop: '2rem', width: '100%', borderRadius: '15px' }} onClick={() => setSelectedParticipants(null)}>{isHe ? 'סגירה' : 'Close'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
