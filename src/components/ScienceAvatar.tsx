"use client"
import React from 'react';

// ────────────────────────────────────────────────────────────
//  AVATARS
// ────────────────────────────────────────────────────────────
export const AVATARS = [
  { id: 'tooth', labelEn: 'Tooth', labelHe: 'שן', file: 'tooth.png' },
  { id: 'heart', labelEn: 'Heart', labelHe: 'לב', file: 'heart.png' },
  { id: 'brain', labelEn: 'Brain', labelHe: 'מוח', file: 'brain.png' },
  { id: 'lung', labelEn: 'Lung', labelHe: 'ריאה', file: 'lung.png' },
  { id: 'kidney', labelEn: 'Kidney', labelHe: 'כליה', file: 'kidney.png' },
  { id: 'intestine', labelEn: 'Intestine', labelHe: 'מעי', file: 'intestine.png' },
  { id: 'small_bowl', labelEn: 'Gallbladder', labelHe: 'כיס מרה', file: 'small_bowl.png' },
  { id: 'bacteria1', labelEn: 'Bacteria', labelHe: 'חיידק', file: 'bacteria1.png' },
  { id: 'corona1', labelEn: 'Corona 1', labelHe: 'קורונה 1', file: 'corona1.png' },
  { id: 'corona2', labelEn: 'Corona 2', labelHe: 'קורונה 2', file: 'corona2.png' },
  { id: 'virus', labelEn: 'Virus', labelHe: 'וירוס', file: 'virus.png' },
  { id: 'virus2', labelEn: 'Virus 2', labelHe: 'וירוס 2', file: 'virus2.png' },
  { id: 'extra', labelEn: 'Special', labelHe: 'מיוחד', file: 'extra.png' },
];

// ────────────────────────────────────────────────────────────
//  ACCESSORIES
// ────────────────────────────────────────────────────────────
export type AccessoryPosition = 'head' | 'eyes' | 'hand' | 'neck' | 'body' | 'none';

export interface Accessory {
  id: string;
  labelEn: string;
  labelHe: string;
  file: string | null;
  position: AccessoryPosition;
  category: string;
  emoji: string;
}

export const ACCESSORIES: Accessory[] = [
  { id: 'none', labelEn: 'None', labelHe: 'ללא', file: null, position: 'none', category: 'none', emoji: '✖️' },
  // Glasses
  { id: 'glasses1', labelEn: 'Classic Glasses', labelHe: 'משקפיים', file: 'glass1.png', position: 'eyes', category: 'glasses', emoji: '🤓' },
  { id: 'glasses2', labelEn: 'Round Glasses', labelHe: 'משקפי עגול', file: 'glasses2.png', position: 'eyes', category: 'glasses', emoji: '👓' },
  { id: 'glasses3', labelEn: 'Cool Glasses', labelHe: 'משקפי שמש', file: 'glass3.png', position: 'eyes', category: 'glasses', emoji: '😎' },
  // Hats
  { id: 'hat', labelEn: 'Hat', labelHe: 'כובע', file: 'hat.png', position: 'head', category: 'hats', emoji: '🎩' },
  { id: 'hat1', labelEn: 'Hat Style 2', labelHe: 'כובע 2', file: 'hat1.png', position: 'head', category: 'hats', emoji: '🧢' },
  { id: 'hat3', labelEn: 'Hat Style 3', labelHe: 'כובע 3', file: 'hat3.png', position: 'head', category: 'hats', emoji: '👒' },
  { id: 'hat4', labelEn: 'Hat Style 4', labelHe: 'כובע 4', file: 'hat4.png', position: 'head', category: 'hats', emoji: '🪖' },
  { id: 'crown', labelEn: 'Crown', labelHe: 'כתר', file: 'crown.png', position: 'head', category: 'hats', emoji: '👑' },
  // Medical
  { id: 'stethoscope', labelEn: 'Stethoscope', labelHe: 'סטטוסקופ', file: 'stethoscope.png', position: 'neck', category: 'medical', emoji: '🩺' },
  { id: 'medicine1', labelEn: 'Medicine', labelHe: 'תרופה', file: 'medicine1.png', position: 'hand', category: 'medical', emoji: '💊' },
  { id: 'medicine2', labelEn: 'Capsule', labelHe: 'כמוסה', file: 'medicine2.png', position: 'hand', category: 'medical', emoji: '💉' },
  { id: 'pipette', labelEn: 'Pipette', labelHe: 'פיפטה', file: 'pipette.png', position: 'hand', category: 'medical', emoji: '🔬' },
  // Items
  { id: 'coffee', labelEn: 'Coffee', labelHe: 'קפה', file: 'coffee.png', position: 'hand', category: 'items', emoji: '☕' },
  { id: 'game', labelEn: 'Controller', labelHe: 'שלט', file: 'game.png', position: 'hand', category: 'items', emoji: '🎮' },
  { id: 'pen', labelEn: 'Pen', labelHe: 'עט', file: 'pen.png', position: 'hand', category: 'items', emoji: '🖊️' },
  { id: 'pencil', labelEn: 'Pencil', labelHe: 'עיפרון', file: 'pencil.png', position: 'hand', category: 'items', emoji: '✏️' },
  // Fashion
  { id: 'bowtie', labelEn: 'Bowtie', labelHe: 'פפיון', file: 'bowtie.svg', position: 'neck', category: 'fashion', emoji: '🎀' },
];

