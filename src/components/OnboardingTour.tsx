"use client"
import { useState, useEffect } from 'react';
import { translations } from '@/lib/i18n';
import { useLanguage } from '@/hooks/useLanguage';

interface OnboardingTourProps {
  onComplete: () => void;
}

export const OnboardingTour = ({ onComplete }: OnboardingTourProps) => {
  const { language } = useLanguage();
  const isHe = language === 'he';
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: isHe ? 'ברוכים הבאים ל-StudyBuddy! 💜' : 'Welcome to StudyBuddy! 💜',
      content: isHe 
        ? 'המקום שבו למידה הופכת לחווייתית, משותפת ומקדמת. בואו נעשה סיור קצר כדי שתדעו איך להפיק את המרב מהאתר.'
        : 'The place where learning becomes interactive, collaborative, and rewarding. Let\'s take a quick tour so you know how to get the most out of it.',
      icon: '🚀'
    },
    {
      title: isHe ? 'קבוצות למידה 👥' : 'Study Groups 👥',
      content: isHe 
        ? 'כאן תוכלו למצוא סטודנטים אחרים שלומדים לאותם קורסים שלכם. הצטרפו לקבוצה קיימת או פתחו אחת חדשה בעצמכם!'
        : 'Find other students studying for the same courses. Join an existing group or start a new one yourself!',
      icon: '📚'
    },
    {
      title: isHe ? 'מרכז העזרה 🤝' : 'Help Center 🤝',
      content: isHe 
        ? 'צריכים עזרה נקודתית? או רוצים לעזור לאחרים? כאן תוכלו לפרסם בקשות לסיוע 1-על-1 ולקבל מענה מהיר.'
        : 'Need specific help? Or want to help others? Post 1-on-1 assistance requests here and get quick responses.',
      icon: '💡'
    },
    {
      title: isHe ? 'שיטת הכוכבים ⭐' : 'The Star System ⭐',
      content: isHe 
        ? 'עזרה לאחרים מזכה אתכם בכוכבים! ככל שיש לכם יותר כוכבים, הדירוג שלכם עולה ואתם הופכים לסטודנטים "מומחים" בקהילה.'
        : 'Helping others earns you stars! The more stars you have, the higher your rating, establishing you as an "Expert" in the community.',
      icon: '✨'
    },
    {
      title: isHe ? 'מוכנים? נצא לדרך! 💜' : 'Ready? Let\'s Go! 💜',
      content: isHe 
        ? 'סידרנו לכם הכל בדאשבורד. אתם מוזמנים להתחיל לחקור את האתר ולמצוא את שותפי הלמידה הבאים שלכם.'
        : 'Everything is organized for you on the Dashboard. Start exploring and find your next study buddies!',
      icon: '🎨'
    }
  ];

  const current = steps[step];

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }}>
      <div className="modal-content" style={{ maxWidth: '450px', padding: '2.5rem', textAlign: 'center', direction: isHe ? 'rtl' : 'ltr' }}>
        <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>{current.icon}</div>
        <h2 style={{ fontSize: '1.8rem', color: 'var(--primary-color)', marginBottom: '1rem', fontWeight: '800' }}>
          {current.title}
        </h2>
        <p style={{ color: 'var(--text-muted)', lineHeight: '1.6', fontSize: '1.05rem', marginBottom: '2rem' }}>
          {current.content}
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
          {step > 0 && (
            <button 
              onClick={() => setStep(step - 1)} 
              className="btn-secondary" 
              style={{ padding: '0.8rem 1.5rem' }}
            >
              {isHe ? 'חזרה' : 'Back'}
            </button>
          )}
          <button 
            onClick={() => {
              if (step < steps.length - 1) setStep(step + 1);
              else onComplete();
            }} 
            className="btn-primary" 
            style={{ padding: '0.8rem 1.5rem', minWidth: '120px' }}
          >
            {step < steps.length - 1 ? (isHe ? 'הבא' : 'Next') : (isHe ? 'בואו נתחיל!' : 'Let\'s Start!')}
          </button>
        </div>

        <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
          {steps.map((_, i) => (
            <div 
              key={i} 
              style={{ 
                width: '8px', 
                height: '8px', 
                borderRadius: '50%', 
                background: i === step ? 'var(--primary-color)' : '#E0E0E0',
                transition: 'all 0.3s ease'
              }} 
            />
          ))}
        </div>
      </div>
    </div>
  );
};
