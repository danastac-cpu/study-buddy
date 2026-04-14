export const formatDateIsrael = (dateInput: string | Date | null | undefined, language: string = 'he') => {
  if (!dateInput || dateInput === 'TBD' || dateInput === 'טרם נקבע' || dateInput === 'לא נקבע מועד') {
    return language === 'he' ? 'טרם נקבע' : 'TBD';
  }

  try {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return String(dateInput);

    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');

    if (language === 'he') {
      const daysHe = ['א\'', 'ב\'', 'ג\'', 'ד\'', 'ה\'', 'ו\'', 'ש\''];
      const dayHe = daysHe[d.getDay()];
      return `יום ${dayHe}, ${day}.${month} | ${hours}:${minutes}`;
    } else {
      const daysEn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const dayEn = daysEn[d.getDay()];
      return `${dayEn}, ${day}.${month} | ${hours}:${minutes}`;
    }
  } catch (e) {
    return String(dateInput);
  }
};

export const getUrgencyLabel = (dateInput: string | Date | null | undefined) => {
  if (!dateInput || dateInput === 'TBD' || dateInput === 'טרם נקבע') return null;
  
  try {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return null;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const targetDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    const diffInDays = Math.floor((targetDate.getTime() - today.getTime()) / (1000 * 3600 * 24));

    if (diffInDays === 0) return 'today';
    if (diffInDays > 0 && diffInDays <= 7) return 'week';
    if (diffInDays < 0) return 'past';
    return 'future';
  } catch (e) {
    return null;
  }
};
