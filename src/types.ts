export interface TelegramUser {
  id: string;
  firstName: string;
  lastName: string;
  username: string | null;
  phone: string | null;
  bot: boolean;
  verified: boolean;
  premium: boolean;
}

export interface TelegramDialog {
  id: string;
  title: string;
  name?: string;
  isUser: boolean;
  isGroup: boolean;
  isChannel: boolean;
  unreadCount: number;
  pinned?: boolean;
  muted?: boolean;
  folderId?: number;
  isArchived?: boolean;
  date: number;
  lastMessage?: {
    id?: number;
    text: string;
    date: number;
    out: boolean;
    unread?: boolean;
    senderId: string;
  } | null;
  entity?: {
    username?: string | null;
    phone?: string | null;
    verified?: boolean;
    scam?: boolean;
  } | null;
}

export interface ChatFolder {
  id: string | number;
  title: string;
  emoticon?: string;
  type: 'all' | 'personal' | 'groups' | 'channels' | 'unread' | 'custom';
  includePeerIds?: string[];
  excludePeerIds?: string[];
  contacts?: boolean;
  nonContacts?: boolean;
  groups?: boolean;
  broadcasts?: boolean;
  bots?: boolean;
  excludeMuted?: boolean;
  excludeRead?: boolean;
  excludeArchived?: boolean;
}

export interface GlobalSearchResult {
  contacts: {
    id: string;
    title: string;
    username: string | null;
    phone: string | null;
    verified: boolean;
    isUser: boolean;
    isGroup: boolean;
    isChannel: boolean;
    bot?: boolean;
  }[];
  chats: {
    id: string;
    title: string;
    username: string | null;
    verified: boolean;
    isUser: boolean;
    isGroup: boolean;
    isChannel: boolean;
    participantsCount?: number;
  }[];
  messages: (TelegramMessage & { chatId: string })[];
}

export interface CallSession {
  callId: string;
  peerId: string;
  peerTitle?: string;
  peerName?: string;
  isVideo: boolean;
  direction?: 'outgoing' | 'incoming';
  isOutgoing?: boolean;
  status: 'requesting' | 'ringing' | 'connected' | 'ended' | 'rejected' | 'busy' | 'calling';
  startTime?: number;
  isMuted?: boolean;
  isCameraOff?: boolean;
  isScreenSharing?: boolean;
  isSpeakerOn?: boolean;
  sdp?: any;
}

export interface VoiceChatParticipant {
  id: string;
  name: string;
  username?: string | null;
  isSpeaking: boolean;
  isMuted: boolean;
  isRaisedHand: boolean;
  isVideo: boolean;
  role: 'admin' | 'speaker' | 'listener';
  joinedAt: number;
}

export interface VoiceChatSpace {
  chatId: string;
  title: string;
  isChannel: boolean;
  isActive: boolean;
  participants: VoiceChatParticipant[];
  hasLiveVideo?: boolean;
}

export interface TelegramStickerSet {
  id: string;
  accessHash: string;
  title: string;
  shortName: string;
  count: number;
  archived?: boolean;
  official?: boolean;
  animated?: boolean;
  videos?: boolean;
  thumbDocumentId?: string | null;
}

export interface TelegramStickerDocument {
  id: string;
  accessHash: string;
  fileReference: string;
  mimeType: string;
  size: number;
  altEmoji: string;
  isAnimated: boolean;
  isVideo: boolean;
  format: 'webp' | 'lottie' | 'webm';
}

export interface TelegramGifItem {
  id: string;
  url: string;
  previewUrl: string;
  title: string;
  type: string;
}

export interface TelegramMessageMediaInfo {
  type: string;
  mimeType?: string;
  fileName?: string;
  size?: number;
  width?: number;
  height?: number;
  duration?: number;
  hasMedia: boolean;
  altEmoji?: string;
}

export interface TelegramReaction {
  emoticon: string;
  count: number;
  chosen?: boolean;
}

export interface TelegramMessage {
  id: number;
  text: string;
  date: number;
  out: boolean;
  unread?: boolean;
  senderId: string;
  mediaType: string | null;
  mediaInfo?: TelegramMessageMediaInfo | null;
  replyToMsgId?: number | null;
  reactions?: TelegramReaction[];
  editDate?: number | null;
  views: number | null;
  forwards: number | null;
}

export interface TypingStatus {
  chatId: string;
  userId?: string;
  fromId?: string;
  actionType: 'typing' | 'record_audio' | 'record_video' | 'upload_photo' | 'upload_document' | 'cancel';
  actionText: string;
}

export interface TelegramServerStatus {
  success: boolean;
  apiId: number;
  apiHashPrefix: string;
  officialCloud: boolean;
  mtprotoLayer: number;
  authorized: boolean;
  user: TelegramUser | null;
  connectedDc: string;
  serverTimestamp: string;
}

export type AuthMode = 'phone' | 'session' | 'bot';

export interface AuthState {
  mode: AuthMode;
  step: 'enter_phone' | 'enter_code' | 'enter_password';
  phone: string;
  phoneCodeHash: string;
  code: string;
  password: string;
  passwordHint?: string;
  sessionStringInput: string;
  botTokenInput: string;
  loading: boolean;
  error: string | null;
}