// ────────────────────────────────────────────────────────────
//  PASTEL BACKGROUND COLORS
// ────────────────────────────────────────────────────────────
export const PASTEL_COLORS = [
  { id: 'mint', color: '#C8F0E0', label: 'Mint' },
  { id: 'lavender', color: '#E0C8F0', label: 'Lavender' },
  { id: 'peach', color: '#F0DCC8', label: 'Peach' },
  { id: 'sky', color: '#C8DCF0', label: 'Sky Blue' },
  { id: 'rose', color: '#F0C8D4', label: 'Rose' },
  { id: 'light_orange', color: '#FFD3B6', label: 'Light Orange' },
];

// ────────────────────────────────────────────────────────────
//  POSITION STYLES & OFFSETS
// ────────────────────────────────────────────────────────────
type CustomOffset = { top?: string; left?: string; bottom?: string; right?: string; width?: string; transform?: string };

export const AVATAR_OFFSETS: Record<string, Record<string, CustomOffset>> = {
  kidney: {
    neck: { top: '42%' },
    stethoscope: { top: '56%' }, // כליה סטטוסקופ למטה
    eyes: { top: '52%', width: '80%' },
    hat4: { top: '-26%', width: '45%' },
  },
  tooth: {
    hat4: { top: '-30%', width: '42%' },
    eyes: { top: '38%', width: '85%' },
  },
  heart: {
    head: { top: '4%', width: '44%' },
    hat4: { top: '-26%', width: '42%' },
    eyes: { top: '50%' },
    stethoscope: { top: '56%', width: '80%' }, // לב סטטוסקופ להקטין ולהוריד
  },
  brain: {
    head: { top: '0%' },
    hat4: { top: '-26%', width: '45%' },
    eyes: { top: '52%' },
    stethoscope: { left: '46%' }, // מוח סטטוסקופ מעט שמאלה
  },
  lung: {
    head: { top: '0%', left: '57%', width: '48%' },
    hat: { top: '6%', width: '44%' },
    hat1: { top: '4%' },
    hat4: { top: '-26%', width: '42%' },
    eyes: { top: '52%', left: '55%' },
  },
  intestine: {
    head: { top: '3%', left: '46%', width: '45%' },
    hat4: { top: '-28%', left: '46%', width: '35%' }, // מעי כובע 4 להקטין
    eyes: { top: '56%', width: '80%' },
    stethoscope: { width: '80%' }, // מעי סטטוסקופ להקטין
  },
  small_bowl: {
    hat4: { top: '-26%', width: '45%' },
    eyes: { top: '48%' },
    stethoscope: { left: '46%', width: '80%' }, // כיס מרה מעט שמאלה ולהקטין
  },
  bacteria1: {
    head: { left: '58%', width: '48%' },
    hat1: { top: '0%' },
    hat4: { top: '-26%', width: '42%' },
    eyes: { left: '54%' },
  },
  corona1: {
    head: { top: '0%' },
    hat: { top: '6%', width: '46%' },
    hat4: { top: '-26%', width: '45%' },
    eyes: { top: '48%' },
    stethoscope: { left: '46%' }, // קורונה 1 מעט שמאלה
  },
  corona2: {
    head: { top: '8%', width: '50%' },
    hat: { top: '10%', width: '44%' },
    hat4: { top: '-18%', width: '38%' }, // קורונה 2 כובע 4 להוריד למטה
    eyes: { top: '52%', left: '50%' },
    stethoscope: { left: '46%' }, // קורונה 2 מעט שמאלה סטטוסקופ
  },
  virus: {
    head: { top: '0%', left: '54%' },
    hat: { top: '4%', width: '46%' },
    hat1: { top: '4%', left: '50%', width: '46%' },
    hat4: { top: '-26%', width: '45%' },
    eyes: { top: '48%', left: '50%' },
  },
  virus2: {
    head: { top: '6%', left: '62%', width: '40%' }, // וירוס 2 כובעים טיפה ימינה
    hat4: { top: '-26%', left: '62%', width: '32%' }, // וירוס 2 כובע 4 מעט להקטין ימינה
    eyes: { top: '46%', left: '58%', width: '45%' },
    stethoscope: { top: '44%', width: '85%' }, // וירוס 2 סטטוסקופ להקטין ומעט למעלה
  },
  extra: {
    head: { top: '5%', left: '38%', width: '50%' },
    hat4: { top: '-18%', left: '38%', width: '40%' }, // מיוחד כובע 4 למטה
    eyes: { top: '48%', left: '42%', width: '55%' },
    stethoscope: { left: '45%', width: '85%' }, // מיוחד סטטוסקופ שמאלה ולהקטין
  },

  default: {
    eyes: { top: '42%' },
    hat4: { top: '-20%' },
    pencil: { width: '25%' },
  }
};

