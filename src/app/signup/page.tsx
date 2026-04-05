"use client"
import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { translations } from '@/lib/i18n';
import { useLanguage } from '@/hooks/useLanguage';
import { ScienceAvatar, AVATARS, ACCESSORIES, PASTEL_COLORS, Accessory } from '@/components/ScienceAvatar';

const ACCESSORY_CATEGORIES = [
  { key: 'none', label: 'None', labelHe: 'ללא', emoji: '✖️' },
  { key: 'glasses', label: 'Glasses', labelHe: 'משקפיים', emoji: '👓' },
  { key: 'hats', label: 'Hats', labelHe: 'כובעים', emoji: '🎩' },
  { key: 'medical', label: 'Medical', labelHe: 'רפואי', emoji: '🩺' },
  { key: 'items', label: 'Items', labelHe: 'חפצים', emoji: '🎮' },
  { key: 'fashion', label: 'Fashion', labelHe: 'אופנה', emoji: '🎀' },
];

export default function SignupPage() {
  const router = useRouter();
  const { language, setLanguage, isReady } = useLanguage();

  const currentLanguage = language || 'he';
  const t = translations[currentLanguage];
  const isHe = currentLanguage === 'he';

  const [isSaving, setIsSaving] = useState(false);

  // Personal details
  const [realName, setRealName] = useState('');
  const [program, setProgram] = useState('');
  const [year, setYear] = useState('');
  const [customName, setCustomName] = useState('');

  // Avatar builder
  const [selectedAvatarId, setSelectedAvatarId] = useState(AVATARS[0].id);
  const [selectedAccessoryId, setSelectedAccessoryId] = useState('none');
  const [selectedColorId, setSelectedColorId] = useState('lavender');
  const [activeCategory, setActiveCategory] = useState('none');

  const selectedAvatar = AVATARS.find(a => a.id === selectedAvatarId)!;
  const selectedAccessory = ACCESSORIES.find(a => a.id === selectedAccessoryId) ?? ACCESSORIES[0];
  const selectedColor = PASTEL_COLORS.find(c => c.id === selectedColorId)!;

  const filteredAccessories = useMemo(
    () => ACCESSORIES.filter(a => a.category === activeCategory),
    [activeCategory]
  );

  useEffect(() => {
    const checkPostLogin = async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) return;

      const pendingStr = sessionStorage.getItem('pendingProfile');
      if (pendingStr) {
        setIsSaving(true);
        try {
          const p = JSON.parse(pendingStr);
          const [first, ...lastArr] = p.realName.split(' ');

          const { error } = await supabase.from('profiles').upsert([{
            id: authData.user.id,
            real_first_name: first,
            alias: p.customName || `Dr. ${p.avatarName}`,
            avatar_base: p.avatarFile,
            avatar_accessory: p.accessoryFile || '(None)',
            avatar_bg: p.color,
            degree: p.program,
            year: p.year,
            helper_stars: 0,
          }]);

          if (!error) {
            sessionStorage.removeItem('pendingProfile');
            router.push('/dashboard');
          } else {
            console.error(error);
            alert('Error saving profile: ' + error.message);
            setIsSaving(false);
          }
        } catch (err) {
          console.error(err);
          setIsSaving(false);
        }
      }
    };

    checkPostLogin();
  }, [router]);

  if (!isReady) return null;

  const handleSaveProfile = async () => {
    if (!realName || !customName) {
      alert(isHe ? 'אנא מלאו שם מלא וכינוי כדי להמשיך!' : 'Please fill full name and nickname to continue!');
      return;
    }

    setIsSaving(true);

    const pendingProfile = {
      realName,
      program,
      year,
      customName,
      avatarName: isHe ? selectedAvatar.labelHe : selectedAvatar.labelEn,
      avatarFile: selectedAvatar.id,
      accessoryFile: selectedAccessory.id,
      color: selectedColor.color,
    };

    sessionStorage.setItem('pendingProfile', JSON.stringify(pendingProfile));

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/signup`,
      },
    });

    if (error) {
      console.error(error);
      alert('Error signing in with Google');
      setIsSaving(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(circle at top left, #f3eafd 0%, #F8F7FA 40%, #eaeffd 100%)',
      padding: '2rem 1rem 4rem',
      direction: isHe ? 'rtl' : 'ltr',
      fontFamily: "'Inter', sans-serif",
    }}>
      {/* Language toggle */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', maxWidth: '900px', margin: '0 auto 1.5rem' }}>
        <button
          onClick={() => setLanguage(isHe ? 'en' : 'he')}
          style={{ padding: '0.5rem 1.2rem', borderRadius: '2rem', border: '1px solid #8A63D2', background: 'white', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', color: '#8A63D2' }}
        >
          {isHe ? 'English' : 'עברית'}
        </button>
      </div>

      <div style={{ maxWidth: '900px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <h1 style={{ fontSize: '2.4rem', fontWeight: 800, color: '#8A63D2', fontFamily: "'Outfit', sans-serif", margin: 0 }}>
            {isHe ? '✨ צרי את הדמות שלך' : '✨ Create Your Character'}
          </h1>
          <p style={{ color: '#6B6871', marginTop: '0.5rem', fontSize: '1rem' }}>
            {isHe ? 'בחרי דמות, הוסיפי אביזרים וצבע — וצרי את הפרופיל שלך באתר.' : 'Pick a character, add accessories & color — and create your profile on the site.'}
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'start' }}>

          {/* ── LEFT: PREVIEW ── */}
          <div className="glass-panel" style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', position: 'sticky', top: '2rem' }}>

            {/* Big Avatar Preview */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
              <ScienceAvatar
                avatarId={selectedAvatar.id}
                avatarFile={selectedAvatar.file}
                accessory={selectedAccessory}
                backgroundColor={selectedColor.color}
                size={180}
                showRing
              />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#8A63D2', fontFamily: "'Outfit', sans-serif" }}>
                  {isHe ? selectedAvatar.labelHe : selectedAvatar.labelEn}
                </div>
                {selectedAccessory.id !== 'none' && (
                  <div style={{ fontSize: '0.85rem', color: '#6B6871', marginTop: '0.2rem' }}>
                    {selectedAccessory.emoji} {isHe ? selectedAccessory.labelHe : selectedAccessory.labelEn}
                  </div>
                )}
              </div>
            </div>

            {/* Alias input */}
            <div style={{ width: '100%' }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.4rem', color: '#2D2A32' }}>
                {isHe ? '🏷️ כינוי למערכת' : '🏷️ Nickname'}
              </label>
              <input
                type="text"
                className="input-field"
                placeholder={isHe ? 'למשל: ד״ר מוח מבריק' : 'e.g. Dr. Brilliant Brain'}
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                style={{ textAlign: 'center', fontWeight: 600, fontSize: '1rem', color: '#8A63D2' }}
              />
            </div>

            {/* Color picker */}
            <div style={{ width: '100%' }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.6rem', color: '#2D2A32' }}>
                🎨 {isHe ? 'צבע רקע' : 'Background color'}
              </label>
              <div style={{ display: 'flex', gap: '0.7rem', justifyContent: 'center' }}>
                {PASTEL_COLORS.map(c => (
                  <button
                    key={c.id}
                    title={c.label}
                    onClick={() => setSelectedColorId(c.id)}
                    style={{
                      width: '42px', height: '42px', borderRadius: '50%',
                      background: c.color,
                      border: selectedColorId === c.id ? '3px solid white' : '3px solid transparent',
                      outline: selectedColorId === c.id ? '3px solid #8A63D2' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      transform: selectedColorId === c.id ? 'scale(1.15)' : 'scale(1)',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* ── RIGHT: BUILDER ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {/* Personal Details */}
            <div className="glass-panel" style={{ padding: '1.5rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#8A63D2', marginBottom: '1rem' }}>
                📋 {isHe ? 'פרטים אישיים' : 'Personal Details'}
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <div>
                  <input type="text" className="input-field" placeholder={isHe ? 'שם מלא' : 'Full name'} value={realName} onChange={e => setRealName(e.target.value)} />
                  <p style={{ fontSize: '0.75rem', color: '#6B6871', margin: '0.3rem 0.5rem 0', fontWeight: 500 }}>
                    {isHe ? 'השם המלא שלך אנונימי ויופיע רק בקבוצות הלמידה שלך או בשיחות פרטיות בהסכמתך.' : 'Your full name remains anonymous and will only appear in your study groups or private chats with your consent.'}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.8rem' }}>
                  <select className="input-field" value={program} onChange={e => setProgram(e.target.value)}>
                    <option value="" disabled>{isHe ? 'תואר' : 'Degree'}</option>
                    {Object.entries(t.degrees).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <select className="input-field" value={year} onChange={e => setYear(e.target.value)}>
                    <option value="" disabled>{isHe ? 'שנה' : 'Year'}</option>
                    {Object.entries(t.years).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Avatar Picker */}
            <div className="glass-panel" style={{ padding: '1.5rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#8A63D2', marginBottom: '1rem' }}>
                🎭 {isHe ? 'בחרי דמות' : 'Choose Character'}
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(68px, 1fr))', gap: '0.6rem' }}>
                {AVATARS.map(av => (
                  <button
                    key={av.id}
                    onClick={() => setSelectedAvatarId(av.id)}
                    title={isHe ? av.labelHe : av.labelEn}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem',
                      padding: '0.4rem',
                      borderRadius: '14px',
                      border: selectedAvatarId === av.id ? '2.5px solid #8A63D2' : '2.5px solid transparent',
                      background: selectedAvatarId === av.id ? '#eaddff' : 'rgba(255,255,255,0.6)',
                      cursor: 'pointer',
                      transition: 'all 0.18s ease',
                      transform: selectedAvatarId === av.id ? 'scale(1.05)' : 'scale(1)',
                    }}
                  >
                    <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: selectedColor.color, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img src={`/avatars/${av.file}`} alt={av.labelEn} style={{ width: '85%', height: '85%', objectFit: 'contain' }} />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Accessory Picker */}
            <div className="glass-panel" style={{ padding: '1.5rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#8A63D2', marginBottom: '1rem' }}>
                ✨ {isHe ? 'בחרי אביזר' : 'Add Accessory'}
              </h2>

              {/* Category tabs */}
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                {ACCESSORY_CATEGORIES.map(cat => (
                  <button
                    key={cat.key}
                    onClick={() => setActiveCategory(cat.key)}
                    style={{
                      padding: '0.35rem 0.8rem', borderRadius: '2rem', fontSize: '0.8rem', fontWeight: 600,
                      border: '1.5px solid',
                      borderColor: activeCategory === cat.key ? '#8A63D2' : '#e0d7f5',
                      background: activeCategory === cat.key ? '#8A63D2' : 'white',
                      color: activeCategory === cat.key ? 'white' : '#6B6871',
                      cursor: 'pointer', transition: 'all 0.15s ease',
                    }}
                  >
                    {cat.emoji} {isHe ? cat.labelHe : cat.label}
                  </button>
                ))}
              </div>

              {/* Accessory grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: '0.6rem' }}>
                {filteredAccessories.map(acc => (
                  <button
                    key={acc.id}
                    onClick={() => setSelectedAccessoryId(acc.id)}
                    title={isHe ? acc.labelHe : acc.labelEn}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem',
                      padding: '0.5rem 0.3rem', borderRadius: '12px',
                      border: selectedAccessoryId === acc.id ? '2.5px solid #8A63D2' : '2.5px solid transparent',
                      background: selectedAccessoryId === acc.id ? '#eaddff' : 'rgba(255,255,255,0.7)',
                      cursor: 'pointer', transition: 'all 0.15s ease',
                      transform: selectedAccessoryId === acc.id ? 'scale(1.05)' : 'scale(1)',
                    }}
                  >
                    {acc.id === 'none' ? (
                      <div style={{ width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem' }}>✖️</div>
                    ) : (
                      <div style={{ width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <img src={`/acessories/${acc.file}`} alt={acc.labelEn} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      </div>
                    )}
                    <span style={{ fontSize: '0.6rem', fontWeight: 600, color: selectedAccessoryId === acc.id ? '#8A63D2' : '#6B6871', textAlign: 'center', lineHeight: 1.2, maxWidth: '66px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {isHe ? acc.labelHe : acc.labelEn}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Save button */}
            {isSaving ? (
              <div style={{ textAlign: 'center', color: '#8A63D2', fontWeight: 600, padding: '1.1rem', background: '#eaddff', borderRadius: '16px' }}>
                {isHe ? 'שומר את הפרופיל ומתחבר...' : 'Saving profile & logging in...'}
              </div>
            ) : (
              <button
                onClick={handleSaveProfile}
                className="btn-primary"
                style={{ width: '100%', padding: '1.1rem', fontSize: '1.1rem', borderRadius: '16px', display: 'flex', gap: '0.8rem', justifyContent: 'center', alignItems: 'center' }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ background: 'white', borderRadius: '50%', padding: '2px' }}>
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                {isHe ? 'הרשמה עם Gmail והמשך' : 'Register with Gmail & Continue'}
              </button>
            )}
            <div style={{ textAlign: 'center' }}>
              <Link href="/" style={{ color: '#6B6871', fontSize: '0.85rem', textDecoration: 'underline' }}>
                {isHe ? 'חזרה לדף הבית' : 'Back to home'}
              </Link>
            </div>

          </div>
        </div>
      </div>

      {/* Floating Suggestion Button */}
      <a
        href="mailto:contact@studybuddy.com?subject=StudyBuddy - רעיון לאביזר או דמות חדשה!&body=היי! יש לי רעיון מגניב לדמות או אביזר לאפליקציה:%0D%0A%0D%0A"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          position: 'fixed',
          bottom: '2rem',
          right: '2rem',
          background: 'white',
          border: '2px solid var(--primary-color)',
          borderRadius: '24px',
          padding: '0.8rem 1.2rem',
          color: 'var(--primary-dark)',
          fontWeight: 700,
          fontSize: '0.9rem',
          boxShadow: '0 4px 12px rgba(138, 99, 210, 0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          cursor: 'pointer',
          zIndex: 1000,
          transition: 'all 0.3s ease',
          textDecoration: 'none'
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(138, 99, 210, 0.4)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(138, 99, 210, 0.2)'; }}
      >
        <span style={{ fontSize: '1.2rem' }}>💡</span>
        {isHe ? 'יש לך רעיון לדמות?' : 'Got a character idea?'}
      </a>
    </div>
  );
}
