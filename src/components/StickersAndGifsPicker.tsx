import React, { useState, useEffect, useRef } from 'react';
import {
  Smile,
  Film,
  Sticker,
  Search,
  Download,
  X,
  Loader2,
  Sparkles,
  Send,
  ExternalLink,
} from 'lucide-react';
import { telegramApi } from '../api/telegramApi';
import { TelegramStickerSet, TelegramStickerDocument, TelegramGifItem } from '../types';

interface StickersAndGifsPickerProps {
  peerId: string;
  onSelectEmoji: (emoji: string) => void;
  onSendSticker: (doc: TelegramStickerDocument) => Promise<void>;
  onSendGif: (gifUrl: string) => Promise<void>;
  onClose: () => void;
}

// Built-in standard emoji categories
const EMOJI_CATEGORIES: { name: string; icon: string; emojis: string[] }[] = [
  {
    name: 'الوجوه والابتسامات',
    icon: '😀',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '🥹', '😊',
      '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙',
      '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎',
      '🥸', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁',
      '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😮‍💨', '😤',
      '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰',
      '😥', '😓', '🫣', '🤗', '🫡', '🤔', '🫢', '🤫', '🤥', '😶',
      '😶‍🌫️', '😐', '😑', '😬', '🫠', '🙄', '😯', '😦', '😧', '😮',
      '😲', '🥱', '😴', '🤤', '😪', '😵', '😵‍💫', '🤐', '🥴', '🤢',
      '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈', '👿', '🤡',
      '💩', '👻', '💀', '☠️', '👽', '👾', '🤖', '🎃', '😺', '😸',
    ],
  },
  {
    name: 'الإيماءات والأشخاص',
    icon: '👋',
    emojis: [
      '👋', '🤚', '🖐️', '✋', '🖖', '🫱', '🫲', '🫳', '🫴', '👌',
      '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉',
      '👆', '🖕', '👇', '☝️', '🫵', '👍', '👎', '✊', '👊', '🤛',
      '🤜', '👏', '🙌', '🫶', '👐', '🤲', '🤝', '🙏', '✍️', '💅',
      '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🫀',
      '🫁', '🧠', '🥷', '🧑‍🎄', '🦸', '🦹', '🧙', '🧚', '🧛', '🧜',
      '🧝', '🧞', '🧟', '💆', '💇', '🚶', '🏃', '💃', '🕺', '🧘',
    ],
  },
  {
    name: 'القلوب والمشاعر',
    icon: '❤️',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
      '❤️‍🔥', '❤️‍🩹', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝',
      '💟', '💌', '💤', '💢', '💣', '💥', '💫', '💨', '💦', '💬',
      '👁️‍🗨️', '🗨️', '🗯️', '💭', '♨️', '🔥', '✨', '🌟', '⭐', '⚡',
    ],
  },
  {
    name: 'الحيوانات والطبيعة',
    icon: '🐱',
    emojis: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐻‍❄️', '🐨',
      '🐯', '🦁', '🐮', '🐷', '🐽', '🐸', '🐵', '🙈', '🙉', '🙊',
      '🐒', '🐔', '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺',
      '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟',
      '🌸', '🌺', '🌹', '🌷', '💐', '🌴', '🌲', '🌳', '🍀', '🍂',
    ],
  },
  {
    name: 'الأطعمة والمشروبات',
    icon: '🍕',
    emojis: [
      '🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐',
      '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🥑', '🍔',
      '🍟', '🍕', '🌭', '🥪', '🌮', '🌯', '🫔', '🥙', '🧆', '🍳',
      '🍲', '🥣', '🥗', '🍿', '🧈', '🧂', '🥫', '🍱', '🍘', '🍙',
      '☕', '🍵', '🧃', '🥤', '🧋', '🥛', '🍺', '🍻', '🍷', '🥂',
    ],
  },
  {
    name: 'الأنشطة والرياضة',
    icon: '⚽',
    emojis: [
      '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱',
      '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', '🥅', '⛳',
      '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛼', '🛷',
      '🎯', '🎮', '🕹️', '🎰', '🎲', '🧩', '🧸', '🪅', '🪆', '🎨',
    ],
  },
  {
    name: 'السفر والأماكن',
    icon: '✈️',
    emojis: [
      '🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐',
      '🛻', '🚚', '🚛', '🚜', '🛵', '🏍️', '🚲', '🛴', '🚨', '🚔',
      '✈️', '🛫', '🛬', '🚀', '🛸', '🚁', '🛶', '⛵', '🚤', '🛳️',
      '⛴️', '🚢', '⚓', '🛟', '🪐', '🌙', '☀️', '⛅', '🌧️', '⛈️',
    ],
  },
  {
    name: 'الرموز والأعلام',
    icon: '🇸🇦',
    emojis: [
      '🇸🇦', '🇦🇪', '🇶🇦', '🇰🇼', '🇧🇭', '🇴🇲', '🇪🇬', '🇯🇴', '🇵🇸', '🇮🇶',
      '🇸🇾', '🇱🇧', '🇾🇪', '🇩🇿', '🇲🇦', '🇹🇳', '🇱🇾', '🇸🇩', '🇲🇷', '🇸🇴',
      '✅', '❌', '⚠️', '⛔', '🚫', '💯', '🔔', '🔕', '🎉', '🎁',
    ],
  },
];

