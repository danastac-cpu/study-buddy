"use client"
import Link from 'next/link';
import { useState, useEffect, useRef, use } from 'react';
import { useSearchParams } from 'next/navigation';
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

export default function PrivateChatPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params);
  const unwrappedId = unwrappedParams.id;
  const searchParams = useSearchParams();
  const explicitRole = searchParams.get('role');

  const { language, isReady } = useLanguage();
  const t = translations[language];
  const isHe = language === 'he';

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('Guest');

  // Privacy & Role Logic
  const [isMeApproved, setIsMeApproved] = useState(false);
  const [isPartnerApproved, setIsPartnerApproved] = useState(false);
  const [partnerProfile, setPartnerProfile] = useState<any>(null);
  const [isRequester, setIsRequester] = useState(false); 

  const [profile, setProfile] = useState<any>(null);
  const [starsGranted, setStarsGranted] = useState(false);
  const [requestDetails, setRequestDetails] = useState<any>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const roomId = `private_${unwrappedId}`;
    
    const fetchInitialData = async () => {
      // 1. Get Current User
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) return;
      const uid = auth.user.id;
      setUserId(uid);

      // 2. Fetch My Profile
      const { data: myProf } = await supabase.from('profiles').select('*').eq('id', uid).single();
      if (myProf) {
        setProfile(myProf);
        setUserName(myProf.alias || 'Guest');
      }

      // 3. Fetch Help Request context
      const { data: req } = await supabase.from('help_requests').select('*, profiles:profiles!requester_id(*)').eq('id', unwrappedId).single();
      if (req) {
        setRequestDetails(req);
        
        // Determine role
        const amIRequester = req.requester_id === uid;
        setIsRequester(amIRequester || explicitRole === 'requester');

        // Fetch Partner Profile
        const partnerId = amIRequester ? (req.helper_id || searchParams.get('helper')) : req.requester_id;
        if (partnerId) {
          const { data: pProf } = await supabase.from('profiles').select('*').eq('id', partnerId).single();
          if (pProf) {
              setPartnerProfile({
                id: partnerId,
                alias: pProf.alias || 'Helper',
                real_name: pProf.real_first_name + ' ' + (pProf.real_last_name || ''),
                degree: pProf.degree === 'Tzameret' ? (isHe ? 'צמרת' : 'Tzameret') : pProf.degree,
                year: (pProf.year === 'year4' ? (isHe ? 'ד\'' : '4') : (pProf.year_of_study || pProf.year)),
                helper_stars: pProf.helper_stars || 0
              });
          }
        }
      }

      // 4. Fetch Messages
      const { data: msgs } = await supabase.from('messages').select('*').eq('room_id', roomId).order('created_at', { ascending: true });
      if (msgs) {
        setMessages(msgs);
        processSystemMessages(msgs, uid);
      }
    };

    fetchInitialData();

    // 5. Realtime
    const channel = supabase.channel(`pchat_${unwrappedId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => {
            const updated = [...prev, newMsg];
            processSystemMessages(updated, userId || '');
            return updated;
          });
        }
      ).subscribe();

    // Presence logic removed for privacy
    
    // Clear notifications for this room when entering
    if (userId) {
      supabase.from('updates').delete().eq('user_id', userId).eq('type', 'new_message').eq('request_id', unwrappedId).then(() => {});
    }
  }, [unwrappedId, userId, isHe]);

  const processSystemMessages = (msgs: Message[], uid: string) => {
    let meApproved = false;
    let partnerApproved = false;
    let granted = false;

    msgs.forEach(m => {
      if (m.content === '__SYSTEM_REVEAL_APPROVED__') {
        // Any reveal message means the requester (or someone) approved
        meApproved = true; 
        partnerApproved = true;
      }
      if (m.content === '__SYSTEM_STARS_GRANTED__') {
        granted = true;
      }
    });

    setIsMeApproved(meApproved);
    setIsPartnerApproved(partnerApproved);
    setStarsGranted(granted);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const roomId = `private_${unwrappedId}`;
    if (!file || !userId) return;

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const safeName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
      const fileName = `${Date.now()}_${safeName}`;
      const filePath = `${roomId}/${fileName}`;

      console.log('Uploading to chat-attachments bucket:', filePath);
      const { data, error } = await supabase.storage
        .from('chat-attachments')
        .upload(filePath, file);

      if (error) {
        console.error('STORAGE ERROR (chat-attachments):', error);
        throw error;
      }

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

    } catch (err: any) {
      console.error('Upload error:', err);
      alert('Failed to upload file: ' + (err.message || 'Unknown error'));
    } finally {
      setIsUploading(false);
    }
  };

  const sendMessage = async (e: React.FormEvent, contentOverride?: string) => {
    if (e) e.preventDefault();
    const contentText = contentOverride || newMessage;
    if (!contentText.trim() || !userId) return;

    let finalContent = contentText;
    if (replyTo && !contentOverride) {
      finalContent = `> [REPLY:${replyTo.sender_name}]: ${replyTo.content}\n\n${contentText}`;
    }

    if (!contentOverride) setNewMessage('');
    setReplyTo(null);
    const roomId = `private_${unwrappedId}`;

    await supabase.from('messages').insert([{
      room_id: roomId,
      sender_id: userId,
      sender_name: contentOverride ? 'System' : userName,
      content: finalContent
    }]);

    // Insert "New Message" update for the partner (if not system message)
    if (!contentOverride && partnerProfile?.id) {
        // First delete any previous new_message updates for this request to keep it clean
        await supabase.from('updates').delete().eq('user_id', partnerProfile.id).eq('type', 'new_message').eq('request_id', unwrappedId);
        
        await supabase.from('updates').insert([{
            user_id: partnerProfile.id,
            type: 'new_message',
            request_id: unwrappedId,
            title_he: 'הודעה חדשה בצ׳אט 💬',
            title_en: 'New message in chat 💬',
            content_he: `קיבלת הודעה חדשה מ-${userName}`,
            content_en: `You received a new message from ${userName}`
        }]);
    }
  };

  const handleGrantStars = async () => {
    if (starsGranted || !partnerProfile?.id) return;
    
    // 1. Send system message
    await sendMessage(null as any, '__SYSTEM_STARS_GRANTED__');

    // 2. Insert update for the helper
    await supabase.from('updates').insert([{
        user_id: partnerProfile.id,
        type: 'star-received',
        title_he: 'קיבלת כוכבים! 🌟',
        title_en: 'Stars Received! 🌟',
        content_he: `המשתמש ${userName} העניק לך 2 כוכבים על העזרה ב${requestDetails?.course_name || 'שיעור'}.`,
        content_en: `${userName} granted you 2 stars for your help in ${requestDetails?.course_name || 'the lesson'}.`
    }]);

    // 3. Increment stars in helper's profile
    const { data: pData, error: fetchErr } = await supabase.from('profiles').select('helper_stars').eq('id', partnerProfile.id).single();
    if (fetchErr) {
        console.error('STARS FETCH ERROR:', fetchErr);
    }
    if (pData) {
        const { error: upErr } = await supabase.from('profiles').update({ helper_stars: (pData.helper_stars || 0) + 2 }).eq('id', partnerProfile.id);
        if (upErr) {
            console.error('STARS UPDATE ERROR:', upErr);
            // If RLS fails, we at least have the system message and update board entry
        }
    }

    alert(isHe ? 'הכוכבים הוענקו בהצלחה! הסיסטם ישלח עדכון לעוזר/ת.' : 'Stars granted successfully! A notification was sent to the helper.');
    setStarsGranted(true);
  };

  const handleApprove = async () => {
    // 1. Send system message
    await sendMessage(null as any, '__SYSTEM_REVEAL_APPROVED__');
    
    // 2. Create notification for the partner
    if (partnerProfile?.id) {
       await supabase.from('updates').insert([{
         user_id: partnerProfile.id,
         type: 'new-member', // or a specific reveal type
         request_id: unwrappedId,
         title_he: 'הפרטים נחשפו! 🔓',
         title_en: 'Details Revealed! 🔓',
         content_he: `${userName} אישר/ה חשיפת פרטים. עכשיו תוכלו לראות אחד את השני.`,
         content_en: `${userName} approved details reveal. You can now see each other.`
       }]);
    }
  };

  if (!isReady) return null;

  const isFullyApproved = isMeApproved || isPartnerApproved;

  return (
    <div className="app-wrapper" style={{ direction: isHe ? 'rtl' : 'ltr' }}>
      <nav className="sidebar">
        <Link href="/dashboard" className="btn-secondary" style={{ marginBottom: '2rem', padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
          {isHe ? '← חזרה' : '← Back'}
        </Link>
        <h2 style={{ fontSize: '2rem', marginBottom: '1.5rem', fontFamily: '"DynaPuff", "Fredoka", "Outfit", cursive', color: 'var(--primary-color)' }}>
          {isHe ? 'צ׳אט פרטי' : 'Private Chat'}
        </h2>

        {/* Privacy Panel */}
        <div className="glass-panel" style={{ padding: '1.2rem', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.3rem' }}>{isFullyApproved ? '🔓' : '🔒'}</span> 
            {isHe ? 'חשיפת פרטים' : 'Profile Reveal'}
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ padding: '0.8rem', background: isMeApproved ? 'rgba(76, 175, 80, 0.05)' : 'rgba(0,0,0,0.02)', borderRadius: '12px', border: '1px solid var(--primary-light)' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--primary-color)', fontWeight: 'bold', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                    {isHe ? 'סטטוס חשיפת פרטים' : 'Reveal Status'}
                </p>
                {isFullyApproved ? (
                    <p style={{ margin: 0, fontWeight: '700', color: '#4CAF50' }}>{isHe ? '✔️ הפרטים נחשפו' : '✔️ Details Revealed'}</p>
                ) : (
                    isRequester ? (
                      <button onClick={handleApprove} className="btn-primary" style={{ padding: '0.6rem', width: '100%', fontSize: '0.85rem' }}>
                          {isHe ? 'אשר/י חשיפת פרטים' : 'Approve Reveal'}
                      </button>
                    ) : (
                      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {isHe ? 'ממתין לאישור המבקש/ת...' : 'Waiting for requester approval...'}
                      </p>
                    )
                )}
              </div>
          </div>

          {isFullyApproved && (
              <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'white', borderRadius: '12px', border: '2px solid var(--primary-color)' }}>
                  <p style={{ margin: '0 0 0.5rem 0', fontWeight: '800', color: 'var(--primary-color)' }}>{isHe ? 'פרטי השותף/ה:' : 'Partner Details:'}</p>
                  <p style={{ margin: 0, fontWeight: '700' }}>{partnerProfile?.real_name}</p>
                  <p style={{ margin: 0, fontSize: '0.85rem' }}>{partnerProfile?.degree} • {partnerProfile?.year}</p>
              </div>
          )}
        </div>

        {/* Lesson Details Block */}
        <div style={{ background: 'white', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.05)', boxShadow: 'var(--shadow-sm)' }}>
          <h3 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--primary-dark)' }}>ℹ️ {isHe ? 'פרטי השיעור' : 'Lesson Details'}</h3>
          <p style={{ margin: '0 0 0.4rem 0', fontSize: '0.8rem' }}><strong>{isHe ? 'נושא:' : 'Topic:'}</strong> {requestDetails?.course || requestDetails?.course_name || '...'}</p>
          
          {isRequester && (
            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px dashed var(--primary-light)' }}>
              <button 
                onClick={handleGrantStars}
                className={starsGranted ? "btn-secondary" : "btn-primary"}
                disabled={starsGranted}
                style={{ 
                  width: '100%', padding: '0.6rem', fontSize: '0.85rem', 
                  background: starsGranted ? 'rgba(76, 175, 80, 0.08)' : undefined, 
                  color: starsGranted ? '#4CAF50' : undefined,
                  border: starsGranted ? '1px solid #4CAF50' : undefined,
                  cursor: starsGranted ? 'default' : 'pointer'
                }}
              >
                {starsGranted ? (isHe ? '✔️ הכוכבים הוענקו' : '✔️ Stars Granted') : (isHe ? '🌟 להעניק את הכוכבים' : '🌟 Grant Stars')}
              </button>
            </div>
          )}
        </div>
      </nav>

      <main className="main-content" style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 0 }}>
        {/* Header Options */}
        <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid rgba(138, 99, 210, 0.1)', background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontSize: '2.5rem', margin: 0, fontFamily: '"DynaPuff", "Fredoka", "Outfit", cursive', color: 'var(--primary-color)' }}>
            {isHe ? 'צ׳אט אישי (1-על-1)' : 'Private Chat (1-on-1)'}
          </h1>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <a
              href={`https://meet.jit.si/StudyBuddy-Private-${unwrappedId}`}
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
          {messages.filter(m => !m.content.startsWith('__SYSTEM_')).length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '2rem' }}>
              {isHe ? 'אין הודעות. התחילו לדבר!' : 'No messages. Start typing!'}
            </div>
          )}
          {messages.map((msg, idx) => {
            if (msg.content.startsWith('__SYSTEM_')) return null;
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
              <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? (isHe ? 'flex-start' : 'flex-end') : (isHe ? 'flex-end' : 'flex-start'), maxWidth: '100%', position: 'relative' }}>
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
                        referrerPolicy="no-referrer"
                        crossOrigin="anonymous"
                        onError={(e) => {
                          console.error("Image load failed:", e.currentTarget.src);
                          e.currentTarget.style.display = 'none';
                        }}
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
                  
                  {/* Reply Button */}
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
          <form onSubmit={(e) => sendMessage(e)} style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <label style={{ cursor: isUploading ? 'not-allowed' : 'pointer', fontSize: '1.5rem', opacity: isUploading ? 0.5 : 1 }}>
              📎
              <input type="file" style={{ display: 'none' }} onChange={handleFileUpload} disabled={isUploading} />
            </label>
            <input
              id="chat-input"
              type="text"
              className="input-field"
              placeholder={isUploading ? (isHe ? "מעלה קובץ..." : "Uploading...") : (isHe ? "הקלידו הודעה..." : "Type a message...")}
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
