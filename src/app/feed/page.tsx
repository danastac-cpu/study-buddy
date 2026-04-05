"use client"
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { translations, Language } from '@/lib/i18n';
import { useLanguage } from '@/hooks/useLanguage';
import { ScienceAvatar, ACCESSORIES } from '@/components/ScienceAvatar';
import { emailService } from '@/lib/emailService';

interface FeedComment {
  id: string;
  author: string;
  degree: string;
  avatarBase: string;
  text: string;
  user_id: string;
}

interface FeedPost {
  id: string;
  author: string;
  details: string;
  text: string;
  time: string;
  fileUrl?: string;
  comments: FeedComment[];
  avatarBase: string;
  avatarAccessory: string | null;
  avatarColor: string;
  user_id: string;
}

export default function FeedPage() {
  const router = useRouter();
  const { language, setLanguage, isReady } = useLanguage();
  const t = translations[language];
  const isHe = language === 'he';

  const [filterYear, setFilterYear] = useState('All');
  const [showDetails, setShowDetails] = useState(true);
  const [showReplyDetails, setShowReplyDetails] = useState(true);

  const [newPostText, setNewPostText] = useState('');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [isPosting, setIsPosting] = useState(false);

  // DB State
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (authData?.user) {
          const { data: prof } = await supabase.from('profiles').select('*').eq('id', authData.user.id).single();
          setCurrentUser({ ...authData.user, profile: prof });
      }

      const { data: postsData, error: postsError } = await supabase
        .from('feed_posts')
        .select('*, profiles(alias, avatar_base, avatar_accessory, avatar_bg, degree, year)')
        .order('created_at', { ascending: false });

      if (!postsError && postsData) {
        const formattedPosts = await Promise.all(postsData.map(async (p) => {
          const { data: commentsData } = await supabase
            .from('feed_comments')
            .select('*, profiles(alias, avatar_base, degree, year)')
            .eq('post_id', p.id)
            .order('created_at', { ascending: true });

          return {
            id: p.id,
            author: p.profiles?.alias || 'Guest',
            details: p.show_details ? `${p.profiles?.degree || ''} • ${isHe ? 'שנה' : 'Year'} ${p.profiles?.year || ''}` : '',
            text: p.text,
            time: new Date(p.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            fileUrl: p.file_url,
            avatarBase: p.profiles?.avatar_base || 'brain',
            avatarAccessory: p.profiles?.avatar_accessory === '(None)' ? null : p.profiles?.avatar_accessory,
            avatarColor: p.profiles?.avatar_bg || 'var(--primary-color)',
            user_id: p.user_id,
            comments: (commentsData || []).map(c => ({
              id: c.id,
              author: c.profiles?.alias || 'Guest',
              degree: c.show_details ? `${c.profiles?.degree || ''} • ${isHe ? 'שנה' : 'Year'} ${c.profiles?.year || ''}` : '',
              avatarBase: c.profiles?.avatar_base || 'brain',
              text: c.text,
              user_id: c.user_id
            }))
          };
        }));
        setPosts(formattedPosts);
      }
    };
    fetchData();
  }, [isHe]);

  // Editing state
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editPostText, setEditPostText] = useState('');
  const [editFile, setEditFile] = useState<File | null>(null);

  // Comment Editing state
  const [editingComment, setEditingComment] = useState<{postId: string, commentId: string} | null>(null);
  const [editCommentText, setEditCommentText] = useState('');
  
  const [replyText, setReplyText] = useState<{ [postId: string]: string }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isReady) return null;

  const handleDeletePost = async (postId: string) => {
    if (confirm(isHe ? 'האם את/ה בטוח/ה שברצונך למחוק פוסט זה?' : 'Are you sure you want to delete this post?')) {
      const { error } = await supabase.from('feed_posts').delete().eq('id', postId);
      if (!error) setPosts(prev => prev.filter(p => p.id !== postId));
    }
  };

  const handleReplySubmit = async (postId: string) => {
    const text = replyText[postId];
    if (!text?.trim() || !currentUser) return;

    const { data: comment, error } = await supabase
      .from('feed_comments')
      .insert([{
        post_id: postId,
        user_id: currentUser.id,
        text: text,
        show_details: showReplyDetails
      }])
      .select('*, profiles(alias, avatar_base, degree, year)')
      .single();

    if (!error && comment) {
      const newComment: FeedComment = {
        id: comment.id,
        author: comment.profiles?.alias || 'Guest',
        degree: comment.show_details ? `${comment.profiles?.degree || ''} • ${isHe ? 'שנה' : 'Year'} ${comment.profiles?.year || ''}` : '',
        avatarBase: comment.profiles?.avatar_base || 'brain',
        text: comment.text,
        user_id: comment.user_id
      };

      // 3. Optional: Send email to the original post author
      const post = posts.find(p => p.id === postId);
      if (post && post.user_id !== currentUser.id) {
        // Fetch post author email
        const getAuthorEmail = async () => {
          const { data: authorProf } = await supabase.from('profiles').select('email, real_first_name, alias').eq('id', post.user_id).single();
          if (authorProf?.email) {
            emailService.sendNotificationEmail(
              authorProf.email,
              authorProf.real_first_name || authorProf.alias || 'Buddy',
              `מישהו הגיב לפוסט שלך בפיד הקהילתי! ✨ תגובה: "${text.substring(0, 30)}..."`,
              `Someone replied to your post in the Community Feed! ✨ Comment: "${text.substring(0, 30)}..."`
            );
          }
        };
        getAuthorEmail();
      }

      setPosts(prev => prev.map(p => {
        if (p.id === postId) {
          return { ...p, comments: [...p.comments, newComment] };
        }
        return p;
      }));
      setReplyText(prev => ({ ...prev, [postId]: '' }));
    }
  };

  const handlePostSubmit = async () => {
    if (!newPostText.trim() && !attachedFile) return;
    setIsPosting(true);

    let fileUrl = '';
    if (attachedFile) {
      const fileName = `${Date.now()}-${attachedFile.name}`;
      const { data, error } = await supabase.storage.from('files').upload(fileName, attachedFile);
      if (error) {
        alert('Error: ' + error.message);
      } else if (data) {
        const { data: publicData } = supabase.storage.from('files').getPublicUrl(fileName);
        fileUrl = publicData.publicUrl;
      }
    }

    if (!currentUser) return;

    const { data: post, error: dbError } = await supabase
      .from('feed_posts')
      .insert([{
        user_id: currentUser.id,
        text: newPostText,
        file_url: fileUrl,
        show_details: showDetails,
        degree: currentUser.profile?.degree || 'Student',
        year: currentUser.profile?.year || '1'
      }])
      .select('*, profiles(alias, avatar_base, avatar_accessory, avatar_bg, degree, year)')
      .single();

    if (!dbError && post) {
      const newPost: FeedPost = {
        id: post.id,
        author: post.profiles?.alias || 'Guest',
        details: post.show_details ? `${post.profiles?.degree || ''} • ${isHe ? 'שנה' : 'Year'} ${post.profiles?.year || ''}` : '',
        text: post.text,
        time: isHe ? 'ממש עכשיו' : 'Just now',
        fileUrl: post.file_url,
        avatarBase: post.profiles?.avatar_base || 'brain',
        avatarAccessory: post.profiles?.avatar_accessory === '(None)' ? null : post.profiles?.avatar_accessory,
        avatarColor: post.profiles?.avatar_bg || 'var(--primary-color)',
        user_id: post.user_id,
        comments: []
      };
      setPosts(prev => [newPost, ...prev]);
    }

    setNewPostText('');
    setAttachedFile(null);
    setIsPosting(false);
  };

  const handleStartEdit = (post: FeedPost) => {
    setEditingPostId(post.id);
    setEditPostText(post.text);
    setEditFile(null);
  };

  const handleSaveEdit = async (postId: string) => {
    let fileUrl = '';
    if (editFile) {
        const fileName = `${Date.now()}-${editFile.name}`;
        const { data, error } = await supabase.storage.from('files').upload(fileName, editFile);
        if (!error && data) {
            const { data: publicData } = supabase.storage.from('files').getPublicUrl(fileName);
            fileUrl = publicData.publicUrl;
        }
    }

    const { error: dbError } = await supabase
      .from('feed_posts')
      .update({ 
        text: editPostText, 
        file_url: fileUrl || undefined
      })
      .eq('id', postId);

    if (!dbError) {
        setPosts(prev => prev.map(p => {
          if (p.id === postId) {
            return { 
                ...p, 
                text: editPostText, 
                fileUrl: fileUrl || p.fileUrl,
                time: isHe ? 'עודכן זה עתה' : 'Updated just now'
            };
          }
          return p;
        }));
        setEditingPostId(null);
    }
  };

  const handleStartEditComment = (postId: string, commentId: string, currentText: string) => {
    setEditingComment({ postId, commentId });
    setEditCommentText(currentText);
  };

  const handleSaveEditComment = async (postId: string, commentId: string) => {
    const { error } = await supabase
      .from('feed_comments')
      .update({ text: editCommentText })
      .eq('id', commentId);

    if (!error) {
        setPosts(prev => prev.map(p => {
            if (p.id === postId) {
                const newComments = p.comments.map(c => c.id === commentId ? { ...c, text: editCommentText } : c);
                return { ...p, comments: newComments };
            }
            return p;
        }));
        setEditingComment(null);
    }
  };

  const handleDeleteComment = async (postId: string, commentId: string) => {
    if (!confirm(isHe ? 'בטוח/ה שברצונך למחוק תגובה זו?' : 'Are you sure you want to delete this comment?')) return;
    const { error } = await supabase.from('feed_comments').delete().eq('id', commentId);
    if (!error) {
        setPosts(prev => prev.map(p => {
            if (p.id === postId) {
                const newComments = p.comments.filter(c => c.id !== commentId);
                return { ...p, comments: newComments };
            }
            return p;
        }));
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

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <Link href="/dashboard" className="btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
          {isHe ? '← חזרה לחשבון' : '← Back to Account'}
        </Link>
        <h1 style={{ fontSize: '2.5rem', margin: 0, fontFamily: '"DynaPuff", "Fredoka", "Outfit", cursive', color: 'var(--primary-color)' }}>
          {isHe ? 'פיד הקהילה' : 'Community Feed'}
        </h1>
      </div>

      {/* Anonymity Banner */}
      <div style={{ background: 'rgba(138, 99, 210, 0.08)', border: '1px solid var(--primary-light)', padding: '1rem 1.5rem', borderRadius: '12px', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <span style={{ fontSize: '1.5rem' }}>🔒</span>
        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--primary-dark)', fontWeight: '500' }}>
            {isHe 
              ? 'הפיד הקהילתי הוא מרחב בטוח ואנונימי. רק אם תבחרו בכך, תוכלו לחשוף את התואר ושנת הלימוד שלכם.' 
              : 'The Community Feed is a safe, anonymous space. Only if you choose to, you can reveal your degree and year.'}
        </p>
      </div>

      <div className="glass-card" style={{ marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>
          {isHe ? 'שאלו שאלה באנונימיות' : 'Ask an Anonymous Question'}
        </h3>
        <textarea 
          className="input-field" 
          rows={3} 
          value={newPostText}
          onChange={(e) => setNewPostText(e.target.value)}
          placeholder={isHe ? "במה אתם מתקשים? ניתן לצרף טקסט או קישורים לתמונות באנונימיות..." : "What are you struggling with? You can post text or image links anonymously..."}
        ></textarea>
        {attachedFile && (
          <div style={{ fontSize: '0.8rem', color: 'var(--primary-color)', margin: '0.5rem 0' }}>
            📎 {attachedFile.name} ({(attachedFile.size / 1024).toFixed(1)} KB)
            <span style={{ cursor: 'pointer', marginLeft: '1rem', color: 'var(--text-muted)' }} onClick={() => setAttachedFile(null)}>✖</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input type="file" style={{ display: 'none' }} ref={fileInputRef} onChange={(e) => setAttachedFile(e.target.files?.[0] || null)} />
            <button onClick={() => fileInputRef.current?.click()} className="btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}>📷 {isHe ? 'תמונה' : 'Image'}</button>
            <button onClick={() => fileInputRef.current?.click()} className="btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}>📎 {isHe ? 'קובץ' : 'File'}</button>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)', marginLeft: '1rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={showDetails} onChange={(e) => setShowDetails(e.target.checked)} />
              {isHe ? 'חשוף תואר ושנה' : 'Reveal Degree & Year'}
            </label>
          </div>
          <button className="btn-primary" style={{ padding: '0.5rem 2rem' }} onClick={handlePostSubmit} disabled={isPosting}>
             {isPosting ? '...' : (isHe ? 'פרסם אנונימית' : 'Post Anonymously')}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
        {posts.map((post) => (
          <div key={post.id} className="glass-card" style={{ padding: '2rem', position: 'relative' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <ScienceAvatar 
                  avatarId={post.avatarBase} 
                  avatarFile={`${post.avatarBase}.png`} 
                  accessory={ACCESSORIES.find(a => a.id === post.avatarAccessory) || null} 
                  backgroundColor={post.avatarColor}
                  size={50} 
                />
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--primary-dark)' }}>{post.user_id === currentUser?.id ? (isHe ? 'הכינוי שלי (את/ה)' : 'My Alias (You)') : post.author}</h3>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>{post.details} • {post.time}</p>
                </div>
              </div>

              {(post.user_id === currentUser?.id || currentUser?.profile?.is_admin) && (
                <div style={{ display: 'flex', gap: '0.8rem', marginTop: '0.8rem' }}>
                  <button onClick={() => handleStartEdit(post)} style={{ background: 'none', border: 'none', color: 'var(--primary-color)', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    ✏️ {isHe ? 'ערוך' : 'Edit'}
                  </button>
                  <button onClick={() => handleDeletePost(post.id)} style={{ background: 'none', border: 'none', color: '#F44336', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    🗑️ {isHe ? 'מחק' : 'Delete'}
                  </button>
                </div>
              )}
            </div>

            {/* Post Content */}
            {editingPostId === post.id ? (
                <div style={{ marginBottom: '1rem' }}>
                    <textarea 
                        className="input-field" 
                        rows={3} 
                        value={editPostText} 
                        onChange={(e) => setEditPostText(e.target.value)}
                        style={{ width: '100%', marginBottom: '0.5rem' }}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}>
                        <input type="file" id={`edit-file-${post.id}`} style={{ display: 'none' }} onChange={(e) => setEditFile(e.target.files?.[0] || null)} />
                        <button onClick={() => document.getElementById(`edit-file-${post.id}`)?.click()} className="btn-secondary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}>
                            📁 {isHe ? 'החלף קובץ/תמונה' : 'Replace File/Image'}
                        </button>
                        {editFile && <span style={{ fontSize: '0.7rem' }}>📎 {editFile.name}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => handleSaveEdit(post.id)} className="btn-primary" style={{ padding: '0.3rem 1rem', fontSize: '0.85rem' }}>{isHe ? 'שמור' : 'Save'}</button>
                        <button onClick={() => setEditingPostId(null)} className="btn-secondary" style={{ padding: '0.3rem 1rem', fontSize: '0.85rem' }}>{isHe ? 'ביטול' : 'Cancel'}</button>
                    </div>
                </div>
            ) : (
                <>
                    <p style={{ lineHeight: '1.6', margin: '0 0 1rem 0' }}>{post.text}</p>
                    {post.fileUrl && (
                    <div style={{ marginBottom: '1rem' }}>
                        <a href={post.fileUrl} target="_blank" rel="noreferrer" className="btn-secondary" style={{ fontSize: '0.85rem' }}>
                        📎 {isHe ? 'קובץ מצורף: פתח בחלון חדש' : 'Attachment: Open Link'}
                        </a>
                    </div>
                    )}
                </>
            )}

            {/* Comments Section */}
            <div style={{ borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: '1rem' }}>
              
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
                {post.comments.length > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--primary-color)', fontWeight: 'bold' }}>
                    <span style={{ fontSize: '1.2rem' }}>💬</span>
                    <span style={{ background: 'var(--primary-color)', color: 'white', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>{post.comments.length}</span>
                    <span style={{ fontSize: '0.9rem', marginLeft: '0.2rem' }}>{isHe ? 'תגובות' : 'Comments'}</span>
                  </div>
                ) : (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <span style={{ opacity: 0.5 }}>💬</span> {isHe ? 'אין תגובות עדיין' : 'No comments yet'}
                  </div>
                )}
              </div>

              {post.comments.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginBottom: '1rem' }}>
                  {post.comments.map((comment) => (
                    <div key={comment.id} style={{ background: 'var(--background-bg)', padding: '0.8rem', borderRadius: '8px', fontSize: '0.9rem', display: 'flex', gap: '0.8rem', alignItems: 'flex-start' }}>
                      <ScienceAvatar avatarId={comment.avatarBase} avatarFile={`${comment.avatarBase}.png`} accessory={null} size={30} backgroundColor="var(--primary-light)" />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                          <span style={{ fontWeight: 'bold', color: 'var(--primary-color)' }}>
                            {comment.user_id === currentUser?.id ? (isHe ? 'הכינוי שלי (את/ה)' : 'My Alias (You)') : comment.author}
                          </span>
                          {comment.degree && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>• {comment.degree}</span>
                          )}
                        </div>
                        {editingComment?.postId === post.id && editingComment?.commentId === comment.id ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <textarea 
                                    className="input-field" 
                                    rows={2} 
                                    value={editCommentText} 
                                    onChange={(e) => setEditCommentText(e.target.value)}
                                    style={{ width: '100%', fontSize: '0.85rem' }}
                                />
                                <div style={{ display: 'flex', gap: '0.4rem' }}>
                                    <button onClick={() => handleSaveEditComment(post.id, comment.id)} className="btn-primary" style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}>{isHe ? 'שמור' : 'Save'}</button>
                                    <button onClick={() => setEditingComment(null)} className="btn-secondary" style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}>{isHe ? 'ביטול' : 'Cancel'}</button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <p style={{ margin: 0, color: 'var(--text-main)' }}>{comment.text}</p>
                                { (comment.user_id === currentUser?.id || currentUser?.profile?.is_admin) && (
                                    <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.3rem' }}>
                                        <button onClick={() => handleStartEditComment(post.id, comment.id, comment.text)} style={{ background: 'none', border: 'none', color: 'var(--primary-color)', fontSize: '0.7rem', cursor: 'pointer', padding: 0 }}>
                                            {isHe ? 'ערוך' : 'Edit'}
                                        </button>
                                        <button onClick={() => handleDeleteComment(post.id, comment.id)} style={{ background: 'none', border: 'none', color: '#F44336', fontSize: '0.7rem', cursor: 'pointer', padding: 0 }}>
                                            {isHe ? 'מחק' : 'Delete'}
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Reply Input */}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input 
                  type="text" 
                  className="input-field" 
                  style={{ flex: 1, padding: '0.6rem' }}
                  placeholder={isHe ? 'כתוב/י תגובה אנונימית...' : 'Write an anonymous reply...'}
                  value={replyText[post.id] || ''}
                  onChange={(e) => setReplyText(prev => ({ ...prev, [post.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleReplySubmit(post.id); }}
                />
                <button 
                  className="btn-secondary" 
                  style={{ padding: '0.6rem 1rem', background: 'var(--primary-light)', color: 'var(--primary-color)', border: 'none' }}
                  onClick={() => handleReplySubmit(post.id)}
                >
                  {isHe ? 'הגב' : 'Reply'}
                </button>
              </div>
              <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input 
                  type="checkbox" 
                  id={`reply-details-${post.id}`} 
                  checked={showReplyDetails} 
                  onChange={(e) => setShowReplyDetails(e.target.checked)} 
                  style={{ accentColor: 'var(--primary-color)' }}
                />
                <label htmlFor={`reply-details-${post.id}`} style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {isHe ? 'הצג תואר ושנת לימוד בתגובה' : 'Show degree & year in reply'}
                </label>
              </div>

            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
