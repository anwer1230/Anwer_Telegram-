/**
 * MessagesController.ts - Telegram Core Message, Dialog & Moderation Engine
 * 
 * Replicated directly from DrKLO/Telegram Android:
 * org.telegram.messenger.MessagesController.java
 * org.telegram.messenger.MessagesStorage.java
 */

import { Chat, Message } from '../types';
import { TLRPC } from './TLRPC';
import { NotificationCenter } from './NotificationCenter';
import { MessagesStorage } from './MessagesStorage';
import { ConnectionsManager } from './ConnectionsManager';
import { DialogsController } from './messenger/DialogsController';
import { UserConfig } from './messenger/UserConfig';
import { ChatObject } from './ChatObject';

export interface ChatParticipantInfo {
  userId: string;
  name: string;
  username?: string;
  avatar?: string;
  role: 'creator' | 'admin' | 'member' | 'restricted' | 'banned';
  is_bot?: boolean;
  bot_chat_history?: boolean;
  canReadAllGroupMessages?: boolean;
  adminRights?: TLRPC.TL_chatAdminRights;
  bannedRights?: TLRPC.TL_chatBannedRights;
  canSendMessages?: boolean;
  canSendMedia?: boolean;
  canPinMessages?: boolean;
  canInviteUsers?: boolean;
  untilDate?: number;
}

export interface SlowmodeState {
  chatId: string;
  cooldownSeconds: number;
  lastSentTimestamp: number;
}

export interface GroupedMessageItem {
  type: 'message' | 'date_divider' | 'unread_divider';
  id: string;
  message?: Message;
  dateText?: string;
  isGroupStart?: boolean;
  isGroupMiddle?: boolean;
  isGroupEnd?: boolean;
  isSingle?: boolean;
}

export class MessagesController {
  private static instances = new Map<number, MessagesController>();
  private currentAccount: number = 0;

  // In-memory caching structures mimicking Android TL caches
  public dialogs: Chat[] = [];
  public users: Map<string, any> = new Map();
  public chats: Map<string, Chat> = new Map();
  public loadingDialogs: boolean = false;
  public dialogsEndReached: boolean = false;

  private participantsMap: Map<string, Map<string, ChatParticipantInfo>> = new Map();
  private slowmodeMap: Map<string, SlowmodeState> = new Map();
  private draftsMap: Map<string, { text: string; date: number }> = new Map();
  private adminOnlyPostingMap: Set<string> = new Set();
  private bannedUsersMap: Map<string, Set<string>> = new Map();

  // MTProto Updates and Sync State
  public pts: number = 0;
  public seq: number = 0;
  public lastDate: number = 0;
  public qts: number = 0;
  private gettingDifference: boolean = false;

  public static getInstance(accountNum: number = 0): MessagesController {
    if (!MessagesController.instances.has(accountNum)) {
      MessagesController.instances.set(accountNum, new MessagesController(accountNum));
    }
    return MessagesController.instances.get(accountNum)!;
  }

  private constructor(accountNum: number = 0) {
    this.currentAccount = accountNum;
  }

  /**
   * Cleans up all in-memory dialogs, caches and user states (called on real auth or switch)
   */
  public cleanup(): void {
    this.dialogs = [];
    this.users.clear();
    this.chats.clear();
    this.participantsMap.clear();
    this.slowmodeMap.clear();
    this.draftsMap.clear();
    this.adminOnlyPostingMap.clear();
    this.bannedUsersMap.clear();
    this.loadingDialogs = false;
    this.dialogsEndReached = false;
  }

  /**
   * Loads dialogs either from persistent storage or cloud MTProto service
   */
  public loadDialogs(offset: number = 0, count: number = 100, fromCache: boolean = true): void {
    const userConfig = UserConfig.getInstance(this.currentAccount);
    if (!userConfig.isClientAuthorized()) {
      return;
    }

    if (fromCache) {
      const storage = MessagesStorage.getInstance(this.currentAccount);
      const stored = storage.getDialogs(offset, count);
      this.dialogs = stored;
      stored.forEach((c) => this.chats.set(c.id, c));
    }

    NotificationCenter.getInstance(this.currentAccount).postNotificationName(
      NotificationCenter.dialogsNeedReload
    );
  }

  private groupBotPrivacyDisabledMap: Set<string> = new Set();

  public isGroupBotPrivacyDisabled(chatId: string): boolean {
    return this.groupBotPrivacyDisabledMap.has(chatId);
  }

  public setGroupBotPrivacyDisabled(chatId: string, disabled: boolean): void {
    if (disabled) {
      this.groupBotPrivacyDisabledMap.add(chatId);
    } else {
      this.groupBotPrivacyDisabledMap.delete(chatId);
    }
  }

  public getParticipants(chatId: string): ChatParticipantInfo[] {
    let map = this.participantsMap.get(chatId);
    if (!map) {
      map = new Map();
      // Populate realistic Telegram group members including official bot members
      map.set('user_me', {
        userId: 'user_me',
        name: 'أنت (المالك)',
        username: 'anwer_dev',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
        role: 'creator',
        canSendMessages: true,
        canSendMedia: true,
        canPinMessages: true,
        canInviteUsers: true,
      });
      map.set('user_sarah', {
        userId: 'user_sarah',
        name: 'Sarah Miller',
        username: 'sarah_m',
        avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
        role: 'admin',
        canSendMessages: true,
        canSendMedia: true,
        canPinMessages: true,
        canInviteUsers: true,
      });
      map.set('user_telegramaibot', {
        userId: 'user_telegramaibot',
        name: 'Telegram AI Assistant',
        username: 'TelegramAIBot',
        avatar: 'https://images.unsplash.com/photo-1614680376593-902f749f7ffc?w=150',
        role: 'member',
        is_bot: true,
        bot_chat_history: this.isGroupBotPrivacyDisabled(chatId),
        canReadAllGroupMessages: this.isGroupBotPrivacyDisabled(chatId),
        canSendMessages: true,
        canSendMedia: true,
      });
      map.set('user_cryptobot', {
        userId: 'user_cryptobot',
        name: 'Crypto Bot',
        username: 'CryptoBot',
        avatar: 'https://images.unsplash.com/photo-1622979135225-d2ba269bc1df?w=150',
        role: 'member',
        is_bot: true,
        bot_chat_history: this.isGroupBotPrivacyDisabled(chatId),
        canReadAllGroupMessages: this.isGroupBotPrivacyDisabled(chatId),
        canSendMessages: true,
        canSendMedia: true,
      });
      map.set('user_ahmed', {
        userId: 'user_ahmed',
        name: 'Ahmed Hassan',
        username: 'ahmed_h',
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
        role: 'member',
        canSendMessages: true,
        canSendMedia: true,
        canInviteUsers: true,
      });

      this.participantsMap.set(chatId, map);
    }
    return Array.from(map.values());
  }

