import { useState, useEffect } from 'react';
import { Language } from '@/lib/i18n';

export function useLanguage() {
  const [language, setLanguage] = useState<Language>('he');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // When component mounts, read from localStorage
    const saved = localStorage.getItem('studybuddy_lang') as Language;
    if (saved === 'he' || saved === 'en') {
      setLanguage(saved);
    }
    setIsReady(true);
  }, []);

  const changeLanguage = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem('studybuddy_lang', lang);
  };

  return { language, setLanguage: changeLanguage, isReady };
}
