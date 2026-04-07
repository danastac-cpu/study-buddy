"use client"
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { usePathname, useRouter } from 'next/navigation';

export default function InAppNotifications() {
  const [notification, setNotification] = useState<{ id: string, title: string, content: string, link: string } | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const setup = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      // Subscribe to ALL new messages
      const channel = supabase.channel('global-messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
          const newMsg = payload.new;
          
          // Ignore my own messages
          if (newMsg.sender_id === user.id) return;

          // Ignore if I am already on the chat page for this room
          // Room IDs are usually 'private_ID' or a UUID for groups
          if (pathname.includes(newMsg.room_id) || (newMsg.room_id.startsWith('private_') && pathname.includes(newMsg.room_id.replace('private_', '')))) {
            return;
          }

          // Check if I am a member of this room
          let isMyRoom = false;
          let link = '/dashboard';
          let title = 'הודעה חדשה';

          if (newMsg.room_id.startsWith('private_')) {
            const requestId = newMsg.room_id.replace('private_', '');
            const { data: req } = await supabase.from('help_requests').select('requester_id, helper_id').eq('id', requestId).single();
            if (req && (req.requester_id === user.id || req.helper_id === user.id)) {
              isMyRoom = true;
              link = `/chat/${requestId}`;
              title = 'הודעה חדשה בצ׳אט הפרטי';
            }
          } else {
            // Group chat
            const { data: enroll } = await supabase.from('group_enrollments').select('id').eq('group_id', newMsg.room_id).eq('user_id', user.id).eq('status', 'approved').single();
            if (enroll) {
              isMyRoom = true;
              link = `/groups/${newMsg.room_id}`;
              title = 'הודעה חדשה בקבוצת הלמידה';
            }
          }

          if (isMyRoom) {
            // Show toast
            setNotification({
              id: newMsg.id,
              title: title,
              content: `${newMsg.sender_name}: ${newMsg.content.startsWith('__MEDIA_') ? '📎 קובץ/תמונה' : newMsg.content.substring(0, 50)}${newMsg.content.length > 50 ? '...' : ''}`,
              link: link
            });

            // Auto-hide after 5 seconds
            setTimeout(() => setNotification(prev => prev?.id === newMsg.id ? null : prev), 5000);
          }
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    };

    setup();
  }, [pathname]);

  if (!notification) return null;

  return (
    <div 
      onClick={() => { router.push(notification.link); setNotification(null); }}
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: '320px',
        backgroundColor: 'white',
        border: '2px solid var(--primary-color)',
        borderRadius: '16px',
        padding: '1rem',
        boxShadow: '0 10px 25px rgba(138, 99, 210, 0.2)',
        zIndex: 9999,
        cursor: 'pointer',
        animation: 'slideUp 0.3s ease-out',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4rem'
      }}
    >
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ color: 'var(--primary-color)', fontSize: '0.9rem' }}>🔔 {notification.title}</strong>
        <button onClick={(e) => { e.stopPropagation(); setNotification(null); }} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#999' }}>✕</button>
      </div>
      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {notification.content}
      </p>
      <span style={{ fontSize: '0.7rem', color: 'var(--primary-light)', fontWeight: 'bold' }}>לחץ למעבר לצ׳אט ←</span>
    </div>
  );
}
