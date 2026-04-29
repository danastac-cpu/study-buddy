"use client"
import Link from 'next/link';
import { useState, useEffect, useRef, use, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
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
  const router = useRouter();
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

  const processSystemMessages = useCallback((msgs: Message[], uid: string) => {
    let meApproved = false;
    let partnerApproved = false;
    let granted = false;

    msgs.forEach(m => {
      if (m.content === '__SYSTEM_REVEAL_APPROVED__') {
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
  }, []);

  const loadAllData = useCallback(async () => {
    const roomId = `private_${unwrappedId}`;
    
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
    const { data: req } = await supabase.from('help_requests').select('*, profiles:profiles!requester_id(id, alias, avatar_base, avatar_bg, helper_stars, real_first_name, real_last_name, degree, year_of_study, year), helper_profile:profiles!helper_id(id, alias, avatar_base, avatar_bg, helper_stars, real_first_name, real_last_name, degree, year_of_study, year)').eq('id', unwrappedId).single();
    
    if (req) {
      setRequestDetails(req);
      const amIReq = req.requester_id === uid;
      setIsRequester(amIReq || explicitRole === 'requester');
      
      const partner = amIReq ? req.helper_profile : req.profiles;
      if (partner) {
          setPartnerProfile({
            id: partner.id,
            alias: partner.alias || 'Buddy',
            real_name: (partner.real_first_name || '') + ' ' + (partner.real_last_name || ''),
            degree: partner.degree,
            year: partner.year_of_study || partner.year,
            helper_stars: partner.helper_stars || 0
          });
      }
      
      // Override based on DB fields
      setIsMeApproved(amIReq ? (req.requester_revealed || false) : (req.helper_revealed || false));
      setIsPartnerApproved(amIReq ? (req.helper_revealed || false) : (req.requester_revealed || false));
    }

    // 4. Fetch Messages
    const { data: msgs } = await supabase.from('private_messages').select('*').eq('room_id', roomId).order('created_at', { ascending: true });
    if (msgs) {
      setMessages(msgs);
      processSystemMessages(msgs, uid);
    }
  }, [unwrappedId, explicitRole, processSystemMessages]);

  useEffect(() => {
    loadAllData();
    
    const roomId = `private_${unwrappedId}`;
    const channel = supabase.channel(`pchat_${unwrappedId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'private_messages', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => {
            const updated = [...prev, newMsg];
            processSystemMessages(updated, userId || '');
            return updated;
          });
        }
      ).subscribe();

    if (userId) {
       supabase.from('updates').delete().eq('user_id', userId).eq('type', 'new_message').eq('request_id', unwrappedId).then(() => {});
    }

    return () => { supabase.removeChannel(channel); };
  }, [unwrappedId, userId, loadAllData, processSystemMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

    await supabase.from('private_messages').insert([{
      room_id: roomId,
      sender_id: userId,
      sender_name: contentOverride ? 'System' : userName,
      content: finalContent
    }]);

    if (!contentOverride && partnerProfile?.id) {
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const roomId = `private_${unwrappedId}`;
    if (!file || !userId) return;

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      const filePath = `${roomId}/${fileName}`;

      const { error: uploadError } = await supabase.storage.from('chat-attachments').upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('chat-attachments').getPublicUrl(filePath);
      const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExt?.toLowerCase() || '');
      const content = isImage ? `__MEDIA_IMAGE__:${publicUrl}` : `__MEDIA_FILE__:${file.name}|${publicUrl}`;

      await supabase.from('private_messages').insert([{
        room_id: roomId,
        sender_id: userId,
        sender_name: userName,
        content: content
      }]);
    } catch (err: any) {
      alert('Upload failed: ' + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleGrantStars = async () => {
    if (starsGranted || !partnerProfile?.id) return;
    
    await sendMessage(null as any, '__SYSTEM_STARS_GRANTED__');

    await supabase.from('updates').insert([{
        user_id: partnerProfile.id,
        type: 'star-received',
        title_he: 'קיבלת כוכבים! 🌟',
        title_en: 'Stars Received! 🌟',
        content_he: `המשתמש ${userName} העניק לך 2 כוכבים על העזרה ב${requestDetails?.course_name || 'שיעור'}.`,
        content_en: `${userName} granted you 2 stars for your help in ${requestDetails?.course_name || 'the lesson'}.`
    }]);

    const { data: pData } = await supabase.from('profiles').select('helper_stars').eq('id', partnerProfile.id).single();
    if (pData) {
        await supabase.from('profiles').update({ helper_stars: (pData.helper_stars || 0) + 2 }).eq('id', partnerProfile.id);
    }

    alert(isHe ? 'הכוכבים הוענקו בהצלחה! נשלח עדכון לעוזר/ת.' : 'Stars granted successfully! A notification was sent to the helper.');
    setStarsGranted(true);
    loadAllData();
  };

  const handleApprove = async () => {
    await sendMessage(null as any, '__SYSTEM_REVEAL_APPROVED__');
    if (partnerProfile?.id) {
       await supabase.from('updates').insert([{
         user_id: partnerProfile.id,
         type: 'new-member',
         request_id: unwrappedId,
         title_he: 'הפרטים נחשפו! 🔓',
         title_en: 'Details Revealed! 🔓',
         content_he: `${userName} אישר/ה חשיפת פרטים. עכשיו תוכלו לראות אחד את השני.`,
         content_en: `${userName} approved details reveal. You can now see each other.`
       }]);
    }
    // Also update the help_request table to persist the reveal
    const myColumn = isRequester ? 'requester_revealed' : 'helper_revealed';
    await supabase.from('help_requests').update({ [myColumn]: true }).eq('id', unwrappedId);
    loadAllData();
  };

  if (!isReady) return null;

  const isFullyApproved = isMeApproved || isPartnerApproved;

  const handleDownloadChat = () => {
    const text = messages.map(m => {
       if (m.content.startsWith('__SYSTEM_')) return null;
       const sender = m.user_id === userId ? (isHe ? 'אני' : 'Me') : (m.profiles?.real_first_name || m.profiles?.alias || (isHe ? 'שותף/ה' : 'Partner'));
       const time = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
       return `[${time}] ${sender}: ${m.content}`;
    }).filter(Boolean).join('\n\n');

    const header = isHe 
      ? `=== סיכום צ'אט לימודים ===\nנושא: ${requestDetails?.course_name || 'כללי'}\nתאריך: ${new Date().toLocaleDateString()}\n\n`
      : `=== Study Chat Summary ===\nTopic: ${requestDetails?.course_name || 'General'}\nDate: ${new Date().toLocaleDateString()}\n\n`;

    const blob = new Blob([header + text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `StudyBuddy_Chat_${requestDetails?.course_name || 'Summary'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
                {isRequester ? (
                  <>
                    {isMeApproved ? (
                        <p style={{ margin: 0, fontWeight: '700', color: '#4CAF50' }}>{isHe ? '✔️ אישרת חשיפה' : '✔️ You revealed info'}</p>
                    ) : (
                        <button onClick={handleApprove} className="btn-primary" style={{ padding: '0.6rem', width: '100%', fontSize: '0.85rem' }}>
                            {isHe ? 'אשר/י חשיפת פרטים' : 'Approve Reveal'}
                        </button>
                    )}
                    {isPartnerApproved && !isMeApproved && (
                        <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.75rem', color: '#4CAF50' }}>
                            {isHe ? 'העוזר מוכן לסייע! אשרו חשיפת פרטים כדי לראות.' : 'Helper is ready! Approve reveal to see.'}
                        </p>
                    )}
                  </>
                ) : (
                  <>
                    <p style={{ margin: 0, fontWeight: '600', color: 'var(--text-main)', fontSize: '0.85rem', lineHeight: '1.4' }}>
                      {isPartnerApproved 
                        ? (isHe ? '✔️ הצד השני אישר חשיפה!' : '✔️ The other side approved reveal!') 
                        : (isHe ? '⌛ ממתינים שהצד השני יאשר חשיפה. בינתיים אפשר לשלוח הודעות בצ׳אט כדי להתחיל!' : '⌛ Waiting for the other side to approve. You can send messages meanwhile to start chatting!')}
                    </p>
                  </>
                )}
              </div>
          </div>

          {isFullyApproved && (
              <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'white', borderRadius: '12px', border: '2px solid var(--primary-color)' }}>
                  <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${partnerProfile?.id}`} style={{ width: '40px', height: '40px', borderRadius: '50%', marginBottom: '0.5rem' }} />
                  <p style={{ margin: '0 0 0.5rem 0', fontWeight: '800', color: 'var(--primary-color)' }}>{isHe ? 'פרטי השותף/ה:' : 'Partner Details:'}</p>
                  <p style={{ margin: 0, fontWeight: '700' }}>{partnerProfile?.real_name || partnerProfile?.alias}</p>
                  <p style={{ margin: 0, fontSize: '0.85rem' }}>{partnerProfile?.degree} • {partnerProfile?.year}</p>
              </div>
          )}
        </div>

        {/* Lesson Details Block */}
        <div style={{ background: 'white', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.05)', boxShadow: 'var(--shadow-sm)' }}>
          <h3 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--primary-dark)' }}>ℹ️ {isHe ? 'פרטי השיעור' : 'Lesson Details'}</h3>
          <p style={{ margin: '0 0 0.4rem 0', fontSize: '0.8rem' }}><strong>{isHe ? 'נושא:' : 'Topic:'}</strong> {requestDetails?.course_name || '...'}</p>
          
          {isRequester && !starsGranted && (
            <div style={{ marginTop: '1.2rem', paddingTop: '1.2rem', borderTop: '2px dashed var(--primary-light)' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.8rem', textAlign: 'center' }}>
                {isHe ? 'מרוצה מהעזרה? פרגנ/י בכוכבים!' : 'Happy with the help? Grant some stars!'}
              </p>
              <button 
                onClick={handleGrantStars}
                className="btn-primary"
                style={{ 
                   width: '100%', 
                   padding: '0.8rem', 
                   fontSize: '0.95rem', 
                   background: '#FFF0B3', 
                   color: '#7A5C00', 
                   fontWeight: '900',
                   boxShadow: '0 4px 15px rgba(255, 240, 179, 0.5)',
                   border: 'none',
                   borderRadius: '16px'
                }}
              >
                🌟 {isHe ? 'הענק כוכבים לעוזר/ת' : 'Grant Stars to Helper'}
              </button>
            </div>
          )}
          {starsGranted && (
             <div style={{ marginTop: '1rem', padding: '0.5rem', background: 'rgba(255, 215, 0, 0.1)', borderRadius: '8px', textAlign: 'center' }}>
                <p style={{ margin: 0, color: '#D4AF37', fontWeight: 'bold', fontSize: '0.85rem' }}>✨ {isHe ? 'הוענקו 2 כוכבים' : '2 Stars Granted'}</p>
             </div>
          )}

          {isRequester && (
            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              <button 
                onClick={async () => {
                  if (confirm(isHe ? 'האם את/ה בטוח/ה שסיימתם? פעולה זו תסגור את הבקשה והיא לא תופיע יותר.' : 'Are you sure you are done? This will resolve and hide the request.')) {
                    await supabase.from('help_requests').update({ status: 'resolved' }).eq('id', unwrappedId);
                    router.push('/dashboard');
                  }
                }}
                className="btn-secondary"
                style={{ padding: '0.6rem', width: '100%', fontSize: '0.85rem', color: '#E53935', borderColor: 'rgba(229,57,53,0.3)', background: 'rgba(229,57,53,0.05)', borderRadius: '12px', fontWeight: 'bold' }}
              >
                🏁 {isHe ? 'סיימנו! סגור בקשה' : 'Done! Close Request'}
              </button>
            </div>
          )}
        </div>
      </nav>

      <main className="main-content" style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 0 }}>
        <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid rgba(138, 99, 210, 0.1)', background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontSize: '2.2rem', margin: 0, fontFamily: '"DynaPuff", "Fredoka", "Outfit", cursive', color: 'var(--primary-color)' }}>
            {isHe ? 'צ׳אט אישי (1-על-1)' : 'Private Chat (1-on-1)'}
          </h1>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handleDownloadChat}
              className="btn-secondary"
              style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', fontSize: '0.9rem', cursor: 'pointer' }}
              title={isHe ? "הורד סיכום צ'אט" : "Download Chat Summary"}
            >
              📥 {isHe ? 'הורד סיכום' : 'Download'}
            </button>
            <a
              href={`https://meet.jit.si/StudyBuddy-Private-${unwrappedId.replace(/-/g, '')}`}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary"
              style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', fontSize: '0.9rem' }}
            >
              📹 {isHe ? 'וידאו' : 'Video'}
            </a>
          </div>
        </div>

        <div style={{ flex: 1, padding: '2rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {messages.map((msg, idx) => {
            if (msg.content.startsWith('__SYSTEM_')) return null;
            const isMe = msg.sender_id === userId;
            return (
              <div key={idx} style={{ alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '70%' }}>
                <div style={{ background: isMe ? 'var(--primary-color)' : 'white', color: isMe ? 'white' : 'black', padding: '0.8rem 1.2rem', borderRadius: '18px', boxShadow: 'var(--shadow-sm)' }}>
                  {msg.content.startsWith('__MEDIA_IMAGE__:') ? <img src={msg.content.split(':')[1]} style={{ maxWidth: '100%', borderRadius: '10px' }} /> : msg.content}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        <div style={{ padding: '2rem', background: 'white', borderTop: '1px solid #eee' }}>
          <form onSubmit={(e) => sendMessage(e)} style={{ display: 'flex', gap: '1rem' }}>
            <label style={{ fontSize: '1.5rem', cursor: 'pointer' }}>📎<input type="file" style={{ display: 'none' }} onChange={handleFileUpload}/></label>
            <input className="input-field" style={{ flex: 1 }} value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder={isHe ? 'הודעה...' : 'Message...'} />
            <button type="submit" className="btn-primary">{isHe ? 'שלח' : 'Send'}</button>
          </form>
        </div>
      </main>
    </div>
  );
}