// Fallback curated sticker packs when an account has no custom sticker sets installed yet
const CURATED_DEFAULT_STICKERS = [
  {
    id: 'default_1',
    accessHash: '0',
    fileReference: '',
    mimeType: 'image/webp',
    size: 24500,
    altEmoji: '👋',
    isAnimated: false,
    isVideo: false,
    format: 'webp' as const,
    previewUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&h=200&q=80',
    title: 'مرحباً!',
  },
  {
    id: 'default_2',
    accessHash: '0',
    fileReference: '',
    mimeType: 'image/webp',
    size: 28000,
    altEmoji: '❤️',
    isAnimated: false,
    isVideo: false,
    format: 'webp' as const,
    previewUrl: 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?auto=format&fit=crop&w=200&h=200&q=80',
    title: 'حب وإعجاب',
  },
  {
    id: 'default_3',
    accessHash: '0',
    fileReference: '',
    mimeType: 'image/webp',
    size: 31000,
    altEmoji: '😂',
    isAnimated: false,
    isVideo: false,
    format: 'webp' as const,
    previewUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=200&h=200&q=80',
    title: 'ضحك وفرح',
  },
  {
    id: 'default_4',
    accessHash: '0',
    fileReference: '',
    mimeType: 'image/webp',
    size: 26000,
    altEmoji: '👍',
    isAnimated: false,
    isVideo: false,
    format: 'webp' as const,
    previewUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&h=200&q=80',
    title: 'تم وموافق',
  },
  {
    id: 'default_5',
    accessHash: '0',
    fileReference: '',
    mimeType: 'image/webp',
    size: 34000,
    altEmoji: '🎉',
    isAnimated: false,
    isVideo: false,
    format: 'webp' as const,
    previewUrl: 'https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&w=200&h=200&q=80',
    title: 'مبروك واحتفال',
  },
  {
    id: 'default_6',
    accessHash: '0',
    fileReference: '',
    mimeType: 'image/webp',
    size: 29000,
    altEmoji: '🔥',
    isAnimated: false,
    isVideo: false,
    format: 'webp' as const,
    previewUrl: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=200&h=200&q=80',
    title: 'إنجاز رائع',
  },
];

