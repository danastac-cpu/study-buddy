"use client"
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef, use } from 'react';
import { translations } from '@/lib/i18n';
import { useLanguage } from '@/hooks/useLanguage';
import { supabase } from '@/lib/supabase';

interface Message {
  id: string;
  sender_name: string;
  content: string;
  created_at: string;
  sender_id: string;
  room_id: string;
}

export default function GroupChatPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const unwrappedParams = use(params);
  const roomId = unwrappedParams.id;
  
  const { language, isReady } = useLanguage();
  const t = translations[language];
  const isHe = language === 'he';

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('Guest');
  const [onlineUsers, setOnlineUsers] = useState<Record<string, any>>({});
  const [members, setMembers] = useState<any[]>([]);

  // Group Details State
  const [savedTopic, setSavedTopic] = useState('');
  const [savedCourse, setSavedCourse] = useState('');
  const [savedTimeStr, setSavedTimeStr] = useState('');
  const [savedManagerId, setSavedManagerId] = useState('');
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [editTimeValue, setEditTimeValue] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 1. Get current user
    supabase.auth.getUser().then(({ data: authData }) => {
      if (authData.user) {
        setUserId(authData.user.id);
        supabase.from('profiles').select('alias').eq('id', authData.user.id).single()
          .then((res) => {
            if (res.data?.alias) setUserName(res.data.alias);
          });
      }
    });

    // 2. Fetch Group Details
    const fetchGroupDetails = async () => {
      const { data, error } = await supabase.from('study_groups').select('*').eq('id', roomId).single();
      if (!error && data) {
        setSavedTopic(data.title || data.topic);
        setSavedTimeStr(data.session_time || data.date_str || '');
        setEditTimeValue(data.session_time || data.date_str || '');
        setSavedCourse(data.course || 'Study Group');
        setSavedManagerId(data.manager_id);
      }
    };

    // 3. Fetch members
    const fetchMembers = async () => {
      const { data } = await supabase
        .from('group_enrollments')
        .select('user_id, profiles(alias, avatar_base)')
        .eq('group_id', roomId)
        .eq('status', 'approved');
      
      if (data) setMembers(data);
    };

    // 4. Fetch messages
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true });
        
      if (!error && data) setMessages(data as Message[]);
    };

    fetchGroupDetails();
    fetchMembers();
    fetchMessages();

    // 5. Subscribe to Realtime messages
    const channel = supabase.channel(`room_${roomId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` }, 
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  // Presence Effect
  useEffect(() => {
    if (!userId || !roomId) return;
 
    const pChannel = supabase.channel(`presence_${roomId}`, {
      config: { presence: { key: userId } }
    })
    .on('presence', { event: 'sync' }, () => {
      const state = pChannel.presenceState();
      setOnlineUsers(state);
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await pChannel.track({ user_id: userId, user_name: userName });
      }
    });
 
    return () => { supabase.removeChannel(pChannel); };
  }, [roomId, userId, userName]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSaveTime = async () => {
    const { error } = await supabase.from('study_groups').update({ session_time: editTimeValue }).eq('id', roomId);
    if (!error) {
      setSavedTimeStr(editTimeValue);
      setIsEditingTime(false);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !userId) return;

    const tmpMsg = newMessage;
    setNewMessage('');
    
    const { error } = await supabase.from('messages').insert([{
      room_id: roomId,
      sender_id: userId,
      sender_name: userName,
      content: tmpMsg
    }]);

    if(error) {
      setMessages(prev => [...prev, { id: Date.now().toString(), sender_name: userName, content: tmpMsg, created_at: new Date().toISOString(), sender_id: userId, room_id: roomId }]);
    }
  };

  const handleCloseGroup = async () => {
    if (userId !== savedManagerId) {
      alert(isHe ? 'רק מנהל הקבוצה יכול לסגור אותה.' : 'Only the group manager can close it.');
      return;
    }
    if(confirm(isHe ? 'סיימתם ללמוד? סביבת הלימוד תיסגר והקבוצה תוסר מהרשימות.' : 'Finished learning? The study environment will close and the group will be removed.')) {
      // Manual cascade delete
      await supabase.from('group_enrollments').delete().eq('group_id', roomId);
      await supabase.from('group_messages').delete().eq('room_id', roomId);
      
      const { error } = await supabase.from('study_groups').delete().eq('id', roomId);
      if (error) {
        alert('Error: ' + error.message);
      } else {
        alert(isHe ? 'הקבוצה נסגרה בהצלחה! ✨' : 'Group closed successfully! ✨');
        router.push('/groups');
      }
    }
  };

  const handleDeleteGroup = async () => {
    if (userId !== savedManagerId) {
      alert(isHe ? 'רק מנהל הקבוצה יכול למחוק אותה.' : 'Only the group manager can delete it.');
      return;
    }
    if(confirm(isHe ? 'בטוח/ה שברצונך למחוק את הקבוצה לצמיתות?' : 'Are you sure you want to delete this group permanently?')) {
      // Manual cascade delete
      await supabase.from('group_enrollments').delete().eq('group_id', roomId);
      await supabase.from('group_messages').delete().eq('room_id', roomId);

      const { error } = await supabase.from('study_groups').delete().eq('id', roomId);
      if (error) {
        alert('Error: ' + error.message);
      } else {
        alert(isHe ? 'הקבוצה נמחקה בהצלחה!' : 'Group deleted successfully!');
        router.push('/groups');
      }
    }
  };

  if (!isReady) return null;

  return (
    <div className="app-wrapper" style={{ direction: isHe ? 'rtl' : 'ltr' }}>
      
      <nav className="sidebar">
        <Link href="/groups" className="btn-secondary" style={{ marginBottom: '2rem', padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
          {isHe ? '← חזרה לקבוצות' : '← Back to Groups'}
        </Link>
        <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem', fontFamily: '"DynaPuff", "Fredoka", "Outfit", cursive', color: 'var(--primary-color)' }}>Study Group #{roomId.slice(0,4)}</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
          {isHe ? 'קבוצת למידה פעילה' : 'Active Study Group'}
        </p>
        
        {/* Group Info Block */}
        <div style={{ background: 'var(--background-bg)', padding: '1rem', borderRadius: '8px', marginBottom: '2rem', border: '1px solid rgba(0,0,0,0.05)' }}>
           <h3 style={{ fontSize: '0.95rem', marginBottom: '0.5rem', color: 'var(--primary-dark)' }}>ℹ️ {isHe ? 'פרטי הקבוצה' : 'Group Details'}</h3>
           
           <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                🗓️ 
                {isEditingTime ? (
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', background: 'white', padding: '0.5rem', borderRadius: '8px', boxShadow: 'var(--shadow-sm)' }}>
                    <input type="date" className="input-field" 
                           defaultValue={(savedTimeStr === 'טרם נקבע' || !savedTimeStr.includes('-')) ? '' : savedTimeStr.split(' ')[0]} 
                           onChange={(e) => {
                             const date = e.target.value;
                             const time = editTimeValue.includes(':') ? editTimeValue.split(' ')[1] : '10:00';
                             setEditTimeValue(`${date} ${time}`);
                           }}
                           style={{ padding: '0.4rem', fontSize: '0.9rem', width: '130px' }} />
                    <input type="time" className="input-field" 
                           defaultValue={(savedTimeStr === 'טרם נקבע' || !savedTimeStr.includes(':')) ? '' : savedTimeStr.split(' ')[1]} 
                           onChange={(e) => {
                             const time = e.target.value;
                             const date = editTimeValue.includes('-') ? editTimeValue.split(' ')[0] : new Date().toISOString().split('T')[0];
                             setEditTimeValue(`${date} ${time}`);
                           }}
                           style={{ padding: '0.4rem', fontSize: '0.9rem', width: '90px' }} />
                    <div style={{ display: 'flex', gap: '0.3rem', width: '100%' }}>
                      <button onClick={handleSaveTime} className="btn-primary" style={{ flex: 1, padding: '0.3rem', fontSize: '0.8rem' }}>שמור</button>
                      <button onClick={() => setIsEditingTime(false)} className="btn-secondary" style={{ flex: 1, padding: '0.3rem', fontSize: '0.8rem' }}>ביטול</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontWeight: '500' }}>{savedTimeStr || (isHe ? 'טרם נקבע' : 'TBD')}</span>
                    {userId === savedManagerId && (
                      <button onClick={() => setIsEditingTime(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }} title={isHe ? "ערוך מועד" : "Edit Time"}>✏️</button>
                    )}
                  </div>
                )}
              </div>
           </div>
           
           <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem' }}><strong>{isHe ? 'קורס:' : 'Course:'}</strong> {savedCourse}</p>
        </div>
        
        <h3 style={{ fontSize: '1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {isHe ? 'חברי הקבוצה' : 'Group Members'}
          <span style={{ fontSize: '0.7rem', background: '#e8f5e9', color: '#2e7d32', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>{isHe ? '🟢 מחובר' : '🟢 Online'}</span>
        </h3>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {members.map((member) => (
            <li key={member.user_id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ position: 'relative' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--primary-color)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>
                  {member.profiles?.avatar_base ? '👤' : (member.profiles?.alias?.charAt(0).toUpperCase() || '?')}
                </div>
                {onlineUsers[member.user_id] && (
                  <div style={{ position: 'absolute', bottom: 0, right: 0, width: '10px', height: '10px', background: '#4CAF50', borderRadius: '50%', border: '2px solid white' }}></div>
                )}
              </div>
              <div>
                <span style={{ fontWeight: '500', display: 'block', fontSize: '0.9rem' }}>
                  {member.profiles?.alias} {member.user_id === userId ? '(You)' : ''}
                </span>
              </div>
            </li>
          ))}
          {members.length === 0 && (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{isHe ? 'אין חברים נוספים עדיין' : 'No other members yet.'}</p>
          )}
        </ul>

        <div style={{ marginTop: 'auto', paddingTop: '2rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            <button 
              onClick={handleCloseGroup} 
              className="btn-primary" 
              style={{ width: '100%', background: 'var(--primary-color)', fontWeight: 'bold' }}
            >
              {isHe ? '✅ סיימנו ללמוד (סגור קבוצה)' : '✅ Finished Learning (Close Group)'}
            </button>
          <button 
            onClick={handleDeleteGroup} 
            className="btn-secondary" 
            style={{ width: '100%', borderColor: '#F44336', color: '#F44336', background: 'rgba(244, 67, 54, 0.05)' }}
          >
            {isHe ? '🗑️ מחק קבוצה (מנהל)' : '🗑️ Delete Group (Manager)'}
          </button>
        </div>
      </nav>
      
      <main className="main-content" style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 0 }}>
        {/* Header Options */}
        <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid rgba(138, 99, 210, 0.1)', background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', margin: 0, fontFamily: '"DynaPuff", "Fredoka", "Outfit", cursive' }}>
             {isHe ? 'צ׳אט קבוצתי' : 'Group Chat'}
          </h1>
          
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <a 
              href={`https://meet.jit.si/StudyBuddy-${roomId}`}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary" 
              style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', fontSize: '0.9rem', border: '1px solid var(--primary-color)', color: 'var(--primary-color)', background: 'white' }}
            >
              <span style={{ fontSize: '1.2rem' }}>📹</span> {isHe ? 'יצירת פגישת וידאו' : 'Create Video Meeting'}
            </a>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '4px' }}>Powered by Jitsi Video Rooms</span>
          </div>
        </div>

        {/* Chat Area */}
        <div style={{ flex: 1, padding: '2rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '2rem' }}>
              {isHe ? 'אין עדיין הודעות בקבוצה זו. תהיו הראשונים!' : 'No messages yet. Be the first!'}
            </div>
          )}
          {messages.map((msg, idx) => {
            const isMe = msg.sender_id === userId;
            return (
              <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? (isHe ? 'flex-start' : 'flex-end') : (isHe ? 'flex-end' : 'flex-start'), maxWidth: '100%' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.2rem', margin: '0 0.5rem' }}>
                  {msg.sender_name} • {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <div style={{ 
                  background: isMe ? 'var(--primary-color)' : 'white', 
                  color: isMe ? 'white' : 'var(--text-main)',
                  padding: '1rem', 
                  borderRadius: 'var(--radius-md)', 
                  borderTopLeftRadius: isMe && isHe ? '16px' : (isMe ? 0 : '16px'),
                  borderTopRightRadius: isMe && isHe ? 0 : (isMe ? '16px' : 0),
                  boxShadow: 'var(--shadow-sm)',
                  maxWidth: '70%',
                  textAlign: isHe ? 'right' : 'left'
                }}>
                  {msg.content}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Chat Input */}
        <div style={{ padding: '2rem', borderTop: '1px solid rgba(138, 99, 210, 0.1)', background: 'var(--background-bg)' }}>
          <form onSubmit={sendMessage} style={{ display: 'flex', gap: '1rem' }}>
            <input 
              type="text" 
              className="input-field" 
              placeholder={isHe ? "הקלידו הודעה לקבוצה..." : "Type a message to your group..."} 
              style={{ flex: 1 }} 
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
            />
            <button type="submit" className="btn-primary" style={{ padding: '0 2rem' }}>
              {isHe ? 'שלח' : 'Send'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
