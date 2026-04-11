"use client"
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { translations } from '@/lib/i18n';
import { useLanguage } from '@/hooks/useLanguage';
import { supabase } from '@/lib/supabase';

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

        const deg = g.profiles?.degree || '';
        const yr = g.profiles?.year_of_study || g.profiles?.year || '';

        const formatDate = (ds: string) => {
          if (!ds || ds === 'TBD' || ds === 'טרם נקבע') return isHe ? 'עדיין לא נקבע תאריך ושעה' : 'Date/Time TBD';
          try {
            const d = new Date(ds);
            if (isNaN(d.getTime())) return ds;
            return `${d.getDate()}/${d.getMonth() + 1} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
          } catch(e) { return ds; }
        };

        return {
          id: g.id,
          title: g.title,
          course: g.course,
          degree: (t.degrees[deg as keyof typeof t.degrees] as string) || deg,
          year: (t.years[yr as keyof typeof t.years] as string) || yr,
          dateStr: formatDate(g.session_time || g.date_str),
          description: g.description || '',
          manager: g.profiles?.real_first_name || g.profiles?.alias || 'Manager',
          managerId: g.manager_id,
          maxMembers: g.max_capacity || 5,
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

  const filteredGroups = groups.filter(g => {
    const matchesSearch = g.title.toLowerCase().includes(searchQuery.toLowerCase()) || g.course.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesMajor = filterMajor === 'All' || g.degree === filterMajor || (t.degrees[filterMajor as keyof typeof t.degrees] === g.degree);
    const matchesYear = filterYear === 'All' || g.year === filterYear || (t.years[filterYear as keyof typeof t.years] === g.year);
    return matchesSearch && matchesMajor && matchesYear;
  });

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', paddingTop: '2.5rem', paddingBottom: '5rem', direction: isHe ? 'rtl' : 'ltr' }}>
      
      {/* Language Toggle */}
      <div style={{ position: 'fixed', top: '2rem', right: '2rem', zIndex: 100 }}>
        <button 
          onClick={() => setLanguage(language === 'he' ? 'en' : 'he')}
          style={{ padding: '0.4rem 0.8rem', borderRadius: '2rem', border: '1px solid var(--primary-color)', background: 'white', cursor: 'pointer', fontWeight: 'bold' }}
        >
          {language === 'he' ? 'English (En)' : 'עברית (He)'}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
          <Link href="/dashboard" className="btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
            {isHe ? '← חזרה לחשבון' : '← Back to Account'}
          </Link>
          <h1 style={{ fontSize: '2.5rem', margin: 0, fontFamily: '"DynaPuff", cursive', color: 'var(--primary-color)' }}>
            {isHe ? 'קבוצות למידה' : 'Study Groups'}
          </h1>
        </div>
        <Link href="/groups/create" className="btn-primary" style={{ padding: '0.8rem 1.8rem', fontSize: '1rem', borderRadius: '16px' }}>
          {isHe ? '+ יצירת קבוצה חדשה' : '+ Start Group'}
        </Link>
      </div>

      <div style={{ background: 'rgba(255, 152, 0, 0.1)', border: '2px dashed #ff9800', padding: '1.2rem', borderRadius: '15px', marginBottom: '2.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <span style={{ fontSize: '2rem' }}>⚠️</span>
        <p style={{ margin: 0, color: 'var(--text-main)', fontSize: '0.95rem', fontWeight: '600', lineHeight: 1.5 }}>
           {isHe 
             ? 'כאן כל החברים מזוהים בשמם המלא ופרטיהם האישיים ליצירת סביבת לימודים מקצועית ואמינה.' 
             : 'No Anonymity Here! Your real name and details are exposed for a professional study environment.'}
        </p>
      </div>

      <div style={{ 
        display: 'flex', gap: '1.2rem', marginBottom: '2.5rem', flexWrap: 'wrap', 
        background: 'rgba(255, 255, 255, 0.6)', padding: '1.5rem', borderRadius: '20px', 
        border: '1px solid rgba(0,0,0,0.05)'
      }}>
        <div style={{ flex: 1, minWidth: '240px' }}>
          <input 
            type="text" 
            className="input-field" 
            placeholder={isHe ? 'חפש לפי קורס או נושא פה...' : 'Search course or topic here...'} 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <select className="input-field" style={{ width: '180px' }} value={filterMajor} onChange={(e) => setFilterMajor(e.target.value)}>
            <option value="All">{isHe ? 'כל החוגים' : 'All Majors'}</option>
            {Object.entries(t.degrees).map(([k, v]) => (
              <option key={k} value={k}>{v as string}</option>
            ))}
          </select>
          <select className="input-field" style={{ width: '120px' }} value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
            <option value="All">{isHe ? 'כל השנים' : 'All Years'}</option>
            {Object.entries(t.years).map(([k, v]) => (
              <option key={k} value={k}>{v as string}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2.5rem' }}>
        {filteredGroups.map((group) => {
          const isFull = group.members.length >= group.maxMembers;
          const slotsLeft = group.maxMembers - group.members.length;
          
          let actionLabel = isHe ? (isFull ? 'רשימת המתנה' : 'הצטרפות') : (isFull ? 'Waitlist' : 'Join');
          if (group.joinedStatus === 'approved') actionLabel = isHe ? 'עזוב קבוצה' : 'Leave';
          if (group.joinedStatus === 'waiting') actionLabel = isHe ? 'צא מהמתנה' : 'Leave';

          return (
            <div key={group.id} className="glass-card" style={{ 
              display: 'flex', flexDirection: 'column', padding: '2rem', 
              borderRadius: '35px', boxShadow: '0 12px 40px rgba(0,0,0,0.05)', background: 'white', border: 'none',
              transition: 'transform 0.2s ease-in-out'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.2rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.4rem', color: 'var(--primary-dark)', fontWeight: '900', fontFamily: '"DynaPuff", cursive' }}>{group.title}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
                   <span style={{ 
                      background: isFull ? '#FFEDED' : '#F0FDF4', 
                      color: isFull ? '#FF7676' : '#22C55E', 
                      padding: '0.5rem 0.8rem', borderRadius: '12px', 
                      fontSize: '1rem', fontWeight: '900',
                      boxShadow: '0 4px 10px rgba(0,0,0,0.05)'
                   }}>
                     {isFull ? (isHe ? 'מלא' : 'FULL') : `${slotsLeft} ${isHe ? 'מקומות פנויים' : 'SPOTS LEFT'}`}
                   </span>
                   <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>
                      {group.members.length}/{group.maxMembers}
                   </span>
                </div>
              </div>
              
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '1.2rem' }}>
                <span style={{ background: '#F5F1FF', color: 'var(--primary-color)', padding: '0.4rem 0.8rem', borderRadius: '10px', fontSize: '0.85rem', fontWeight: '800' }}>📚 {group.course}</span>
                {group.degree && <span style={{ background: '#F5F1FF', color: 'var(--primary-color)', padding: '0.4rem 0.8rem', borderRadius: '10px', fontSize: '0.85rem', fontWeight: '800' }}>🎓 {group.degree}</span>}
                {group.year && <span style={{ background: '#F5F1FF', color: 'var(--primary-color)', padding: '0.4rem 0.8rem', borderRadius: '10px', fontSize: '0.85rem', fontWeight: '800' }}>📅 {group.year}</span>}
              </div>

              <div style={{ background: '#F9F8FF', padding: '1.2rem', borderRadius: '25px', marginBottom: '1.8rem', fontSize: '0.95rem' }}>
                <p style={{ margin: '0 0 0.8rem 0', fontWeight: '800' }}><strong>👑 {isHe ? 'מנהל:' : 'Manager:'}</strong> {group.manager}</p>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontWeight: '600' }}>
                  <strong>👥 {isHe ? 'משתתפים:' : 'Members:'}</strong> {group.members.length > 0 ? group.members.map(m => m.name).join(', ') : (isHe ? 'טרם הצטרפו' : 'None yet')}
                </p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', borderTop: '1px solid #F3F0FF', paddingTop: '1.2rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: '900', color: group.dateStr.includes(':') ? 'var(--primary-color)' : '#999' }}>
                   🕒 {group.dateStr}
                </span>
                <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                  {group.joinedStatus === 'approved' ? (
                    <>
                      <button onClick={() => router.push('/groups/' + group.id)} className="btn-primary" style={{ padding: '0.6rem 1.4rem', borderRadius: '14px' }}>
                        {isHe ? 'צאט' : 'Chat'}
                      </button>
                      <button onClick={() => handleActionClick(group.id)} style={{ background: 'transparent', border: 'none', color: '#FF7676', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold' }}>
                        {isHe ? 'צא מהקבוצה' : 'Leave'}
                      </button>
                    </>
                  ) : (
                    <button className={group.joinedStatus !== 'none' ? 'btn-secondary' : 'btn-primary'} style={{ padding: '0.7rem 1.6rem', borderRadius: '14px' }} onClick={() => handleActionClick(group.id)}>
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
        <div style={{ textAlign: 'center', padding: '6rem', background: 'rgba(255,255,255,0.4)', borderRadius: '32px', border: '2px dashed rgba(138, 99, 210, 0.2)', marginTop: '3rem' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🚀</div>
          <p style={{ color: 'var(--primary-dark)', fontSize: '1.6rem', fontWeight: '900' }}>
            {isHe ? 'בואו נתחיל ללמוד ביחד! 🚀' : "Let's start studying together! 🚀"}
          </p>
        </div>
      )}
    </div>
  );
}