function getAccessoryStyle(
  position: AccessoryPosition,
  size: number,
  avatarId: string,
  accessoryId: string
): React.CSSProperties {
  let baseStyle: React.CSSProperties = { position: 'absolute', zIndex: 10, pointerEvents: 'none' };

  switch (position) {
    case 'head':
      baseStyle = { ...baseStyle, top: '-8%', left: '50%', transform: 'translateX(-50%)', width: '58%', height: 'auto' };
      break;
    case 'eyes':
      baseStyle = { ...baseStyle, top: '42%', left: '50%', transform: 'translate(-50%, -50%)', width: '70%', height: 'auto' };
      break;
    case 'neck':
      baseStyle = { ...baseStyle, top: '60%', left: '50%', transform: 'translateX(-50%)', width: '62%', height: 'auto' };
      break;
    case 'body':
      baseStyle = { ...baseStyle, top: '65%', left: '50%', transform: 'translateX(-50%)', width: '55%', height: 'auto' };
      break;
    case 'hand':
      baseStyle = { ...baseStyle, bottom: '5%', right: '-8%', width: '40%', height: 'auto', transform: 'rotate(-12deg)' };
      break;
    default:
      return { display: 'none' };
  }

  // 1. Accessory specific defaults
  const accDef = AVATAR_OFFSETS['default']?.[accessoryId];
  if (accDef) {
    if (accDef.top) baseStyle.top = accDef.top;
    if (accDef.width) baseStyle.width = accDef.width;
  }

  // 2. Avatar specific position overrides (e.g. kidney neck)
  const avPos = AVATAR_OFFSETS[avatarId]?.[position];
  if (avPos) {
    if (avPos.top) baseStyle.top = avPos.top;
    if (avPos.left) baseStyle.left = avPos.left;
    if (avPos.width) baseStyle.width = avPos.width;
    if (avPos.transform) baseStyle.transform = avPos.transform;
  }

  // 3. Exact Avatar+Accessory overrides (if needed in the future)
  const exact = AVATAR_OFFSETS[avatarId]?.[accessoryId];
  if (exact) {
    if (exact.top) baseStyle.top = exact.top;
    if (exact.width) baseStyle.width = exact.width;
    if (exact.transform) baseStyle.transform = exact.transform;
  }

  return baseStyle;
}

// ────────────────────────────────────────────────────────────
//  COMPONENT
// ────────────────────────────────────────────────────────────
interface ScienceAvatarProps {
  avatarId: string;
  avatarFile: string;
  accessory?: Accessory | null;
  backgroundColor?: string;
  size?: number;
  className?: string;
  showRing?: boolean;
}

export const ScienceAvatar: React.FC<ScienceAvatarProps> = ({
  avatarId,
  avatarFile,
  accessory = null,
  backgroundColor = '#C8F0E0',
  size = 200,
  className,
  showRing = false,
}) => {
  const hasAccessory = accessory && accessory.file && accessory.position !== 'none';

  return (
    <div
      className={className}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        position: 'relative',
        flexShrink: 0,
        // Reduced margin top, using transform for better vertical control if needed
        marginTop: `${size * 0.05}px`, 
      }}
    >
      {/* Circle background */}
      <div style={{
        width: '100%',
        height: '100%',
        borderRadius: '50%',
        backgroundColor: backgroundColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: showRing
          ? `0 0 0 3px white, 0 0 0 6px var(--primary-color), 0 8px 24px rgba(138,99,210,0.25)`
          : '0 8px 24px rgba(0,0,0,0.12)',
        overflow: 'hidden',
        position: 'relative',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        <img
          src={`/avatars/${avatarFile}`}
          alt="avatar"
          style={{ 
            width: '90%', 
            height: '90%', 
            objectFit: 'contain', 
            transition: 'all 0.3s ease',
            // Ensure no accidental offset
            display: 'block'
          }}
          onError={(e) => { e.currentTarget.style.opacity = '0.3'; }}
        />
      </div>

      {/* Accessory overlay — rendered OUTSIDE the circle so hats can overflow */}
      {hasAccessory && accessory?.file && (
        <img
          src={`/acessories/${accessory.file}`}
          alt={accessory.labelEn}
          style={getAccessoryStyle(accessory.position, size, avatarId, accessory.id)}
        />
      )}
    </div>
  );
};
