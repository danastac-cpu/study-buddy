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
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [isUploading, setIsUploading] = useState(false);

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
        
        const formatDate = (ds: string) => {
          if (!ds || ds === 'TBD' || ds === 'טרם נקבע' || ds === 'לא נקבע מועד') return isHe ? 'טרם נקבע' : 'TBD';
          try {
            const d = new Date(ds);
            if (isNaN(d.getTime())) return ds;
            return `${d.getDate()}/${d.getMonth() + 1} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
          } catch(e) { return ds; }
        };

        setSavedTimeStr(formatDate(data.session_time || data.date_str));
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
    // 4. Clear notifications for this group
    if (userId) {
      supabase.from('updates').delete().eq('user_id', userId).eq('type', 'new_message').eq('request_id', roomId).then(() => {});
    }

    const channel = supabase.channel('group_changes_' + roomId)
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

  // Presence logic removed for privacy

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSaveTime = async () => {
    const { error } = await supabase.from('study_groups').update({ session_time: editTimeValue }).eq('id', roomId);
    if (!error) {
      const formatDate = (ds: string) => {
        if (!ds || ds === 'TBD' || ds === 'טרם נקבע') return isHe ? 'לא נקבע מועד' : 'TBD';
        try {
          const d = new Date(ds);
          if (isNaN(d.getTime())) return ds;
          return `${d.getDate()}/${d.getMonth() + 1} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
        } catch(e) { return ds; }
      };
      setSavedTimeStr(formatDate(editTimeValue));
      setIsEditingTime(false);
      
      // Notify other members of reschedule
      members.forEach((m) => {
         if (m.user_id !== userId) {
             supabase.from('updates').insert([{
                 user_id: m.user_id,
                 type: 'reschedule_report',
                 group_id: roomId,
                 title_he: 'עדכון במועד המפגש הקרוב 🗓️',
                 title_en: 'Update in upcoming session 🗓️',
                 content_he: `שים לב, שעת המפגש בקבוצה שונתה. המועד החדש: ${formatDate(editTimeValue)}`,
                 content_en: `Attention, the session time was changed. New time: ${formatDate(editTimeValue)}`
             }]).then(() => {});
         }
      });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${roomId}/${fileName}`;

      const { data, error } = await supabase.storage
        .from('chat-attachments')
        .upload(filePath, file);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('chat-attachments')
        .getPublicUrl(filePath);

      // Send as a special message
      const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExt?.toLowerCase() || '');
      const content = isImage ? `__MEDIA_IMAGE__:${publicUrl}` : `__MEDIA_FILE__:${file.name}|${publicUrl}`;

      await supabase.from('messages').insert([{
        room_id: roomId,
        sender_id: userId,
        sender_name: userName,
        content: content
      }]);

    } catch (err) {
      console.error('Upload error:', err);
      alert('Failed to upload file.');
    } finally {
      setIsUploading(false);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !userId) return;

    let content = newMessage;
    if (replyTo) {
      content = `> [REPLY:${replyTo.sender_name}]: ${replyTo.content}\n\n${newMessage}`;
    }

    setNewMessage('');
    setReplyTo(null);
    
    const { error } = await supabase.from('messages').insert([{
      room_id: roomId,
      sender_id: userId,
      sender_name: userName,
      content: content
    }]);

    if (!error) {
        // Notify other members
        members.forEach(m => {
          if (m.user_id !== userId) {
            supabase.from('updates').insert([{
                user_id: m.user_id,
                type: 'new_message',
                request_id: roomId,
                title_he: 'הודעה חדשה בקבוצה 📚',
                title_en: 'New message in group 📚',
                content_he: `הודעה חדשה ב-${savedTopic} מ-${userName}`,
                content_en: `New message in ${savedTopic} from ${userName}`
            }]).then(() => {});
          }
        });
    }

    if(error) {
      setMessages(prev => [...prev, { id: Date.now().toString(), sender_name: userName, content: content, created_at: new Date().toISOString(), sender_id: userId, room_id: roomId }]);
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
        <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem', fontFamily: '"DynaPuff", cursive', color: 'var(--primary-color)' }}>Study Group #{roomId.slice(0,4)}</h2>
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
                    <span style={{ fontWeight: '500', color: (savedTimeStr === 'לא נקבע מועד' || savedTimeStr === 'TBD') ? '#FF9800' : 'inherit' }}>
                      {savedTimeStr}
                    </span>
                    <button onClick={() => setIsEditingTime(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }} title={isHe ? "ערוך מועד" : "Edit Time"}>✏️</button>
                  </div>
                )}
              </div>
           </div>
           
           <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem' }}><strong>{isHe ? 'קורס:' : 'Course:'}</strong> {savedCourse}</p>
        </div>
        
        <h3 style={{ fontSize: '1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {isHe ? 'חברי הקבוצה' : 'Group Members'}
        </h3>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {members.map((member) => (
            <li key={member.user_id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ position: 'relative' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--primary-color)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>
                  {member.profiles?.avatar_base ? '👤' : (member.profiles?.alias?.charAt(0).toUpperCase() || '?')}
                </div>
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
              href={`https://meet.jit.si/StudyBuddy-${roomId.replace(/-/g, '')}`}
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
            const isReply = msg.content.startsWith('> [REPLY:');
            let displayContent = msg.content;
            let replyData = null;

            if (isReply) {
              const match = msg.content.match(/^> \[REPLY:(.*?)\]: ([\s\S]*?)\n\n/);
              if (match) {
                replyData = { name: match[1], content: match[2] };
                displayContent = msg.content.replace(/^> \[REPLY:.*?\]: .*?\n\n/, '');
              }
            }

            return (
              <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? (isHe ? 'flex-start' : 'flex-end') : (isHe ? 'flex-end' : 'flex-start'), maxWidth: '100%', position: 'relative' }} className="message-container">
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.2rem', margin: '0 0.5rem' }}>
                  {msg.sender_name} • {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <div style={{ 
                  background: isMe ? 'var(--primary-color)' : 'white', 
                  color: isMe ? 'white' : 'var(--text-main)',
                  padding: '0.8rem 1rem', 
                  borderRadius: 'var(--radius-md)', 
                  borderTopLeftRadius: isMe && isHe ? '16px' : (isMe ? 0 : '16px'),
                  borderTopRightRadius: isMe && isHe ? 0 : (isMe ? '16px' : 0),
                  boxShadow: 'var(--shadow-sm)',
                  maxWidth: '85%',
                  textAlign: isHe ? 'right' : 'left',
                  position: 'relative'
                }}>
                  {replyData && (
                    <div style={{ 
                      background: 'rgba(0,0,0,0.05)', 
                      borderLeft: isHe ? 'none' : '4px solid var(--primary-light)', 
                      borderRight: isHe ? '4px solid var(--primary-light)' : 'none',
                      padding: '0.5rem', 
                      borderRadius: '4px', 
                      marginBottom: '0.5rem', 
                      fontSize: '0.85rem' 
                    }}>
                      <div style={{ fontWeight: 'bold', fontSize: '0.75rem', marginBottom: '0.2rem', color: isMe ? 'white' : 'var(--primary-color)' }}>{replyData.name}</div>
                      <div style={{ opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{replyData.content.startsWith('__MEDIA_') ? (isHe ? '📎 קובץ/תמונה' : '📎 Media/File') : replyData.content}</div>
                    </div>
                  )}
                  
                  {displayContent.startsWith('__MEDIA_IMAGE__:') ? (
                    <div style={{ marginTop: '0.5rem', cursor: 'pointer' }} onClick={() => window.open(displayContent.split('__MEDIA_IMAGE__:')[1], '_blank')}>
                      <img 
                        src={displayContent.split('__MEDIA_IMAGE__:')[1]} 
                        alt="Uploaded" 
                        style={{ 
                          maxWidth: '250px', 
                          maxHeight: '300px', 
                          borderRadius: '12px', 
                          border: isMe ? '2px solid rgba(255,255,255,0.2)' : '2px solid rgba(138, 99, 210, 0.1)',
                          display: 'block'
                        }} 
                      />
                      <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.7rem', opacity: 0.7, textAlign: 'center' }}>
                         {isHe ? '(לחץ להגדלה 🔍)' : '(Click to enlarge 🔍)'}
                      </p>
                    </div>
                  ) : displayContent.startsWith('__MEDIA_FILE__:') ? (
                    (() => {
                      const [name, url] = displayContent.split('__MEDIA_FILE__:')[1].split('|');
                      return (
                        <a href={url} target="_blank" rel="noreferrer" style={{ color: isMe ? 'white' : 'var(--primary-color)', textDecoration: 'underline', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          📄 {name}
                        </a>
                      );
                    })()
                  ) : (
                    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{displayContent}</div>
                  )}
                  
                  {/* Reply Button (Visible on hover) */}
                  <button 
                    onClick={() => setReplyTo(msg)}
                    style={{ 
                      position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                      [isMe ? (isHe ? 'right' : 'left') : (isHe ? 'left' : 'right')]: '-40px',
                      background: 'white', border: '1px solid var(--primary-light)', borderRadius: '50%',
                      width: '30px', height: '30px', cursor: 'pointer', fontSize: '1rem',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-sm)'
                    }}
                    title={isHe ? 'השב' : 'Reply'}
                  >
                    ↩️
                  </button>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Chat Input */}
        <div style={{ padding: '2rem', borderTop: '1px solid rgba(138, 99, 210, 0.1)', background: 'var(--background-bg)' }}>
          {replyTo && (
            <div style={{ background: 'white', padding: '0.8rem 1rem', borderRadius: '12px 12px 0 0', border: '1px solid var(--primary-light)', borderBottom: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ borderLeft: isHe ? 'none' : '4px solid var(--primary-color)', borderRight: isHe ? '4px solid var(--primary-color)' : 'none', paddingLeft: '0.8rem', paddingRight: '0.8rem' }}>
                 <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--primary-color)' }}>{isHe ? 'משיב ל- ' : 'Replying to '}{replyTo.sender_name}</p>
                 <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '300px' }}>{replyTo.content}</p>
              </div>
              <button onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>
          )}
          <form onSubmit={sendMessage} style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <label style={{ cursor: isUploading ? 'not-allowed' : 'pointer', fontSize: '1.5rem', opacity: isUploading ? 0.5 : 1 }}>
              📎
              <input type="file" style={{ display: 'none' }} onChange={handleFileUpload} disabled={isUploading} />
            </label>
            <input 
              type="text" 
              className="input-field" 
              placeholder={isUploading ? (isHe ? "מעלה קובץ..." : "Uploading...") : (isHe ? "הקלידו הודעה לקבוצה..." : "Type a message to your group...")} 
              style={{ flex: 1, borderRadius: replyTo ? '0 0 12px 12px' : undefined }} 
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              disabled={isUploading}
            />
            <button type="submit" className="btn-primary" style={{ padding: '0 2rem' }} disabled={isUploading}>
              {isHe ? 'שלח' : 'Send'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
