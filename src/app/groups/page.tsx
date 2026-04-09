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

        let rawDesc = g.description || '';
        let pref = 'both';
        if (rawDesc.includes('<!-- PREF:')) {
           const match = rawDesc.match(/<!-- PREF:(.*?) -->/);
           if (match) pref = match[1];
           rawDesc = rawDesc.replace(/<!-- PREF:.*?-->/, '').trim();
        }

        let deg = g.profiles?.degree || '';
        let yr = g.profiles?.year_of_study || g.profiles?.year || '';

        if (pref === 'none') { deg = ''; yr = ''; }
        else if (pref === 'major') { yr = ''; }
        else if (pref === 'year') { deg = ''; }

        return {
          id: g.id,
          title: g.title,
          course: g.course,
          degree: (t.degrees[deg as keyof typeof t.degrees] as string) || deg,
          year: (t.years[yr as keyof typeof t.years] as string) || yr,
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

      {/* No Anonymity Warning Restored */}
      <div style={{ background: 'rgba(255, 152, 0, 0.1)', border: '2px dashed #ff9800', padding: '1.2rem', borderRadius: '15px', marginBottom: '2.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <span style={{ fontSize: '2rem' }}>⚠️</span>
        <p style={{ margin: 0, color: 'var(--text-main)', fontSize: '0.95rem', fontWeight: '600', lineHeight: 1.5 }}>
           {isHe 
             ? 'כאן כל החברים מזוהים בשמם המלא ופרטיהם האישיים ליצירת סביבת לימודים מקצועית ואמינה. השם והתמונה המקוריים שלך יוצגו למי שיצטרף לקבוצה.' 
             : 'No Anonymity Here! Creating or joining a study group exposes your Real Name and Actual Details for an effective and reliable study environment.'}
        </p>
      </div>

      {/* Filters Search/Major/Year Restored */}
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

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
        {filteredGroups.map((group) => {
          const isFull = group.members.length >= group.maxMembers;
          let actionLabel = isHe ? (isFull ? 'רשימת המתנה' : 'הצטרפות') : (isFull ? 'Waitlist' : 'Join');
          if (group.joinedStatus === 'approved') actionLabel = isHe ? 'עזוב קבוצה' : 'Leave';
          if (group.joinedStatus === 'waiting') actionLabel = isHe ? 'צא מהמתנה' : 'Leave';

          return (
            <div key={group.id} className="glass-card" style={{ 
              display: 'flex', flexDirection: 'column', padding: '1.8rem', 
              borderRadius: '35px', boxShadow: '0 8px 30px rgba(0,0,0,0.04)', background: 'white', border: 'none'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.3rem', color: 'var(--primary-dark)', fontWeight: '900' }}>{group.title}</h3>
                {isFull ? (
                  <span style={{ background: '#FFEDED', color: '#FF7676', padding: '0.3rem 0.6rem', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                    FULL ({group.members.length}/{group.maxMembers})
                  </span>
                ) : (
                  <span style={{ background: '#F0FDF4', color: '#22C55E', padding: '0.3rem 0.6rem', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                    {group.maxMembers - group.members.length} SPOTS LEFT
                  </span>
                )}
              </div>
              
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                <span style={{ background: '#F5F1FF', color: 'var(--primary-color)', padding: '0.3rem 0.6rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: '800' }}>📚 {group.course}</span>
                {group.degree && <span style={{ background: '#F5F1FF', color: 'var(--primary-color)', padding: '0.3rem 0.6rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: '800' }}>🎓 {group.degree}</span>}
                {group.year && <span style={{ background: '#F5F1FF', color: 'var(--primary-color)', padding: '0.3rem 0.6rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: '800' }}>📅 {group.year}</span>}
              </div>

              <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginTop: '0', marginBottom: '1.5rem', lineHeight: 1.5 }}>{group.description}</p>
              
              <div style={{ background: '#F9F8FF', padding: '1.2rem', borderRadius: '20px', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                <p style={{ margin: '0 0 0.6rem 0', fontWeight: '800' }}><strong>👑 {isHe ? 'מנהל:' : 'Manager:'}</strong> {group.manager}</p>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontWeight: '600' }}>
                  <strong>👥 {isHe ? 'משתתפים:' : 'Members:'}</strong> {group.members.length > 0 ? group.members.map(m => m.name).join(', ') : (isHe ? 'טרם הצטרפו' : 'None yet')}
                </p>
                <button 
                  onClick={() => alert((isHe ? 'רשימת משתתפים מלאה:\n' : 'Full members list:\n') + group.members.map(m => m.name).join('\n'))}
                  style={{ background: 'none', border: 'none', color: 'var(--primary-color)', fontSize: '0.75rem', padding: '0.5rem 0 0 0', cursor: 'pointer', fontWeight: 'bold', textDecoration: 'underline' }}
                >
                  {isHe ? '(צפה ברשימה המלאה)' : '(View full list)'}
                </button>
                {group.waitlist.length > 0 && (
                  <p style={{ margin: '0.8rem 0 0 0', color: '#B45309', fontSize: '0.8rem', fontWeight: 'bold' }}>
                    ⌛ {isHe ? 'רשימת המתנה:' : 'Waitlist:'} {group.waitlist.length} {isHe ? 'משתמשים' : 'students'}
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', borderTop: '1px solid #F3F0FF', paddingTop: '1rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#999' }}>{group.dateStr}</span>
                <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                  {group.joinedStatus === 'approved' ? (
                    <>
                      <button onClick={() => router.push('/groups/' + group.id)} className="btn-primary" style={{ padding: '0.5rem 1.2rem', borderRadius: '12px' }}>
                        {isHe ? 'צאט' : 'Chat'}
                      </button>
                      <button onClick={() => handleActionClick(group.id)} style={{ background: 'transparent', border: 'none', color: '#FF7676', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold' }}>
                        {isHe ? 'צא מהקבוצה' : 'Leave'}
                      </button>
                    </>
                  ) : (
                    <button className={group.joinedStatus !== 'none' ? 'btn-secondary' : 'btn-primary'} style={{ padding: '0.6rem 1.2rem', borderRadius: '12px' }} onClick={() => handleActionClick(group.id)}>
                       {actionLabel}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
 
      {/* Empty State Logic */}
      {groups.length === 0 && !isLoading && (
        <div style={{ textAlign: 'center', padding: '6rem', background: 'rgba(255,255,255,0.4)', borderRadius: '32px', border: '2px dashed rgba(138, 99, 210, 0.2)', marginTop: '3rem' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🚀</div>
          <p style={{ color: 'var(--primary-dark)', fontSize: '1.6rem', fontWeight: '900' }}>
            {isHe ? 'בואו נתחיל ללמוד ביחד! 🚀' : "Let's start studying together! 🚀"}
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>
            {isHe ? 'עוד אין קבוצות פעילות. תהיה הראשון לפתוח אחת!' : 'No active study groups yet. Be the first to start one!'}
          </p>
        </div>
      )}

      {groups.length > 0 && filteredGroups.length === 0 && (
         <div style={{ textAlign: 'center', padding: '4rem', marginTop: '2rem' }}>
           <p style={{ color: 'var(--primary-dark)', fontSize: '1.4rem', fontWeight: '900' }}>
             {isHe ? 'לא נמצאו קבוצות 🔍' : 'No groups found 🔍'}
           </p>
           <p style={{ color: 'var(--text-muted)' }}>
              {isHe ? 'נסה לשנות את הפילטרים או את החיפוש.' : 'Try changing your filters or search query.'}
           </p>
         </div>
      )}
    </div>
  );
}
