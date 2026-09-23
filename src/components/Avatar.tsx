import React, { useState } from 'react';
import { Users, Radio, Bookmark, Bot, User } from 'lucide-react';

interface AvatarProps {
  peerId?: string | number | null;
  name?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  isGroup?: boolean;
  isChannel?: boolean;
  isSavedMessages?: boolean;
  isBot?: boolean;
  isBig?: boolean;
  customSrc?: string | null;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

// Telegram Official Avatar Gradient Backgrounds
const TELEGRAM_AVATAR_GRADIENTS = [
  'from-[#e17076] to-[#ff8e94]', // Red
  'from-[#faa774] to-[#ffb885]', // Orange
  'from-[#a695e7] to-[#b8a9f8]', // Violet
  'from-[#7bc862] to-[#8ee273]', // Green
  'from-[#6ec9cb] to-[#80e0e2]', // Cyan
  'from-[#65aadd] to-[#79beff]', // Blue
  'from-[#ee7aae] to-[#ff94c4]', // Pink
];

export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % TELEGRAM_AVATAR_GRADIENTS.length;
  return TELEGRAM_AVATAR_GRADIENTS[index];
}

export function getInitials(name: string): string {
  if (!name) return '';
  const trimmed = name.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    const first = Array.from(parts[0])[0];
    const second = Array.from(parts[1])[0];
    return `${first}${second}`.toUpperCase();
  }
  const chars = Array.from(trimmed);
  return (chars.slice(0, 2).join('')).toUpperCase();
}

const SIZE_CLASSES = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-xl',
  '2xl': 'w-24 h-24 text-3xl',
};

const ICON_SIZES = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
  xl: 'w-8 h-8',
  '2xl': 'w-12 h-12',
};

export const Avatar: React.FC<AvatarProps> = ({
  peerId,
  name = '',
  size = 'md',
  isGroup = false,
  isChannel = false,
  isSavedMessages = false,
  isBot = false,
  isBig = false,
  customSrc,
  className = '',
  onClick,
}) => {
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  const cleanName = (name || '').trim();
  const avatarGradient = getAvatarColor(cleanName || String(peerId || 'User'));
  const initials = getInitials(cleanName);

  // Build real Telegram photo URL
  const avatarUrl =
    customSrc ||
    (peerId && !isSavedMessages
      ? `/api/telegram/avatar/${encodeURIComponent(String(peerId))}${isBig ? '?big=1' : ''}`
      : null);

  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md;
  const iconSizeClass = ICON_SIZES[size] || ICON_SIZES.md;

  const showImage = avatarUrl && !imgError;

  return (
    <div
      onClick={onClick}
      className={`relative shrink-0 rounded-full select-none overflow-hidden flex items-center justify-center font-bold text-white shadow-sm transition-transform ${
        onClick ? 'cursor-pointer active:scale-95' : ''
      } ${sizeClass} ${className}`}
    >
      {/* Fallback Initials / Icon Background */}
      <div
        className={`absolute inset-0 bg-gradient-to-tr ${avatarGradient} flex items-center justify-center text-white font-semibold transition-opacity duration-200 ${
          showImage && imgLoaded ? 'opacity-0' : 'opacity-100'
        }`}
      >
        {isSavedMessages ? (
          <Bookmark className={`${iconSizeClass} fill-current`} />
        ) : isChannel ? (
          <Radio className={iconSizeClass} />
        ) : isGroup ? (
          <Users className={iconSizeClass} />
        ) : isBot ? (
          <Bot className={iconSizeClass} />
        ) : initials ? (
          <span>{initials}</span>
        ) : (
          <User className={iconSizeClass} />
        )}
      </div>

      {/* Real Telegram Photo Image */}
      {showImage && (
        <img
          src={avatarUrl}
          alt={cleanName}
          loading="lazy"
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgError(true)}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ${
            imgLoaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
    </div>
  );
};