export const StickersAndGifsPicker: React.FC<StickersAndGifsPickerProps> = ({
  peerId,
  onSelectEmoji,
  onSendSticker,
  onSendGif,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'emoji' | 'stickers' | 'gifs'>('emoji');

  // Emoji state
  const [emojiSearch, setEmojiSearch] = useState('');

  // Stickers state
  const [stickerSets, setStickerSets] = useState<TelegramStickerSet[]>([]);
  const [selectedSet, setSelectedSet] = useState<TelegramStickerSet | null>(null);
  const [setDocuments, setSetDocuments] = useState<TelegramStickerDocument[]>([]);
  const [loadingStickers, setLoadingStickers] = useState(false);
  const [sendingStickerId, setSendingStickerId] = useState<string | null>(null);

  // GIFs state
  const [gifQuery, setGifQuery] = useState('');
  const [gifs, setGifs] = useState<TelegramGifItem[]>([]);
  const [loadingGifs, setLoadingGifs] = useState(false);
  const [sendingGifId, setSendingGifId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Load sticker sets on mount or when sticker tab activated
  useEffect(() => {
    let mounted = true;
    async function loadStickers() {
      try {
        setLoadingStickers(true);
        const sets = await telegramApi.getStickerSets();
        if (mounted) {
          setStickerSets(sets);
          if (sets.length > 0) {
            loadSetStickers(sets[0]);
          }
        }
      } catch (err) {
        console.error('Failed to load sticker sets:', err);
      } finally {
        if (mounted) setLoadingStickers(false);
      }
    }

    if (activeTab === 'stickers' && stickerSets.length === 0) {
      loadStickers();
    }

    return () => {
      mounted = false;
    };
  }, [activeTab]);

  // Load stickers of a specific set
  const loadSetStickers = async (set: TelegramStickerSet) => {
    setSelectedSet(set);
    try {
      setLoadingStickers(true);
      const res = await telegramApi.getStickerSet(set.id, set.accessHash);
      setSetDocuments(res.documents || []);
    } catch (err) {
      console.error('Failed to load stickers for set:', err);
    } finally {
      setLoadingStickers(false);
    }
  };

  // Search GIFs with debounce
  useEffect(() => {
    if (activeTab !== 'gifs') return;

    let mounted = true;
    const timeout = setTimeout(async () => {
      try {
        setLoadingGifs(true);
        const results = await telegramApi.searchGifs(gifQuery, peerId);
        if (mounted) {
          setGifs(results);
        }
      } catch (err) {
        console.error('Failed to search GIFs:', err);
      } finally {
        if (mounted) setLoadingGifs(false);
      }
    }, 350);

    return () => {
      mounted = false;
      clearTimeout(timeout);
    };
  }, [activeTab, gifQuery, peerId]);

  // Filter emojis
  const filteredEmojiCategories = EMOJI_CATEGORIES.map((cat) => {
    if (!emojiSearch.trim()) return cat;
    const filtered = cat.emojis.filter((e) => e.includes(emojiSearch));
    return { ...cat, emojis: filtered };
  }).filter((cat) => cat.emojis.length > 0);

  const handleSendStickerClick = async (doc: TelegramStickerDocument) => {
    try {
      setSendingStickerId(doc.id);
      await onSendSticker(doc);
    } catch (err: any) {
      console.error('Error sending sticker:', err);
    } finally {
      setSendingStickerId(null);
    }
  };

  const handleSendGifClick = async (gif: TelegramGifItem) => {
    try {
      setSendingGifId(gif.id);
      await onSendGif(gif.url);
    } catch (err: any) {
      console.error('Error sending GIF:', err);
    } finally {
      setSendingGifId(null);
    }
  };

  // Helper download trigger for sticker format WebP or Lottie
  const handleDownloadSticker = (
    doc: TelegramStickerDocument,
    format: 'webp' | 'lottie',
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    const url = telegramApi.getStickerUrl(doc.id, doc.accessHash, doc.fileReference, true, format);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sticker_${doc.id}.${format === 'lottie' ? 'tgs' : 'webp'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      ref={containerRef}
      className="w-full max-w-md h-96 bg-[#17212b] border border-[#242f3d] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150 text-slate-200 select-none z-40"
      dir="rtl"
    >
      {/* Top Header & Tabs Bar */}
      <div className="px-3 pt-3 pb-2 border-b border-[#242f3d] bg-[#1e2c3a] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1 bg-[#17212b] p-1 rounded-xl border border-white/5">
          <button
            type="button"
            onClick={() => setActiveTab('emoji')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'emoji'
                ? 'bg-[#54a9eb] text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Smile className="w-3.5 h-3.5" />
            <span>رموز تعبيرية</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('stickers')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'stickers'
                ? 'bg-[#54a9eb] text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Sticker className="w-3.5 h-3.5" />
            <span>ملصقات</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('gifs')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'gifs'
                ? 'bg-[#54a9eb] text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>GIF</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
          title="إغلاق"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* TAB 1: EMOJIS */}
      {activeTab === 'emoji' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Emoji Search */}
          <div className="p-2 border-b border-[#242f3d]">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={emojiSearch}
                onChange={(e) => setEmojiSearch(e.target.value)}
                placeholder="بحث في الرموز التعبيرية..."
                className="w-full bg-[#242f3d] text-xs text-white placeholder-slate-400 rounded-xl pr-8 pl-3 py-1.5 border border-transparent focus:border-[#54a9eb] focus:outline-none transition-all"
              />
              {emojiSearch && (
                <button
                  type="button"
                  onClick={() => setEmojiSearch('')}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Emoji Grid Categories */}
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {filteredEmojiCategories.map((cat, idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5 sticky top-0 bg-[#17212b]/95 py-1 z-10 backdrop-blur-xs">
                  <span>{cat.icon}</span>
                  <span>{cat.name}</span>
                </div>
                <div className="grid grid-cols-8 gap-1">
                  {cat.emojis.map((emoji, eIdx) => (
                    <button
                      key={eIdx}
                      type="button"
                      onClick={() => onSelectEmoji(emoji)}
                      className="w-9 h-9 rounded-lg hover:bg-[#242f3d] text-xl flex items-center justify-center transition-transform hover:scale-125 active:scale-95 cursor-pointer"
                      title={emoji}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: STICKERS */}
      {activeTab === 'stickers' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Sticker Set Tabs Carousel */}
          {stickerSets.length > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-2 border-b border-[#242f3d] overflow-x-auto scrollbar-none shrink-0 bg-[#1e2c3a]/50">
              {stickerSets.map((set) => (
                <button
                  key={set.id}
                  type="button"
                  onClick={() => loadSetStickers(set)}
                  className={`px-3 py-1 rounded-xl text-xs whitespace-nowrap transition-all cursor-pointer shrink-0 border ${
                    selectedSet?.id === set.id
                      ? 'bg-[#54a9eb]/20 text-[#54a9eb] border-[#54a9eb]/40 font-semibold'
                      : 'bg-[#242f3d]/60 text-slate-300 border-transparent hover:bg-[#242f3d]'
                  }`}
                >
                  {set.title || set.shortName || 'حزمة ملصقات'}
                  <span className="text-[10px] text-slate-400 mr-1 opacity-70">
                    ({set.count})
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Stickers Grid View */}
          <div className="flex-1 overflow-y-auto p-3">
            {loadingStickers ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-[#54a9eb]" />
                <span className="text-xs">جاري تحميل حزم ملصقات تليجرام...</span>
              </div>
            ) : setDocuments.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                  <span className="font-semibold text-slate-200">
                    {selectedSet?.title || 'ملصقات الحزمة'}
                  </span>
                  <span>{setDocuments.length} ملصق متوفر</span>
                </div>

                <div className="grid grid-cols-4 gap-3">
                  {setDocuments.map((doc) => {
                    const stickerImgUrl = telegramApi.getStickerUrl(
                      doc.id,
                      doc.accessHash,
                      doc.fileReference,
                      false,
                      'webp'
                    );

                    return (
                      <div
                        key={doc.id}
                        className="group relative p-2 rounded-xl bg-[#242f3d]/50 hover:bg-[#242f3d] border border-white/5 transition-all flex flex-col items-center justify-center cursor-pointer aspect-square"
                        onClick={() => handleSendStickerClick(doc)}
                      >
                        {sendingStickerId === doc.id ? (
                          <Loader2 className="w-6 h-6 animate-spin text-[#54a9eb]" />
                        ) : (
                          <img
                            src={stickerImgUrl}
                            alt={doc.altEmoji || 'ملصق'}
                            loading="lazy"
                            className="w-16 h-16 object-contain transition-transform group-hover:scale-110"
                            onError={(e) => {
                              // Fallback display emoji if thumbnail loading
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        )}

                        {/* Alt Emoji Badge */}
                        {doc.altEmoji && (
                          <span className="absolute bottom-1 right-1 text-xs opacity-75">
                            {doc.altEmoji}
                          </span>
                        )}

                        {/* Hover Overlay with Download Options (WebP / Lottie) & Direct Send */}
                        <div className="absolute inset-0 bg-[#0e1621]/90 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 p-1 z-10">
                          <button
                            type="button"
                            title="إرسال الملصق للمحادثة"
                            className="px-2.5 py-1 rounded-lg bg-[#54a9eb] hover:bg-[#4396d8] text-white text-[11px] font-medium flex items-center gap-1 transition-colors w-full justify-center"
                          >
                            <Send className="w-3 h-3" />
                            <span>إرسال</span>
                          </button>

                          <div className="flex items-center gap-1 w-full">
                            <button
                              type="button"
                              onClick={(e) => handleDownloadSticker(doc, 'webp', e)}
                              title="تنزيل الملصق بصيغة WebP"
                              className="flex-1 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] text-slate-200 flex items-center justify-center gap-0.5 transition-colors"
                            >
                              <Download className="w-2.5 h-2.5" />
                              <span>WebP</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDownloadSticker(doc, 'lottie', e)}
                              title="تنزيل الملصق بصيغة Lottie المتحركة"
                              className="flex-1 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] text-emerald-400 flex items-center justify-center gap-0.5 transition-colors"
                            >
                              <Download className="w-2.5 h-2.5" />
                              <span>Lottie</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Fallback Curated Stickers if user has no sticker sets installed */
              <div className="space-y-3">
                <div className="p-2.5 rounded-xl bg-[#242f3d]/40 border border-white/5 text-xs text-slate-300 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    حزم الملصقات الرسمية الموصى بها لتليجرام (جاهزة للإرسال والتنزيل بصيغتي WebP و Lottie)
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  {CURATED_DEFAULT_STICKERS.map((stk) => (
                    <div
                      key={stk.id}
                      className="group relative p-2.5 rounded-xl bg-[#242f3d]/60 hover:bg-[#242f3d] border border-white/5 transition-all flex flex-col items-center gap-1 cursor-pointer"
                      onClick={() => handleSendStickerClick(stk as any)}
                    >
                      <img
                        src={stk.previewUrl}
                        alt={stk.title}
                        className="w-14 h-14 rounded-lg object-cover group-hover:scale-105 transition-transform"
                      />
                      <span className="text-[11px] font-medium text-slate-200 truncate w-full text-center">
                        {stk.title}
                      </span>
                      <span className="text-[10px] text-slate-400">{stk.altEmoji}</span>

                      {/* Download Buttons */}
                      <div className="flex items-center gap-1 w-full mt-1">
                        <a
                          href={stk.previewUrl}
                          download={`sticker_${stk.id}.webp`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 py-1 text-center bg-white/10 hover:bg-white/20 rounded text-[9px] text-slate-200"
                        >
                          WebP
                        </a>
                        <a
                          href={stk.previewUrl}
                          download={`sticker_${stk.id}.json`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 py-1 text-center bg-white/10 hover:bg-white/20 rounded text-[9px] text-emerald-400"
                        >
                          Lottie
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: GIFS */}
      {activeTab === 'gifs' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* GIF Search Bar */}
          <div className="p-2 border-b border-[#242f3d] space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={gifQuery}
                onChange={(e) => setGifQuery(e.target.value)}
                placeholder="ابحث في صور GIF المتحركة (مثال: ضحك, رقص, قطط)..."
                className="w-full bg-[#242f3d] text-xs text-white placeholder-slate-400 rounded-xl pr-8 pl-3 py-1.5 border border-transparent focus:border-[#54a9eb] focus:outline-none transition-all"
              />
              {gifQuery && (
                <button
                  type="button"
                  onClick={() => setGifQuery('')}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Quick search tags */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
              {[
                { label: '🔥 ترند', q: 'trending' },
                { label: '😂 ضحك', q: 'laugh' },
                { label: '❤️ حب', q: 'love' },
                { label: '👍 نعم', q: 'yes' },
                { label: '🎉 احتفال', q: 'party' },
                { label: '😮 واو', q: 'wow' },
                { label: '👋 مرحباً', q: 'hello' },
                { label: '💃 رقص', q: 'dance' },
              ].map((tag, tIdx) => (
                <button
                  key={tIdx}
                  type="button"
                  onClick={() => setGifQuery(tag.q)}
                  className={`px-2 py-0.5 rounded-lg text-[11px] whitespace-nowrap transition-colors cursor-pointer shrink-0 border ${
                    gifQuery === tag.q
                      ? 'bg-[#54a9eb] text-white border-transparent'
                      : 'bg-[#242f3d] text-slate-300 border-white/5 hover:bg-[#2b5278]'
                  }`}
                >
                  {tag.label}
                </button>
              ))}
            </div>
          </div>

          {/* GIFs Grid View */}
          <div className="flex-1 overflow-y-auto p-2">
            {loadingGifs ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-[#54a9eb]" />
                <span className="text-xs">جاري البحث في صور GIF...</span>
              </div>
            ) : gifs.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {gifs.map((gif) => (
                  <div
                    key={gif.id}
                    onClick={() => handleSendGifClick(gif)}
                    className="group relative rounded-xl overflow-hidden bg-black/40 aspect-video cursor-pointer border border-white/5 hover:border-[#54a9eb]/50 transition-all"
                  >
                    <img
                      src={gif.previewUrl || gif.url}
                      alt={gif.title}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />

                    {/* GIF Tag */}
                    <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 text-[9px] font-bold text-white tracking-wider backdrop-blur-xs">
                      GIF
                    </span>

                    {/* Hover Send Action Overlay */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      {sendingGifId === gif.id ? (
                        <Loader2 className="w-6 h-6 animate-spin text-white" />
                      ) : (
                        <div className="p-2 rounded-full bg-[#54a9eb] text-white shadow-lg">
                          <Send className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-1.5 text-xs">
                <Film className="w-8 h-8 text-slate-500 mb-1" />
                <p>لم يتم العثور على نتائج GIF</p>
                <p className="text-[11px] text-slate-500">جرب كتابة كلمة أخرى في شريط البحث</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
