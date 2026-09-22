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
  name: string;
  isUser: boolean;
  isGroup: boolean;
  isChannel: boolean;
  unreadCount: number;
  pinned: boolean;
  date: number;
  lastMessage: {
    text: string;
    date: number;
    out: boolean;
    senderId: string;
  };
  entity: {
    username: string | null;
    phone: string | null;
    verified: boolean;
    scam: boolean;
  };
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
  senderId: string;
  mediaType: string | null;
  mediaInfo?: TelegramMessageMediaInfo | null;
  replyToMsgId?: number | null;
  reactions?: TelegramReaction[];
  views: number | null;
  forwards: number | null;
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