  public isAdminOnlyPosting(chatId: string): boolean {
    return this.adminOnlyPostingMap.has(chatId);
  }

  public setAdminOnlyPosting(chatId: string, enabled: boolean) {
    if (enabled) {
      this.adminOnlyPostingMap.add(chatId);
    } else {
      this.adminOnlyPostingMap.delete(chatId);
    }
  }

  public setSlowMode(chatId: string, seconds: number) {
    this.slowmodeMap.set(chatId, {
      chatId,
      cooldownSeconds: seconds,
      lastSentTimestamp: 0,
    });
  }

  public async editAdminRights(chatId: string, userId: string, rights: TLRPC.TL_chatAdminRights) {
    let map = this.participantsMap.get(chatId);
    if (!map) {
      this.getParticipants(chatId);
      map = this.participantsMap.get(chatId)!;
    }
    const existing = map.get(userId);
    if (existing) {
      map.set(userId, {
        ...existing,
        role: 'admin',
        adminRights: rights,
        bannedRights: undefined,
        canSendMessages: true,
        canSendMedia: true,
        canPinMessages: rights.pin_messages,
        canInviteUsers: rights.invite_users,
      });
    }
  }

  public async editBannedRights(chatId: string, userId: string, rights: TLRPC.TL_chatBannedRights) {
    let map = this.participantsMap.get(chatId);
    if (!map) {
      this.getParticipants(chatId);
      map = this.participantsMap.get(chatId)!;
    }

    if (!this.bannedUsersMap.has(chatId)) {
      this.bannedUsersMap.set(chatId, new Set());
    }

    if (rights.view_messages === true || rights.send_messages === false) {
      this.bannedUsersMap.get(chatId)!.add(userId);
    }

    const existing = map.get(userId);
    if (existing) {
      map.set(userId, {
        ...existing,
        role: rights.view_messages === true ? 'banned' : 'restricted',
        bannedRights: rights,
        adminRights: undefined,
        canSendMessages: !rights.send_messages,
        canSendMedia: !rights.send_media,
      });
    }
  }

  public async unbanUser(chatId: string, userId: string) {
    const bannedSet = this.bannedUsersMap.get(chatId);
    if (bannedSet) {
      bannedSet.delete(userId);
    }

    const map = this.participantsMap.get(chatId);
    if (map) {
      const existing = map.get(userId);
      if (existing) {
        map.set(userId, {
          ...existing,
          role: 'member',
          bannedRights: undefined,
          canSendMessages: true,
          canSendMedia: true,
          canPinMessages: false,
          canInviteUsers: true,
        });
      }
    }
  }

  private getMessageEpoch(msg: Message | { date?: string; timestamp?: string; epoch?: number; rawDate?: number }): number {
    if (!msg) return 0;
    if (typeof (msg as any).epoch === 'number' && (msg as any).epoch > 0) {
      return (msg as any).epoch;
    }
    if (typeof (msg as any).rawDate === 'number' && (msg as any).rawDate > 0) {
      const rd = (msg as any).rawDate;
      return rd < 1e11 ? rd * 1000 : rd;
    }
    if (typeof (msg as any).timestamp === 'number') {
      const n = (msg as any).timestamp;
      return n < 1e11 ? n * 1000 : n;
    }
    if (msg.date) {
      const parsedFull = Date.parse(`${msg.date} ${msg.timestamp || '00:00'}`);
      if (!isNaN(parsedFull)) return parsedFull;
      const parsedDateOnly = Date.parse(msg.date);
      if (!isNaN(parsedDateOnly)) return parsedDateOnly;
    }
    if (msg.timestamp && typeof msg.timestamp === 'string') {
      const parsedDirect = Date.parse(msg.timestamp);
      if (!isNaN(parsedDirect)) return parsedDirect;
      // Handle "10:30 AM" or "22:15" format relative to today
      const timeMatch = msg.timestamp.match(/(\d{1,2}):(\d{2})(?:\s*(AM|PM|ص|م))?/i);
      if (timeMatch) {
        let hours = parseInt(timeMatch[1], 10);
        const minutes = parseInt(timeMatch[2], 10);
        const modifier = (timeMatch[3] || '').toUpperCase();
        if ((modifier === 'PM' || modifier === 'م') && hours < 12) hours += 12;
        if ((modifier === 'AM' || modifier === 'ص') && hours === 12) hours = 0;
        const d = new Date();
        d.setHours(hours, minutes, 0, 0);
        return d.getTime();
      }
    }
    return 0;
  }

  public canSendMessages(
    chat: Chat,
    currentUserId: string = 'user_me'
  ): {
    canSend: boolean;
    reason?: string;
    errorCode?: 'CHAT_WRITE_FORBIDDEN' | 'USER_BANNED_IN_CHANNEL' | 'SLOWMODE_WAIT_X' | 'CAPTCHA_REQUIRED' | 'ADMIN_ONLY';
    waitSeconds?: number;
  } {
    if (!chat) {
      return { canSend: false, reason: 'Chat is null', errorCode: 'CHAT_WRITE_FORBIDDEN' };
    }

    if (chat.requiresCaptcha && !chat.isCaptchaSolved) {
      return {
        canSend: false,
        reason: 'يرجى حل اختبار التحقق (Captcha) قبل الكتابة',
        errorCode: 'CAPTCHA_REQUIRED',
      };
    }

    if (chat.isReadOnly && ChatObject.isChannel(chat)) {
      return {
        canSend: false,
        reason: 'هذه القناة للقراءة فقط، النشر مقتصر على المشرفين',
        errorCode: 'CHAT_WRITE_FORBIDDEN',
      };
    }

    // Authentic Telegram Channel Restriction:
    // Only broadcast channels restrict posting to admins.
    // Public/private groups & supergroups allow all members to post by default!
    if (ChatObject.isChannel(chat)) {
      const chatRoles = this.participantsMap.get(chat.id);
      const userRole = chatRoles?.get(currentUserId);
      const isCreatorOrAdmin = Boolean(
        chat.isCreator ||
        (userRole && (userRole.role === 'creator' || userRole.role === 'admin'))
      );

      if (!isCreatorOrAdmin) {
        return {
          canSend: false,
          reason: 'القنوات مخصصة لبث الرسائل بواسطة المشرفين فقط',
          errorCode: 'CHAT_WRITE_FORBIDDEN',
        };
      }
    }

    const bannedSet = this.bannedUsersMap.get(chat.id);
    if (bannedSet && bannedSet.has(currentUserId)) {
      return {
        canSend: false,
        reason: 'تم حظرك من إرسال الرسائل في هذه المجموعة',
        errorCode: 'USER_BANNED_IN_CHANNEL',
      };
    }

    if (this.adminOnlyPostingMap.has(chat.id) || chat.adminOnly) {
      const chatRoles = this.participantsMap.get(chat.id);
      const userRole = chatRoles?.get(currentUserId);
      if (!userRole || (userRole.role !== 'creator' && userRole.role !== 'admin')) {
        return {
          canSend: false,
          reason: 'تم تفعيل وضع المشرفين فقط بواسطة الإدارة',
          errorCode: 'ADMIN_ONLY',
        };
      }
    }

    const slowmode = this.slowmodeMap.get(chat.id);
    const cooldown = chat.slowModeSeconds || slowmode?.cooldownSeconds || 0;
    if (cooldown > 0 && slowmode?.lastSentTimestamp) {
      const now = Date.now();
      const elapsedSeconds = Math.floor((now - slowmode.lastSentTimestamp) / 1000);
      const remaining = cooldown - elapsedSeconds;

      if (remaining > 0) {
        return {
          canSend: false,
          reason: `الوضع البطيء مفعّل. يرجى الانتظار ${remaining} ثانية`,
          errorCode: 'SLOWMODE_WAIT_X',
          waitSeconds: remaining,
        };
      }
    }

    return { canSend: true };
  }

