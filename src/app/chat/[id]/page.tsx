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
      const { data: req } = await supabase.from('help_requests').select('*, profiles(*)').eq('id', unwrappedId).single();
      if (req) {
        setRequestDetails(req);
        
        // Determine role
        const amIRequester = req.user_id === uid;
        setIsRequester(amIRequester || explicitRole === 'requester');

        // Fetch Partner Profile
        const partnerId = amIRequester ? (req.helper_id || searchParams.get('helper')) : req.user_id;
        if (partnerId) {
          const { data: pProf } = await supabase.from('profiles').select('*').eq('id', partnerId).single();
          if (pProf) {
            setPartnerProfile({
              id: partnerId,
              alias: pProf.alias || 'Helper',
              real_name: pProf.real_first_name + ' ' + (pProf.real_last_name || ''),
              degree: pProf.degree,
              year: pProf.year_of_study || pProf.year
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

    return () => { supabase.removeChannel(channel); };
  }, [unwrappedId, userId, isHe]);

  const processSystemMessages = (msgs: Message[], uid: string) => {
    let meApproved = false;
    let partnerApproved = false;
    let granted = false;

    msgs.forEach(m => {
      if (m.content === '__SYSTEM_REVEAL_APPROVED__') {
        if (m.sender_id === uid) meApproved = true;
        else partnerApproved = true;
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

  const sendMessage = async (e: React.FormEvent, contentOverride?: string) => {
    if (e) e.preventDefault();
    const content = contentOverride || newMessage;
    if (!content.trim() || !userId) return;

    if (!contentOverride) setNewMessage('');
    const roomId = `private_${unwrappedId}`;

    await supabase.from('messages').insert([{
      room_id: roomId,
      sender_id: userId,
      sender_name: contentOverride ? 'System' : userName,
      content: content
    }]);
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
    // Note: In real app, this should be a DB function/trigger for security.
    const { data: pData } = await supabase.from('profiles').select('helper_stars').eq('id', partnerProfile.id).single();
    if (pData) {
        await supabase.from('profiles').update({ helper_stars: (pData.helper_stars || 0) + 2 }).eq('id', partnerProfile.id);
    }

    alert(isHe ? 'הכוכבים הוענקו בהצלחה!' : 'Stars granted successfully!');
  };

  const handleApprove = async () => {
    await sendMessage(null as any, '__SYSTEM_REVEAL_APPROVED__');
  };

  if (!isReady) return null;

  const isFullyApproved = isMeApproved && isPartnerApproved;

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
            {isHe ? 'חשיפת פרטים הדדית' : 'Mutual Privacy'}
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ padding: '0.8rem', background: isMeApproved ? 'rgba(138, 99, 210, 0.05)' : 'rgba(0,0,0,0.02)', borderRadius: '12px', border: '1px solid var(--primary-light)' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--primary-color)', fontWeight: 'bold', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                    {isHe ? 'הסטטוס שלך' : 'Your Status'}
                </p>
                {isMeApproved ? (
                    <p style={{ margin: 0, fontWeight: '700', color: '#4CAF50' }}>{isHe ? '✔️ אישרת חשיפה' : '✔️ You Approved'}</p>
                ) : (
                    <button onClick={handleApprove} className="btn-primary" style={{ padding: '0.4rem', width: '100%', fontSize: '0.8rem' }}>
                        {isHe ? 'אשר/י חשיפת פרטים' : 'Approve Reveal'}
                    </button>
                )}
              </div>

              <div style={{ padding: '0.8rem', background: isPartnerApproved ? 'rgba(76, 175, 80, 0.05)' : 'rgba(0,0,0,0.02)', borderRadius: '12px', border: '1px solid rgba(76, 175, 80, 0.2)' }}>
                <p style={{ fontSize: '0.75rem', color: '#4CAF50', fontWeight: 'bold', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                    {isHe ? 'סטטוס צד שני' : 'Their Status'}
                </p>
                {isPartnerApproved ? (
                    <p style={{ margin: 0, fontWeight: '700', color: '#4CAF50' }}>{isHe ? '✔️ הצד השני אישר' : '✔️ They Approved'}</p>
                ) : (
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>{isHe ? 'ממתין לאישור...' : 'Waiting for approval...'}</p>
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
          <p style={{ margin: '0 0 0.4rem 0', fontSize: '0.8rem' }}><strong>{isHe ? 'נושא:' : 'Topic:'}</strong> {requestDetails?.course_name || '...'}</p>
          
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
          <h1 style={{ fontSize: '1.5rem', margin: 0, fontFamily: '"DynaPuff", "Fredoka", "Outfit", cursive' }}>
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
          <form onSubmit={(e) => sendMessage(e)} style={{ display: 'flex', gap: '1rem' }}>
            <input
              id="chat-input"
              type="text"
              className="input-field"
              placeholder={isHe ? "הקלידו הודעה..." : "Type a message..."}
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