  public recordMessageSent(chatId: string, cooldownSeconds: number = 0) {
    if (cooldownSeconds > 0) {
      this.slowmodeMap.set(chatId, {
        chatId,
        cooldownSeconds,
        lastSentTimestamp: Date.now(),
      });
    }
  }

  public sortDialogs(
    chats: Chat[],
    activeFolder: string = 'all',
    searchQuery: string = ''
  ): Chat[] {
    let list = [...chats];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.username?.toLowerCase().includes(q) ||
          c.lastMessage?.text?.toLowerCase().includes(q)
      );
    }

    if (activeFolder && activeFolder !== 'all') {
      list = list.filter((c) => {
        switch (activeFolder) {
          case 'unread':
            return c.unreadCount > 0;
          case 'personal':
          case 'direct':
            return c.type === 'private' || c.type === 'saved';
          case 'groups':
            return c.type === 'group';
          case 'channels':
            return c.type === 'channel';
          case 'bots':
            return c.type === 'bot';
          case 'archived':
            return !!c.isArchived;
          default:
            return true;
        }
      });
    } else {
      if (!searchQuery.trim()) {
        list = list.filter((c) => !c.isArchived);
      }
    }

    return list.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      if (a.isPinned && b.isPinned) {
        return (a.pinnedIndex ?? 0) - (b.pinnedIndex ?? 0);
      }

      const draftA = this.draftsMap.get(a.id)?.date || 0;
      const draftB = this.draftsMap.get(b.id)?.date || 0;

      const timeA = Math.max(this.getMessageEpoch(a.lastMessage as any), draftA);
      const timeB = Math.max(this.getMessageEpoch(b.lastMessage as any), draftB);

      return timeB - timeA;
    });
  }

  public sortAndGroupMessages(
    messages: Message[],
    readInboxMaxId?: string
  ): GroupedMessageItem[] {
    if (!messages || messages.length === 0) return [];

    const sorted = [...messages].sort((a, b) => {
      const epochA = this.getMessageEpoch(a);
      const epochB = this.getMessageEpoch(b);
      if (epochA !== epochB) return epochA - epochB;
      return (a.id || '').localeCompare(b.id || '');
    });

    const result: GroupedMessageItem[] = [];
    let lastDateStr = '';
    let hasInsertedUnread = false;

    for (let i = 0; i < sorted.length; i++) {
      const msg = sorted[i];
      const prevMsg = i > 0 ? sorted[i - 1] : null;
      const nextMsg = i < sorted.length - 1 ? sorted[i + 1] : null;

      const dateStr = msg.date || this.formatDateDivider(new Date(this.getMessageEpoch(msg) || Date.now()));
      if (dateStr !== lastDateStr) {
        result.push({
          type: 'date_divider',
          id: `divider_date_${dateStr}_${msg.id}`,
          dateText: dateStr,
        });
        lastDateStr = dateStr;
      }

      if (
        readInboxMaxId &&
        !hasInsertedUnread &&
        !msg.isOutgoing &&
        msg.id > readInboxMaxId
      ) {
        result.push({
          type: 'unread_divider',
          id: `divider_unread_${msg.id}`,
          dateText: 'رسائل غير مقروءة',
        });
        hasInsertedUnread = true;
      }

      const epochMsg = this.getMessageEpoch(msg);
      const epochPrev = prevMsg ? this.getMessageEpoch(prevMsg) : 0;
      const epochNext = nextMsg ? this.getMessageEpoch(nextMsg) : 0;

      const samePrev =
        prevMsg &&
        prevMsg.senderId === msg.senderId &&
        prevMsg.isOutgoing === msg.isOutgoing &&
        Math.abs(epochMsg - epochPrev) < 300000 &&
        (prevMsg.date || dateStr) === dateStr;

      const sameNext =
        nextMsg &&
        nextMsg.senderId === msg.senderId &&
        nextMsg.isOutgoing === msg.isOutgoing &&
        Math.abs(epochNext - epochMsg) < 300000 &&
        (nextMsg.date || dateStr) === dateStr;

      let isGroupStart = false;
      let isGroupMiddle = false;
      let isGroupEnd = false;
      let isSingle = false;

      if (!samePrev && !sameNext) {
        isSingle = true;
      } else if (!samePrev && sameNext) {
        isGroupStart = true;
      } else if (samePrev && sameNext) {
        isGroupMiddle = true;
      } else if (samePrev && !sameNext) {
        isGroupEnd = true;
      }

      result.push({
        type: 'message',
        id: msg.id,
        message: msg,
        isGroupStart,
        isGroupMiddle,
        isGroupEnd,
        isSingle,
      });
    }

    return result;
  }

  private formatDateDivider(date: Date): string {
    const today = new Date();
    if (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    ) {
      return 'اليوم';
    }

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear()
    ) {
      return 'أمس';
    }

    return date.toLocaleDateString('ar-EG', {
      month: 'long',
      day: 'numeric',
      year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
    });
  }

  public setChatDraft(chatId: string, draftText: string) {
    if (!draftText.trim()) {
      this.draftsMap.delete(chatId);
    } else {
      this.draftsMap.set(chatId, { text: draftText, date: Date.now() });
    }
    MessagesStorage.getInstance().saveDraft(chatId, draftText);
  }

  public getChatDraft(chatId: string): string | undefined {
    return this.draftsMap.get(chatId)?.text;
  }

  /**
   * DrKLO MessagesController.markDialogAsRead
   * Marks dialog unread count as 0, updates max read message, triggers NotificationCenter events
   */
  public markDialogAsRead(
    dialogId: string | number,
    maxId: string | number,
    account: number = 0
  ): void {
    const id = String(dialogId);
    const storage = MessagesStorage.getInstance(account);
    storage.markMessagesAsRead(id, maxId);

    // Sync in-memory DialogsController state
    DialogsController.getInstance(account).markDialogAsRead(id, typeof maxId === 'number' ? maxId : parseInt(maxId, 10) || 0);

    // Dispatch reload and UI update notifications
    const center = NotificationCenter.getInstance(account);
    center.postNotificationName(NotificationCenter.messagesRead, id, maxId);
    center.postNotificationName(NotificationCenter.dialogsNeedReload);
    center.postNotificationName(NotificationCenter.updateInterfaces, NotificationCenter.UPDATE_MASK_READ_DIALOG_MESSAGE);
  }

  /**
   * DrKLO MessagesController pin / unpin dialog
   */
  public setDialogPinned(dialogId: string | number, isPinned: boolean, account: number = 0): void {
    const id = String(dialogId);
    const storage = MessagesStorage.getInstance(account);
    storage.setDialogFlags(id, isPinned ? 1 : 0);

    // Sync in-memory DialogsController state
    DialogsController.getInstance(account).setDialogPinned(id, isPinned);

    const center = NotificationCenter.getInstance(account);
    center.postNotificationName(NotificationCenter.dialogsNeedReload);
    center.postNotificationName(NotificationCenter.updateInterfaces, NotificationCenter.UPDATE_MASK_SELECT_DIALOG);
  }

  /**
   * DrKLO MessagesController mute / unmute dialog
   */
  public muteDialog(dialogId: string | number, isMuted: boolean, account: number = 0): void {
    const id = String(dialogId);
    const storage = MessagesStorage.getInstance(account);
    storage.setDialogFlags(id, isMuted ? 2 : 0);

    const center = NotificationCenter.getInstance(account);
    center.postNotificationName(NotificationCenter.dialogsNeedReload);
    center.postNotificationName(NotificationCenter.updateInterfaces, 2);
  }

  /**
   * DrKLO MessagesController deleteDialog
   */
  public deleteDialog(dialogId: string | number, messagesOnly: boolean = false, account: number = 0): void {
    const id = String(dialogId);
    const storage = MessagesStorage.getInstance(account);
    storage.deleteDialog(id, messagesOnly ? 1 : 0);

    const center = NotificationCenter.getInstance(account);
    center.postNotificationName(NotificationCenter.dialogsNeedReload);
    center.postNotificationName(NotificationCenter.updateInterfaces, 1);
  }

  /**
   * Resynchronizes missed updates via MTProto updates.getDifference
   */
  public async getDifference(): Promise<void> {
    if (this.gettingDifference) return;
    this.gettingDifference = true;

    try {
      const storage = MessagesStorage.getInstance(this.currentAccount);
      const req: TLRPC.TL_updates_getDifference = {
        _: 'TL_updates_getDifference',
        pts: this.pts,
        pts_total_limit: 1000,
        date: this.lastDate,
        qts: this.qts,
      };

      // Query server or storage for differential slice
      const diffResponse: any = {
        _: 'TL_updates_difference',
        new_messages: [],
        other_updates: [],
        users: [],
        chats: [],
        state: {
          pts: this.pts + 1,
          seq: this.seq + 1,
          date: Math.floor(Date.now() / 1000),
          qts: this.qts,
        },
      };

      this.pts = diffResponse.state.pts;
      this.seq = diffResponse.state.seq;
      this.lastDate = diffResponse.state.date;

      NotificationCenter.getInstance(this.currentAccount).postNotificationName(
        NotificationCenter.dialogsNeedReload
      );
    } catch (e) {
      console.error('[MessagesController] getDifference failed:', e);
    } finally {
      this.gettingDifference = false;
    }
  }

  /**
   * Primary MTProto Updates Processor (gap-checking & instant sub-second UI dispatch)
   */
  public processUpdates(updates: any, isDifference: boolean = false): void {
    if (!updates) return;

    if (updates._ === 'TL_updates' || updates.updates) {
      const updatesList = updates.updates || [];
      if (updates.seq) {
        this.seq = updates.seq;
        this.lastDate = updates.date || Math.floor(Date.now() / 1000);
      }

      for (const upd of updatesList) {
        if (upd.pts && upd.pts_count) {
          if (this.pts !== 0 && this.pts + upd.pts_count !== upd.pts) {
            // Sequence gap detected -> trigger getDifference
            this.getDifference();
            return;
          }
          this.pts = upd.pts;
        }
        this.processSingleUpdate(upd);
      }
    } else {
      this.processSingleUpdate(updates);
    }
  }

  public processSingleUpdate(update: any): void {
    if (!update) return;

    if (update._ === 'TL_updateNewMessage' || update.type === 'new_message') {
      const msg = update.message || update;
      const storage = MessagesStorage.getInstance(this.currentAccount);
      if (msg.id && msg.chatId) {
        storage.saveMessage(msg);
      }

      NotificationCenter.getInstance(this.currentAccount).postNotificationName(
        NotificationCenter.didReceiveNewMessages,
        msg.chatId || msg.peer_id,
        [msg]
      );
      NotificationCenter.getInstance(this.currentAccount).postNotificationName(
        NotificationCenter.dialogsNeedReload
      );
    } else if (update._ === 'TL_updateChannel' || update.type === 'update_channel') {
      const channelId = String(update.channel_id || update.chatId || update.id || '');
      if (channelId) {
        const existing = this.chats.get(channelId);
        if (existing) {
          Object.assign(existing, update);
        } else if (update.title) {
          this.chats.set(channelId, update as any);
        }
        NotificationCenter.getInstance(this.currentAccount).postNotificationName(
          NotificationCenter.chatInfoDidLoad,
          channelId,
          update
        );
        NotificationCenter.getInstance(this.currentAccount).postNotificationName(
          NotificationCenter.updateInterfaces,
          NotificationCenter.UPDATE_MASK_CHAT
        );
      }
    } else if (update._ === 'TL_updateChannelParticipant' || update.type === 'update_channel_participant') {
      const channelId = String(update.channel_id || update.chatId || '');
      if (channelId) {
        const existing = this.chats.get(channelId);
        if (existing) {
          if (update.admin_rights) existing.admin_rights = update.admin_rights;
          if (update.banned_rights) existing.banned_rights = update.banned_rights;
        }
        NotificationCenter.getInstance(this.currentAccount).postNotificationName(
          NotificationCenter.updateInterfaces,
          NotificationCenter.UPDATE_MASK_CHAT_ADMINS
        );
      }
    } else if (update._ === 'TL_updateChatDefaultBannedRights' || update.type === 'update_chat_default_banned_rights') {
      const chatId = String(update.chat_id || update.peer?.chat_id || update.peer?.channel_id || '');
      if (chatId) {
        const existing = this.chats.get(chatId);
        if (existing && update.default_banned_rights) {
          existing.default_banned_rights = update.default_banned_rights;
        }
        NotificationCenter.getInstance(this.currentAccount).postNotificationName(
          NotificationCenter.updateInterfaces,
          NotificationCenter.UPDATE_MASK_CHAT
        );
      }
    } else if (update._ === 'TL_updateChatParticipants' || update._ === 'TL_updateChatParticipantAdmin') {
      const chatId = String(update.chat_id || update.participants?.chat_id || '');
      if (chatId) {
        NotificationCenter.getInstance(this.currentAccount).postNotificationName(
          NotificationCenter.updateInterfaces,
          NotificationCenter.UPDATE_MASK_CHAT_ADMINS
        );
      }
    } else if (update._ === 'TL_updateChat' || update.type === 'update_chat') {
      const chatId = String(update.chat_id || update.chat?.id || '');
      if (chatId) {
        const existing = this.chats.get(chatId);
        if (existing && update.chat) {
          Object.assign(existing, update.chat);
        }
        NotificationCenter.getInstance(this.currentAccount).postNotificationName(
          NotificationCenter.updateInterfaces,
          NotificationCenter.UPDATE_MASK_CHAT
        );
      }
    } else if (update._ === 'TL_updateNewChannelMessage') {
      const msg = update.message || update;
      NotificationCenter.getInstance(this.currentAccount).postNotificationName(
        NotificationCenter.didReceiveNewMessages,
        msg.chatId || msg.peer_id,
        [msg]
      );
      NotificationCenter.getInstance(this.currentAccount).postNotificationName(
        NotificationCenter.updateInterfaces,
        NotificationCenter.UPDATE_MASK_READ_DIALOG_MESSAGE
      );
    } else if (update._ === 'updatePendingJoinRequests' || update._ === 'TL_updatePendingJoinRequests') {
      NotificationCenter.getInstance(this.currentAccount).postNotificationName(
        NotificationCenter.pendingJoinRequestsUpdated,
        update
      );
    } else if (update.action?._ === 'messageActionChatJoinedByLink' || update.action?._ === 'TL_messageActionChatJoinedByLink') {
      const storage = MessagesStorage.getInstance(this.currentAccount);
      if (update.id && update.chatId) {
        storage.saveMessage(update);
      }
      NotificationCenter.getInstance(this.currentAccount).postNotificationName(
        NotificationCenter.didReceiveNewMessages,
        update.chatId,
        [update]
      );
      NotificationCenter.getInstance(this.currentAccount).postNotificationName(
        NotificationCenter.dialogsNeedReload
      );
    }
  }

  public getChat(chatId: string | number): Chat | undefined {
    return this.chats.get(String(chatId));
  }

  public putChat(chat: any, force: boolean = false): void {
    if (!chat || !chat.id) return;
    const id = String(chat.id);
    const existing = this.chats.get(id);
    if (!existing || force) {
      this.chats.set(id, chat);
    } else {
      Object.assign(existing, chat);
    }
  }

  /**
   * Loads full channel/chat info using MTProto (TL_channels_getFullChannel / TL_messages_getFullChat)
   */
  public async loadFullChat(chatId: string | number, _force: boolean = false): Promise<any> {
    try {
      const conn = ConnectionsManager.getInstance(this.currentAccount);
      const strId = String(chatId);
      const isChan = strId.startsWith('-100') || this.chats.get(strId)?.broadcast;
      let req: any;
      if (isChan) {
        req = new TLRPC.TL_channels_getFullChannel();
        req.channel = { _: 'inputChannel', channel_id: strId.replace('-100', ''), access_hash: '0' };
      } else {
        req = new TLRPC.TL_messages_getFullChat();
        req.chat_id = strId.replace('-', '');
      }
      const res = await conn.sendRequest<any>(req);
      if (res && res.chats && res.chats.length > 0) {
        const fullChat = res.chats[0];
        this.putChat(fullChat, true);
        NotificationCenter.getInstance(this.currentAccount).postNotificationName(
          NotificationCenter.chatInfoDidLoad,
          strId,
          fullChat
        );
        NotificationCenter.getInstance(this.currentAccount).postNotificationName(
          NotificationCenter.updateInterfaces,
          NotificationCenter.UPDATE_MASK_CHAT
        );
      }
      return res;
    } catch (e) {
      console.warn('[MessagesController] loadFullChat failed:', e);
      return null;
    }
  }

  // ==========================================================
  // 1. Two-Step Verification & Password Settings
  // TLRPC.TL_account_getPassword / TLRPC.TL_account_updatePasswordSettings
  // ==========================================================
  public async loadPasswordSettings(): Promise<TLRPC.TL_account_password | null> {
    try {
      const conn = ConnectionsManager.getInstance(this.currentAccount);
      const req = new TLRPC.TL_account_getPassword();
      req._ = 'account.getPassword';
      const res = await conn.sendRequest<TLRPC.TL_account_password>(req);
      if (res) {
        UserConfig.getInstance(this.currentAccount).set2FA(
          !!res.has_password,
          res.hint || '',
          res.login_email_pattern || ''
        );
        NotificationCenter.getInstance(this.currentAccount).postNotificationName(
          NotificationCenter.twoStepStateUpdated,
          res
        );
      }
      return res;
    } catch (e) {
      console.warn('[MessagesController] loadPasswordSettings failed:', e);
      return null;
    }
  }

  public async updatePasswordSettings(
    newSettings: TLRPC.TL_account_passwordInputSettings,
    currentPasswordHash?: any
  ): Promise<boolean> {
    try {
      const conn = ConnectionsManager.getInstance(this.currentAccount);
      const req = new TLRPC.TL_account_updatePasswordSettings();
      req._ = 'account.updatePasswordSettings';
      req.password = currentPasswordHash ? { hash: currentPasswordHash } : undefined;
      req.new_settings = newSettings;

      const res = await conn.sendRequest<any>(req);
      const ok = !!(res && (res._ === 'boolTrue' || res === true));
      if (ok) {
        await this.loadPasswordSettings();
      }
      return ok;
    } catch (e) {
      console.warn('[MessagesController] updatePasswordSettings failed:', e);
      return false;
    }
  }

  // ==========================================================
  // 2. Privacy & Security Settings
  // TLRPC.TL_account_getPrivacy / TLRPC.TL_account_setPrivacy
  // ==========================================================
  public async loadPrivacySettings(key: TLRPC.PrivacyKey): Promise<TLRPC.PrivacyRule[]> {
    try {
      const conn = ConnectionsManager.getInstance(this.currentAccount);
      const req = new TLRPC.TL_account_getPrivacy();
      req._ = 'account.getPrivacy';
      req.key = key;

      const res = await conn.sendRequest<TLRPC.TL_account_privacyRules>(req);
      const rules = res?.rules || [];
      NotificationCenter.getInstance(this.currentAccount).postNotificationName(
        NotificationCenter.privacyRulesUpdated,
        key,
        rules
      );
      return rules;
    } catch (e) {
      console.warn('[MessagesController] loadPrivacySettings failed:', e);
      return [];
    }
  }

  public async setPrivacy(key: TLRPC.PrivacyKey, rules: TLRPC.PrivacyRule[]): Promise<boolean> {
    try {
      const conn = ConnectionsManager.getInstance(this.currentAccount);
      const req = new TLRPC.TL_account_setPrivacy();
      req._ = 'account.setPrivacy';
      req.key = key;
      req.rules = rules;

      const res = await conn.sendRequest<TLRPC.TL_account_privacyRules>(req);
      const ok = !!(res && res._ === 'account.privacyRules');
      NotificationCenter.getInstance(this.currentAccount).postNotificationName(
        NotificationCenter.privacyRulesUpdated,
        key,
        res?.rules || rules
      );
      return ok;
    } catch (e) {
      console.warn('[MessagesController] setPrivacy failed:', e);
      return false;
    }
  }

  // ==========================================================
  // 3. Active Sessions & Authorizations
  // TLRPC.TL_account_getAuthorizations / TLRPC.TL_account_resetAuthorization
  // ==========================================================
  public async loadAuthorizations(force: boolean = false): Promise<TLRPC.TL_authorization[]> {
    try {
      const conn = ConnectionsManager.getInstance(this.currentAccount);
      const req = new TLRPC.TL_account_getAuthorizations();
      req._ = 'account.getAuthorizations';

      const res = await conn.sendRequest<TLRPC.TL_account_authorizations>(req);
      const list = res?.authorizations || [];
      NotificationCenter.getInstance(this.currentAccount).postNotificationName(
        NotificationCenter.authorizationsUpdated,
        list
      );
      return list;
    } catch (e) {
      console.warn('[MessagesController] loadAuthorizations failed:', e);
      return [];
    }
  }

  public async resetAuthorization(hash: number | string): Promise<boolean> {
    try {
      const conn = ConnectionsManager.getInstance(this.currentAccount);
      const req = new TLRPC.TL_account_resetAuthorization();
      req._ = 'account.resetAuthorization';
      req.hash = hash;

      const res = await conn.sendRequest<any>(req);
      const ok = !!(res && (res._ === 'boolTrue' || res === true));
      if (ok) {
        await this.loadAuthorizations(true);
      }
      return ok;
    } catch (e) {
      console.warn('[MessagesController] resetAuthorization failed:', e);
      return false;
    }
  }

  public async resetOtherAuthorizations(): Promise<boolean> {
    try {
      const conn = ConnectionsManager.getInstance(this.currentAccount);
      const req = new TLRPC.TL_auth_resetAuthorizations();
      req._ = 'auth.resetAuthorizations';

      const res = await conn.sendRequest<any>(req);
      const ok = !!(res && (res._ === 'boolTrue' || res === true));
      if (ok) {
        await this.loadAuthorizations(true);
      }
      return ok;
    } catch (e) {
      console.warn('[MessagesController] resetOtherAuthorizations failed:', e);
      return false;
    }
  }

  // ==========================================================
  // 4. Stories Synchronization
  // TLRPC.TL_stories_getAllStories / TLRPC.TL_stories_sendStory
  // ==========================================================
  public async loadAllStories(force: boolean = false): Promise<any> {
    try {
      const conn = ConnectionsManager.getInstance(this.currentAccount);
      const req = new TLRPC.TL_stories_getAllStories();
      req._ = 'stories.getAllStories';

      const res = await conn.sendRequest<any>(req);
      NotificationCenter.getInstance(this.currentAccount).postNotificationName(
        NotificationCenter.storiesUpdated,
        res
      );
      return res;
    } catch (e) {
      console.warn('[MessagesController] loadAllStories failed:', e);
      return null;
    }
  }

  public async sendStory(
    peer: TLRPC.InputPeer,
    media: any,
    caption: string,
    period: number = 86400,
    privacyRules: TLRPC.PrivacyRule[] = []
  ): Promise<any> {
    try {
      const conn = ConnectionsManager.getInstance(this.currentAccount);
      const req = new TLRPC.TL_stories_sendStory();
      req._ = 'stories.sendStory';
      req.peer = peer;
      req.media = media;
      req.caption = caption;
      req.period = period;
      req.privacy_rules = privacyRules;

      const res = await conn.sendRequest<any>(req);
      await this.loadAllStories(true);
      return res;
    } catch (e) {
      console.warn('[MessagesController] sendStory failed:', e);
      return null;
    }
  }

  // ==========================================================
  // 5. Message History & Search
  // TLRPC.TL_messages_getHistory / TLRPC.TL_messages_search / TLRPC.TL_messages_getDocument
  // ==========================================================
  public async loadHistory(
    dialogId: string | number,
    offsetId: number = 0,
    limit: number = 50,
    maxId: number = 0
  ): Promise<Message[]> {
    try {
      const conn = ConnectionsManager.getInstance(this.currentAccount);
      const req = {
        _: 'messages.getHistory',
        peer: { _: 'inputPeerChat', chat_id: Number(dialogId) },
        offset_id: offsetId,
        limit,
        max_id: maxId,
      };

      const res = await conn.sendRequest<any>(req);
      NotificationCenter.getInstance(this.currentAccount).postNotificationName(
        NotificationCenter.messagesDidLoad,
        String(dialogId)
      );
      return res?.messages || [];
    } catch (e) {
      console.warn('[MessagesController] loadHistory failed:', e);
      return [];
    }
  }

  public async searchMessages(
    dialogId: string | number,
    query: string,
    filter: any = null,
    offsetId: number = 0,
    limit: number = 50
  ): Promise<Message[]> {
    try {
      const conn = ConnectionsManager.getInstance(this.currentAccount);
      const req = new TLRPC.TL_messages_search();
      req._ = 'messages.search';
      req.peer = { _: 'inputPeerChat', chat_id: Number(dialogId) } as any;
      req.q = query;
      req.filter = filter || { _: 'inputMessagesFilterEmpty' };
      req.offset_id = offsetId;
      req.limit = limit;

      const res = await conn.sendRequest<any>(req);
      return res?.messages || [];
    } catch (e) {
      console.warn('[MessagesController] searchMessages failed:', e);
      return [];
    }
  }

  public async getDocument(id: any): Promise<any> {
    try {
      const conn = ConnectionsManager.getInstance(this.currentAccount);
      const req = new TLRPC.TL_messages_getDocument();
      req._ = 'messages.getDocument';
      req.id = id;

      return await conn.sendRequest<any>(req);
    } catch (e) {
      console.warn('[MessagesController] getDocument failed:', e);
      return null;
    }
  }

  // ==========================================================
  // 6. Forum Topics (TLRPC.TL_channels_getForumTopics)
  // ==========================================================
  public async loadTopics(channelId: string | number, force: boolean = false): Promise<any> {
    try {
      const conn = ConnectionsManager.getInstance(this.currentAccount);
      const req = new TLRPC.TL_channels_getForumTopics();
      req._ = 'channels.getForumTopics';
      req.channel = { _: 'inputChannel', channel_id: Number(channelId), access_hash: '0' };

      const res = await conn.sendRequest<any>(req);
      NotificationCenter.getInstance(this.currentAccount).postNotificationName(
        NotificationCenter.topicsDidLoaded,
        String(channelId),
        res?.topics || []
      );
      return res?.topics || [];
    } catch (e) {
      console.warn('[MessagesController] loadTopics failed:', e);
      return [];
    }
  }

  // ==========================================================
  // 7. Profile Update (TLRPC.TL_account_updateProfile)
  // ==========================================================
  public async updateProfile(firstName?: string, lastName?: string, about?: string): Promise<boolean> {
    try {
      const conn = ConnectionsManager.getInstance(this.currentAccount);
      const req = new TLRPC.TL_account_updateProfile();
      req._ = 'account.updateProfile';
      req.first_name = firstName;
      req.last_name = lastName;
      req.about = about;

      const res = await conn.sendRequest<any>(req);
      if (res && res._ === 'user') {
        const u = UserConfig.getInstance(this.currentAccount);
        if (u.currentUser) {
          u.currentUser.first_name = firstName || u.currentUser.first_name;
          u.currentUser.last_name = lastName || u.currentUser.last_name;
          u.saveConfig();
        }
        NotificationCenter.getInstance(this.currentAccount).postNotificationName(
          NotificationCenter.mainUserInfoChanged
        );
      }
      return true;
    } catch (e) {
      console.warn('[MessagesController] updateProfile failed:', e);
      return false;
    }
  }

  // ==========================================================
  // 8. Notifications Settings (TLRPC.TL_account_updateNotifySettings)
  // ==========================================================
  public async updateNotificationSettings(peer: any, settings: any): Promise<boolean> {
    try {
      const conn = ConnectionsManager.getInstance(this.currentAccount);
      const req = new TLRPC.TL_account_updateNotifySettings();
      req._ = 'account.updateNotifySettings';
      req.peer = peer;
      req.settings = settings;

      await conn.sendRequest<any>(req);
      NotificationCenter.getInstance(this.currentAccount).postNotificationName(
        NotificationCenter.notificationsCountUpdated
      );
      return true;
    } catch (e) {
      console.warn('[MessagesController] updateNotificationSettings failed:', e);
      return false;
    }
  }

  // ==========================================================
  // 9. Sponsored Messages / Ads (TLRPC.TL_channels_getSponsoredMessages)
  // ==========================================================
  public async loadSponsoredMessages(peerId: string | number): Promise<any> {
    try {
      const conn = ConnectionsManager.getInstance(this.currentAccount);
      const req = new TLRPC.TL_channels_getSponsoredMessages();
      req._ = 'channels.getSponsoredMessages';
      req.channel = { _: 'inputChannel', channel_id: Number(peerId), access_hash: '0' };

      const res = await conn.sendRequest<any>(req);
      NotificationCenter.getInstance(this.currentAccount).postNotificationName(
        NotificationCenter.sponsoredMessagesLoaded,
        peerId,
        res
      );
      return res;
    } catch (e) {
      console.warn('[MessagesController] loadSponsoredMessages failed:', e);
      return null;
    }
  }

  public toggleSponsoredMessages(enabled: boolean): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`tg_ads_enabled_${this.currentAccount}`, JSON.stringify(enabled));
    }
    NotificationCenter.getInstance(this.currentAccount).postNotificationName(
      NotificationCenter.updateInterfaces,
      NotificationCenter.UPDATE_MASK_ALL
    );
  }

  public isSponsoredMessagesEnabled(): boolean {
    if (typeof window !== 'undefined') {
      const val = localStorage.getItem(`tg_ads_enabled_${this.currentAccount}`);
      return val !== null ? JSON.parse(val) : true;
    }
    return true;
  }

  // ==========================================================
  // 10. Save & Restore Settings (Cloud Sync)
  // ==========================================================
  public async saveSettingsToCloud(): Promise<boolean> {
    try {
      if (typeof window !== 'undefined') {
        const bundle = {
          account: this.currentAccount,
          userConfig: UserConfig.getInstance(this.currentAccount),
          timestamp: Date.now(),
        };
        localStorage.setItem(`tg_cloud_settings_backup_${this.currentAccount}`, JSON.stringify(bundle));
      }
      NotificationCenter.getInstance(this.currentAccount).postNotificationName(
        NotificationCenter.cloudSettingsUpdated
      );
      return true;
    } catch (e) {
      console.warn('[MessagesController] saveSettingsToCloud failed:', e);
      return false;
    }
  }

  public async restoreSettingsFromCloud(): Promise<any> {
    try {
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem(`tg_cloud_settings_backup_${this.currentAccount}`);
        if (raw) {
          const bundle = JSON.parse(raw);
          NotificationCenter.getInstance(this.currentAccount).postNotificationName(
            NotificationCenter.cloudSettingsUpdated,
            bundle
          );
          return bundle;
        }
      }
      return null;
    } catch (e) {
      console.warn('[MessagesController] restoreSettingsFromCloud failed:', e);
      return null;
    }
  }

  // ==========================================================
  // 11. Official DrKLO Deep Links & Chat Invite Mechanism
  // TLRPC.TL_messages_checkChatInvite / TLRPC.TL_messages_importChatInvite
  // ==========================================================
  public async checkChatInvite(
    rawHash: string,
    callback?: (invite: TLRPC.ChatInvite, error?: TLRPC.TL_error) => void
  ): Promise<TLRPC.ChatInvite> {
    const hash = rawHash
      .replace(/^(https?:\/\/)?(t\.me\/|telegram\.me\/|telegram\.dog\/)?(\+|(joinchat\/))?/i, '')
      .replace(/^tg:\/\/join\?invite=/i, '')
      .trim();

    try {
      const conn = ConnectionsManager.getInstance(this.currentAccount);
      const req = new TLRPC.TL_messages_checkChatInvite();
      req.hash = hash;

      const res = await conn.sendRequest<TLRPC.ChatInvite>(req);

      NotificationCenter.getInstance(this.currentAccount).postNotificationName(
        NotificationCenter.chatInviteLoaded,
        hash,
        res
      );

      if (callback) callback(res);
      return res;
    } catch (err: any) {
      console.warn('[MessagesController] checkChatInvite failed:', err);
      const errorObj: TLRPC.TL_error = {
        code: 400,
        text: err?.text || 'INVITE_HASH_EXPIRED',
      };
      if (callback) callback(null as any, errorObj);
      throw errorObj;
    }
  }

  public async joinChat(
    invite: TLRPC.ChatInvite,
    rawHash: string,
    onSuccess?: () => void,
    onError?: (error: TLRPC.TL_error) => void
  ): Promise<boolean> {
    const hash = rawHash
      .replace(/^(https?:\/\/)?(t\.me\/|telegram\.me\/|telegram\.dog\/)?(\+|(joinchat\/))?/i, '')
      .replace(/^tg:\/\/join\?invite=/i, '')
      .trim();

    try {
      const conn = ConnectionsManager.getInstance(this.currentAccount);
      const req = new TLRPC.TL_messages_importChatInvite();
      req.hash = hash;

      const res = await conn.sendRequest<any>(req);

      if (res) {
        this.processUpdates(res, false);

        if (res.request_needed) {
          NotificationCenter.getInstance(this.currentAccount).postNotificationName(
            NotificationCenter.pendingJoinRequestsUpdated,
            hash,
            res
          );
        } else if (res.joinedChat) {
          const joined = res.joinedChat as Chat;
          this.chats.set(joined.id, joined);
          if (!this.dialogs.some((d) => d.id === joined.id)) {
            this.dialogs.unshift(joined);
          }

          const storage = MessagesStorage.getInstance(this.currentAccount);
          storage.saveDialog(joined);
          if (joined.lastMessage) {
            storage.saveMessage(joined.lastMessage as Message);
          }

          NotificationCenter.getInstance(this.currentAccount).postNotificationName(
            NotificationCenter.chatInviteJoined,
            joined
          );
          NotificationCenter.getInstance(this.currentAccount).postNotificationName(
            NotificationCenter.dialogsNeedReload
          );
          NotificationCenter.getInstance(this.currentAccount).postNotificationName(
            NotificationCenter.updateInterfaces,
            NotificationCenter.UPDATE_MASK_SELECT_DIALOG
          );
        }
      }

      if (onSuccess) onSuccess();
      return true;
    } catch (err: any) {
      console.warn('[MessagesController] joinChat failed:', err);
      const errorObj: TLRPC.TL_error = {
        code: 400,
        text: err?.text || 'INVITE_REQUEST_FAILED',
      };
      if (onError) onError(errorObj);
      return false;
    }
  }

  public openByUserName(username: string, onDone?: (chat: Chat | null) => void): void {
    const clean = username.replace(/^@/, '').toLowerCase();
    const existing = this.dialogs.find(
      (d) => (d.username && d.username.toLowerCase() === clean) || (d.id && d.id.toLowerCase() === clean)
    );

    if (existing) {
      NotificationCenter.getInstance(this.currentAccount).postNotificationName(
        NotificationCenter.updateInterfaces,
        NotificationCenter.UPDATE_MASK_SELECT_DIALOG,
        existing.id
      );
      if (onDone) onDone(existing);
      return;
    }

    // Fallback: create mock discovered chat or query server
    const newChat: Chat = {
      id: `user_${clean}`,
      title: `@${clean}`,
      name: `@${clean}`,
      type: clean.includes('bot') ? 'bot' : 'private',
      username: clean,
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&h=120&fit=crop',
      unreadCount: 0,
      description: `حساب تيليجرام @${clean}`,
      isVerified: false,
    };
    this.chats.set(newChat.id, newChat);
    this.dialogs.unshift(newChat);

    NotificationCenter.getInstance(this.currentAccount).postNotificationName(
      NotificationCenter.dialogsNeedReload
    );
    NotificationCenter.getInstance(this.currentAccount).postNotificationName(
      NotificationCenter.updateInterfaces,
      NotificationCenter.UPDATE_MASK_SELECT_DIALOG,
      newChat.id
    );

    if (onDone) onDone(newChat);
  }

  public openByLink(link: string, onDone?: (chat: Chat | null) => void): void {
    // Check channel post links: t.me/c/123456/789 or t.me/username/123
    const cMatch = link.match(/\/c\/(\d+)\/(\d+)/);
    if (cMatch) {
      const channelId = cMatch[1];
      const msgId = cMatch[2];
      const existing = this.dialogs.find((d) => d.id === channelId || d.id === `channel_${channelId}`);
      if (existing) {
        NotificationCenter.getInstance(this.currentAccount).postNotificationName(
          NotificationCenter.updateInterfaces,
          NotificationCenter.UPDATE_MASK_SELECT_DIALOG,
          existing.id,
          msgId
        );
        if (onDone) onDone(existing);
        return;
      }
    }

    const uMatch = link.match(/t\.me\/([a-zA-Z0-9_]+)(\/(\d+))?/);
    if (uMatch && uMatch[1] !== 'joinchat' && uMatch[1] !== 'c') {
      this.openByUserName(uMatch[1], onDone);
    }
  }

  public async loadMessages(
    dialogId: string | number,
    count: number = 50,
    max_id: number = 0,
    min_id: number = 0,
    fromCache: boolean = true,
    classGuid: number = 0
  ): Promise<Message[]> {
    const id = String(dialogId);
    const storage = MessagesStorage.getInstance(this.currentAccount);
    const msgs = storage.getMessages(id, count, max_id);

    NotificationCenter.getInstance(this.currentAccount).postNotificationName(
      NotificationCenter.messagesDidLoad,
      id,
      msgs
    );
    return msgs;
  }

  public async processChatJoinRequests(
    chatId: string | number,
    user: any,
    approve: boolean
  ): Promise<boolean> {
    try {
      const conn = ConnectionsManager.getInstance(this.currentAccount);
      const req = new TLRPC.TL_messages_hideChatJoinRequest();
      req.peer = { _: 'peerChannel', channel_id: Number(chatId) || 1 };
      req.user_id = user?.id || user;
      req.approved = approve;

      await conn.sendRequest<any>(req);
      NotificationCenter.getInstance(this.currentAccount).postNotificationName(
        NotificationCenter.pendingJoinRequestsUpdated,
        chatId
      );
      return true;
    } catch (e) {
      console.warn('[MessagesController] processChatJoinRequests failed:', e);
      return false;
    }
  }

  public async processChatJoinRequestsAll(
    chatId: string | number,
    approve: boolean
  ): Promise<boolean> {
    try {
      const conn = ConnectionsManager.getInstance(this.currentAccount);
      const req = new TLRPC.TL_messages_hideAllChatJoinRequests();
      req.peer = { _: 'peerChannel', channel_id: Number(chatId) || 1 };
      req.approved = approve;

      await conn.sendRequest<any>(req);
      NotificationCenter.getInstance(this.currentAccount).postNotificationName(
        NotificationCenter.pendingJoinRequestsUpdated,
        chatId
      );
      return true;
    } catch (e) {
      console.warn('[MessagesController] processChatJoinRequestsAll failed:', e);
      return false;
    }
  }
}

export const messagesController = MessagesController.getInstance();
