<svelte:options runes={true} />

<script lang="ts">
  import {
    ArrowLeft,
    Bot,
    CircleAlert,
    Hash,
    Link,
    LoaderCircle,
    MessageCircle,
    Mic,
    Plus,
    SendHorizontal,
    Smile,
    Square,
    Timer,
    Users,
    Webhook,
    Clapperboard,
    Pencil,
    Search
  } from "@lucide/svelte";
  import { browser } from "$app/environment";
  import { invoke } from "@tauri-apps/api/core";
  import { goto } from "$app/navigation";
  import ImageLightbox from "$lib/components/media/ImageLightbox.svelte";
  import FilePreview from "$lib/components/media/FilePreview.svelte";
  import FileTransferApprovals from "$lib/features/chat/components/FileTransferApprovals.svelte";
  import FileTransferHistory from "$lib/features/chat/components/FileTransferHistory.svelte";
  import CallStatusBanner from "$lib/features/calls/components/CallStatusBanner.svelte";
  import EmojiPicker from "$lib/components/emoji/EmojiPicker.svelte";
  import GifPicker from "$lib/components/gif/GifPicker.svelte";
  import {
    loadEmojiData,
    type EmojiCategory,
  } from "$lib/components/emoji/emojiData";

  import FloatingContextMenu from "$lib/components/context-menus/FloatingContextMenu.svelte";
  import VirtualList from "@humanspeak/svelte-virtual-list";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import {
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
  } from "$lib/components/ui/tabs";

  import { userStore } from "$lib/stores/userStore";
  import { friendStore } from "$lib/features/friends/stores/friendStore";
  import { mutedFriendsStore } from "$lib/features/friends/stores/mutedFriendsStore";
  import {
    chatStore,
    messagesByChatId,
    hasMoreByChatId,
    loadingStateByChat,
    slowmodeByChannelId,
  } from "$lib/features/chat/stores/chatStore";
  import { normalizeSlowmodeValue } from "$lib/features/channels/utils/slowmode";
  import {
    getContext,
    onDestroy,
    onMount,
    tick,
  } from "svelte";
  import { toasts } from "$lib/stores/ToastStore";
  import { generateCollaborationDocumentId } from "$lib/features/collaboration/collabDocumentStore";
  import { chatSearchStore } from "$lib/features/chat/stores/chatSearchStore";
  import { get, derived } from "svelte/store";
  import {
    buildLowercaseContent,
    buildUserLookup,
    buildChannelLookup,
    DEFAULT_AUTHOR_TYPES,
    DEFAULT_HAS_TOKENS,
    matchNormalizedMessages,
    parseSearchQuery,
    type MessageContentCache,
  } from "$lib/features/chat/utils/chatSearch";
  import { mergeAttachments } from "$lib/features/chat/utils/attachments";
  import { callStore } from "$lib/features/calls/stores/callStore";
  import {
    serverStore,
    activeServerEmojiCategories,
  } from "$lib/features/servers/stores/serverStore";
  import { settings } from "$lib/features/settings/stores/settings";
  import MessageAuthorName from "$lib/features/chat/components/MessageAuthorName.svelte";
  import MessageEmbed from "$lib/features/chat/components/MessageEmbed.svelte";
  import { highlightText } from "$lib/features/chat/utils/highlightText";
  import LinkPreview from "$lib/features/chat/components/LinkPreview.svelte";
  import { extractFirstLink } from "$lib/features/chat/utils/linkPreviews";
  import {
    renderMessageContent,
    type FormattedMessageSegment,
    mapFriendsById,
  } from "$lib/features/chat/utils/renderMessageContent";
  import { writeTextToClipboard } from "$lib/utils/clipboard";
  import {
    clearChatDraft,
    loadChatDraft,
    saveChatDraft,
    type ChatDraft,
  } from "$lib/features/chat/utils/chatDraftStore";
  import {
    createMentionSuggestionsStore,
    type MentionCandidate,
  } from "$lib/features/chat/stores/mentionSuggestions";
  import {
    buildSpecialMentionCandidates,
    canMemberMentionEveryone,
    extractSpecialMentionKeys,
  } from "$lib/features/chat/utils/mentionPermissions";
  import { connectivityStore } from "$lib/stores/connectivityStore";
  import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
  } from "$lib/components/ui/tooltip";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import {
    aggregateChannelPermissions,
    allowAllChannelPermissions,
    buildRolePermissionMap,
    collectMemberRoleIds,
  } from "$lib/features/chat/utils/permissions";

  import { CREATE_GROUP_CONTEXT_KEY } from "$lib/contextKeys";
  import type { CreateGroupContext } from "$lib/contextTypes";
  import {
    buildGroupModalOptions,
    buildReportUserPayload,
    normalizeUser,
  } from "$lib/features/chat/utils/contextMenu";
  import type { ReportMessageModalPayload } from "$lib/features/chat/utils/contextMenu";
  import type { User } from "$lib/features/auth/models/User";
  import type { Friend } from "$lib/features/friends/models/Friend";
  import type { Chat } from "$lib/features/chat/models/Chat";
  import type {
    Message,
    MessageAuthorType,
  } from "$lib/features/chat/models/Message";
  import type { Channel } from "$lib/features/channels/models/Channel";
  import type { Role } from "$lib/features/servers/models/Role";
  import { Button } from "$lib/components/ui/button/index";
  import { Input } from "$lib/components/ui/input/index";

  type SendServerInviteResult = {
    server_id: string;
    user_id: string;
    already_member: boolean;
  };

  type ReplyPreview = {
    messageId: string;
    author?: string;
    snippet?: string;
  };

  type MessageDeliveryState = "pending" | "failed" | "sent";

  type DeliveryAwareMessage = Message & {
    pending?: boolean | string;
    failed?: boolean | string;
    sendFailed?: boolean | string;
    deliveryStatus?: string;
    status?: string;
    failureReason?: string;
    failure_reason?: string;
    sendError?: string;
    errorMessage?: string;
    error_message?: string;
  };

  type AutomatedAuthorType = Exclude<MessageAuthorType, "user">;
  type IconComponent = typeof Bot | typeof Webhook;

  const AUTHOR_TYPE_META: Record<
    AutomatedAuthorType,
    {
      label: string;
      tooltip: string;
      icon: IconComponent;
    }
  > = {
    bot: {
      label: "BOT",
      tooltip: "Automated bot message",
      icon: Bot,
    },
    webhook: {
      label: "WEBHOOK",
      tooltip: "Message sent via webhook",
      icon: Webhook,
    },
  };

  const resolveMessageDeliveryState = (
    message: Message,
  ): { state: MessageDeliveryState; reason?: string } => {
    const extended = message as DeliveryAwareMessage;
    const pendingState = extended.pending as string | boolean | undefined;

    if (pendingState === true) {
      return { state: "pending" };
    }

    const normalizedPendingState =
      typeof pendingState === "string" ? pendingState.toLowerCase() : null;
    const pendingIndicatesFailure =
      normalizedPendingState !== null &&
      ["failed", "error"].includes(normalizedPendingState);

    const reasonCandidates = [
      extended.failureReason,
      extended.failure_reason,
      extended.sendError,
      extended.errorMessage,
      extended.error_message,
      pendingIndicatesFailure && typeof pendingState === "string"
        ? pendingState
        : undefined,
    ].filter(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    );

    const hasFailureIndicator =
      pendingIndicatesFailure ||
      extended.failed === true ||
      (typeof extended.failed === "string" &&
        ["true", "failed", "error"].includes(
          (extended.failed as string).toLowerCase(),
        )) ||
      extended.sendFailed === true ||
      (typeof extended.sendFailed === "string" &&
        ["true", "failed", "error"].includes(
          (extended.sendFailed as string).toLowerCase(),
        )) ||
      (typeof extended.deliveryStatus === "string" &&
        (extended.deliveryStatus as string).toLowerCase() === "failed") ||
      (typeof extended.status === "string" &&
        (extended.status as string).toLowerCase() === "failed") ||
      reasonCandidates.length > 0;

    if (hasFailureIndicator) {
      return {
        state: "failed",
        reason: reasonCandidates[0],
      };
    }

    return { state: "sent" };
  };

  function buildCurrentDraft(): ChatDraft {
    return {
      messageInput,
      attachments: [...attachedFiles],
      replyTargetMessageId,
      replyPreview: replyPreview ? { ...replyPreview } : null,
      textareaHeight: textareaRef?.style.height ?? "",
    } satisfies ChatDraft;
  }

  async function persistChatDraft(chatId: string, draft: ChatDraft) {
    if (!chatId) {
      return;
    }

    const shouldPersist =
      draft.messageInput.trim().length > 0 ||
      draft.attachments.length > 0 ||
      draft.replyTargetMessageId !== null;

    if (!shouldPersist) {
      await clearChatDraft(chatId);
      return;
    }

    await saveChatDraft(chatId, draft);
  }

  let { chat } = $props<{ chat: Chat | null }>();

  const channelPermissions = $derived(() => {
    if (!chat || chat.type !== "channel") {
      return allowAllChannelPermissions();
    }

    const server = $serverStore.servers.find(
      (entry) => entry.id === chat.serverId,
    );
    const me = $userStore.me;

    if (!server || !me) {
      return allowAllChannelPermissions();
    }

    if (me.id === server.owner_id) {
      return allowAllChannelPermissions();
    }

    const channel = server.channels?.find((entry) => entry.id === chat.id);
    if (!channel) {
      return allowAllChannelPermissions();
    }

    const rolePermissionMap = buildRolePermissionMap(server.roles);

    const memberRoleIds = collectMemberRoleIds({
      me,
      server,
      chat,
    });

    const noRoleData =
      rolePermissionMap.size === 0 || memberRoleIds.length === 0;
    const hasOverrides = Boolean(channel.permission_overrides);

    if (!hasOverrides && noRoleData) {
      return allowAllChannelPermissions();
    }

    return aggregateChannelPermissions({
      memberRoleIds,
      rolePermissionMap,
      basePermissions: noRoleData ? allowAllChannelPermissions() : undefined,
      overrides: channel.permission_overrides,
      userId: me.id,
    });
  });

  const canSendMessages = $derived(() => {
    if (!chat || chat.type !== "channel") {
      return true;
    }
    return channelPermissions().send_messages === true;
  });

  const canAttachFiles = $derived(() => {
    if (!chat || chat.type !== "channel") {
      return true;
    }
    return channelPermissions().attach_files === true;
  });

  const canUseComposerEmoji = $derived(() => {
    if (!chat || chat.type !== "channel") {
      return true;
    }
    return channelPermissions().use_external_emojis === true;
  });

  const canBanMembers = $derived(() => {
    if (!chat || chat.type !== "channel") {
      return false;
    }
    return channelPermissions().ban_members === true;
  });

  const canMentionEveryone = $derived(() => {
    if (!chat || chat.type !== "channel") {
      return false;
    }
    const server = $serverStore.servers.find(
      (entry) => entry.id === chat.serverId,
    );
    const me = $userStore.me;
    return canMemberMentionEveryone({
      chat,
      server,
      me,
    });
  });

  const canAddMessageReactions = $derived(() => {
    if (!chat || chat.type !== "channel") {
      return true;
    }
    return channelPermissions().add_reactions === true;
  });

  const canManageMessages = $derived(() => {
    if (!chat || chat.type !== "channel") {
      return true;
    }
    return channelPermissions().manage_messages === true;
  });

  const canSendVoiceMessages = $derived(() => {
    if (!chat || chat.type !== "channel") {
      return true;
    }
    const permissions = channelPermissions();
    if (typeof permissions.send_voice_messages === "boolean") {
      return permissions.send_voice_messages;
    }
    return permissions.attach_files === true;
  });

  const canBypassSlowmode = $derived(() => {
    if (!chat || chat.type !== "channel") {
      return true;
    }
    const permissions = channelPermissions();
    return (
      permissions.manage_messages === true ||
      permissions.moderate_members === true ||
      permissions.manage_channels === true
    );
  });

  const channelSlowmodeSeconds = $derived(() => {
    if (!chat || chat.type !== "channel") {
      return 0;
    }
    const server = $serverStore.servers.find(
      (entry) => entry.id === chat.serverId,
    );
    const channel = server?.channels?.find((entry) => entry.id === chat.id);
    if (!channel || channel.channel_type !== "text") {
      return 0;
    }
    return normalizeSlowmodeValue(channel.rate_limit_per_user ?? 0);
  });

  const slowmodeActive = $derived(
    () => channelSlowmodeSeconds() > 0 && !canBypassSlowmode(),
  );

  const voiceMemoControlEnabled = $derived(
    () => voiceMemosEnabled && canSendVoiceMessages(),
  );

  const voiceMemoRestrictionMessage = $derived(() =>
    voiceMemoControlEnabled()
      ? null
      : voiceMemosEnabled
        ? "You do not have permission to send voice memos."
        : "Voice memos are disabled in settings.",
  );

  const createGroupContext = getContext<CreateGroupContext | undefined>(
    CREATE_GROUP_CONTEXT_KEY,
  );
  const openUserCardModal = createGroupContext?.openUserCardModal;
  const openDetailedProfileModal = createGroupContext?.openDetailedProfileModal;
  const openCreateGroupModal = createGroupContext?.openCreateGroupModal;
  const openReportUserModal = createGroupContext?.openReportUserModal;
  const openReportMessageModal = createGroupContext?.openReportMessageModal;
  const openCollaborativeDocumentModal =
    createGroupContext?.openCollaborativeDocumentModal;
  const openCollaborativeWhiteboard =
    createGroupContext?.openCollaborativeWhiteboard;

  const LOAD_COOLDOWN_MS = 600;
  let showContextMenu = $state(false);
  let contextMenuX = $state(0);
  let contextMenuY = $state(0);
  let selectedUser = $state<User | Friend | null>(null);
  let messageInput = $state("");
  let showLightbox = $state(false);
  let lightboxImageUrl = $state("");
  let loadingMoreMessages = $state(false);
  let historyLoadPromise: Promise<boolean> | null = null;
  let pendingScrollTarget: string | null = null;
  let canTriggerTopLoad = $state(true);
  let lastTopLoad = 0;
  let attachedFiles = $state<File[]>([]);
  let sending = $state(false);
  let slowmodeRemainingSeconds = $state(0);
  let slowmodeIntervalId: number | null = $state(null);

  $effect(() => {
    if (!browser || typeof window === "undefined") {
      return;
    }

    if (!chat || chat.type !== "channel" || !slowmodeActive()) {
      slowmodeRemainingSeconds = 0;
      if (slowmodeIntervalId) {
        clearInterval(slowmodeIntervalId);
        slowmodeIntervalId = null;
      }
      return;
    }

    const tracker = $slowmodeByChannelId.get(chat.id);
    const now = Date.now();
    const availableAt = tracker?.availableAt ?? 0;
    const initialRemaining =
      availableAt > now ? Math.ceil((availableAt - now) / 1000) : 0;
    slowmodeRemainingSeconds = initialRemaining;

    if (slowmodeIntervalId) {
      clearInterval(slowmodeIntervalId);
      slowmodeIntervalId = null;
    }

    if (initialRemaining > 0) {
      slowmodeIntervalId = window.setInterval(() => {
        const latestTracker = $slowmodeByChannelId.get(chat.id);
        const activeAvailableAt = latestTracker?.availableAt ?? availableAt;
        const nowTick = Date.now();
        const nextRemaining =
          activeAvailableAt > nowTick
            ? Math.ceil((activeAvailableAt - nowTick) / 1000)
            : 0;
        slowmodeRemainingSeconds = nextRemaining;
        if (nextRemaining <= 0 && slowmodeIntervalId) {
          clearInterval(slowmodeIntervalId);
          slowmodeIntervalId = null;
        }
      }, 1000);
    }

    return () => {
      if (slowmodeIntervalId) {
        clearInterval(slowmodeIntervalId);
        slowmodeIntervalId = null;
      }
    };
  });
  let isRestoringDraft = $state(false);
  let activeDraftLoadToken: symbol | null = null;
  let isAtBottom = $state(true);
  let unseenCount = $state(0);
  let expiryNow = $state(Date.now());
  let typingActive = $state(false);
  let typingResetTimer: ReturnType<typeof setTimeout> | null = null;
  const TYPING_IDLE_TIMEOUT_MS = 2_500;
  const MAX_REPLY_SNIPPET_LENGTH = 120;
  const CONNECTIVITY_WARNING_THROTTLE_MS = 4_000;
  const SPECIAL_MENTION_PERMISSION_WARNING =
    "You do not have permission to mention @everyone or @here in this channel.";

  type ExpiryIndicatorTone = "default" | "warning" | "critical" | "expired";

  const expiryIndicatorToneClasses: Record<ExpiryIndicatorTone, string> = {
    default: "bg-zinc-700/80 text-white",
    warning: "bg-amber-500/80 text-zinc-900",
    critical: "bg-red-600/80 text-white",
    expired: "bg-red-900/80 text-white",
  };

  function formatExpiryLabel(remainingMs: number): string {
    if (remainingMs <= 0) {
      return "Expired";
    }

    if (remainingMs < 60_000) {
      const seconds = Math.max(1, Math.ceil(remainingMs / 1_000));
      return `Expires in ${seconds}s`;
    }

    if (remainingMs < 5 * 60_000) {
      const minutes = Math.floor(remainingMs / 60_000);
      const seconds = Math.floor((remainingMs % 60_000) / 1_000);
      const minuteLabel = minutes > 0 ? `${minutes}m ` : "";
      const secondLabel =
        minutes > 0 ? seconds.toString().padStart(2, "0") : seconds.toString();
      return `Expires in ${minuteLabel}${secondLabel}s`;
    }

    if (remainingMs < 60 * 60_000) {
      const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));
      return `Expires in ${minutes}m`;
    }

    if (remainingMs < 24 * 60 * 60_000) {
      const hours = Math.max(1, Math.ceil(remainingMs / 3_600_000));
      return `Expires in ${hours}h`;
    }

    const days = Math.max(1, Math.ceil(remainingMs / 86_400_000));
    return `Expires in ${days}d`;
  }

  function resolveExpiryTone(remainingMs: number): ExpiryIndicatorTone {
    if (remainingMs <= 0) {
      return "expired";
    }
    if (remainingMs <= 60_000) {
      return "critical";
    }
    if (remainingMs <= 5 * 60_000) {
      return "warning";
    }
    return "default";
  }

  function formatExpiryTooltip(
    expiresAtMs: number,
    remainingMs: number,
  ): string {
    const formatted = new Date(expiresAtMs).toLocaleString();
    return remainingMs <= 0
      ? `Message expired on ${formatted}`
      : `Message expires on ${formatted}`;
  }

  const supportsVoiceRecording =
    typeof window !== "undefined" && "MediaRecorder" in window;
  const showMessageAvatars = $derived($settings.showMessageAvatars);
  const showMessageTimestamps = $derived($settings.showMessageTimestamps);
  const voiceMemosEnabled = $derived($settings.enableWalkieTalkieVoiceMemos);
  const messageDensity = $derived($settings.messageDensity);
  const densityClass = (cozy: string, compact: string) =>
    messageDensity === "compact" ? compact : cozy;
  const isVoiceMemoFile = (file: File) =>
    (file.type?.startsWith("audio/") ?? false) &&
    file.name.startsWith("voice-message-");
  let isRecording = $state(false);
  let recordingDuration = $state(0);
  let recordingStartedAt = 0;
  let recordingInterval: ReturnType<typeof setInterval> | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let recordingStream: MediaStream | null = null;
  let recordedChunks: Blob[] = [];
  let lastConnectivityWarningAt = 0;

  type ComposerConnectivityTone = "info" | "warning" | "success";

  const connectivityQueueing = $derived(() => {
    const status = $connectivityStore.status;
    return status === "offline";
  });

  const connectivitySendBlocked = $derived(() => {
    const status = $connectivityStore.status;
    return status === "initializing";
  });

  const connectivitySendBlockedMessage = $derived(() => {
    const status = $connectivityStore.status;
    switch (status) {
      case "offline":
        return "You're offline. Messages will send when connectivity returns.";
      case "initializing":
        return "Connectivity is still starting up. Please wait a moment before sending.";
      default:
        return null;
    }
  });

  type ComposerConnectivityNotice = {
    tone: ComposerConnectivityTone;
    message: string;
  } | null;

  const composerConnectivityNotice = $derived((): ComposerConnectivityNotice => {
      const state = $connectivityStore;
      const { status, bridgeSuggested, gatewayStatus } = state;

      if (gatewayStatus.bridgeModeEnabled) {
        if (gatewayStatus.forwarding) {
          return {
            tone: "success",
            message:
              "Bridge Mode is forwarding traffic upstream. Messages will sync beyond nearby peers.",
          } satisfies ComposerConnectivityNotice;
        }

        return {
          tone: "warning",
          message:
            status === "mesh-only"
              ? "Bridge Mode enabled. Waiting for an uplink so mesh messages can reach the wider network."
              : "Bridge Mode enabled. Establishing an uplink before messages can leave the mesh.",
        } satisfies ComposerConnectivityNotice;
      }

      if (status === "mesh-only") {
        if (bridgeSuggested) {
          return {
            tone: "warning",
            message:
              "Mesh-only connectivity. Messages will queue until a bridge forwards them to the wider network.",
          } satisfies ComposerConnectivityNotice;
        }

        return {
          tone: "info",
          message:
            "Mesh-only connectivity. Messages reach nearby peers and will sync globally once an uplink is available.",
        } satisfies ComposerConnectivityNotice;
      }

      return null;
    },
  );

  let lastComposerConnectivityNotice: ComposerConnectivityNotice | null =
    $state(null);

  $effect(() => {
    const notice = composerConnectivityNotice();
    if (!notice) {
      lastComposerConnectivityNotice = null;
      return;
    }

    if (
      lastComposerConnectivityNotice &&
      lastComposerConnectivityNotice.message === notice.message &&
      lastComposerConnectivityNotice.tone === notice.tone
    ) {
      return;
    }

    toasts.addToast(notice.message, notice.tone);
    lastComposerConnectivityNotice = notice;
  });

  $effect(() => {
    if (!connectivitySendBlocked() && !connectivityQueueing()) {
      lastConnectivityWarningAt = 0;
    }
  });

  $effect(() => {
    if (!voiceMemoControlEnabled() && isRecording) {
      void stopRecording({ save: false, silent: true });
    }
  });

  let listRef: any = $state();
  let fileInput: HTMLInputElement | null = $state(null);
  let textareaRef: HTMLTextAreaElement | null = $state(null);
  let composerPickerTriggerEl: HTMLDivElement | null = $state(null);
  let composerPickerEl: HTMLDivElement | null = $state(null);
  let viewportEl: HTMLElement | null = null;
  let detachViewportListener: (() => void) | null = null;
  let showMsgMenu = $state(false);
  let msgMenuX = $state(0);
  let msgMenuY = $state(0);
  let selectedMsg: Message | null = $state(null);
  let memberById = $state<Map<string, User>>(new Map());
  let channelById = $state<Map<string, Channel>>(new Map());
  let roleById = $state<Map<string, Role>>(new Map());
  let friendById = $state<Map<string, Friend>>(new Map());
  let editingMessageId = $state<string | null>(null);
  let editingDraft = $state("");
  let editingSaving = $state(false);
  let editingTextarea: HTMLTextAreaElement | null = $state(null);
  let replyTargetMessageId = $state<string | null>(null);
  let replyPreview = $state<ReplyPreview | null>(null);
  const mentionSuggestions = createMentionSuggestionsStore();
  type ComposerPickerTab = "emoji" | "gif";

  let showComposerPicker = $state(false);
  let composerPickerTab = $state<ComposerPickerTab>("emoji");
  let emojiSearchTerm = $state("");
  const composerPickerId = $derived(
    () => `chat-composer-emoji-picker-${chat?.id ?? "unknown"}`,
  );
  let defaultEmojiCategories = $state<EmojiCategory[] | null>(null);
  let defaultEmojiFallbackUsed = $state(false);
  let emojiMetadataLoad: Promise<void> | null = null;
  let gifPickerSelectedCategoryId = $state<string | null>(null);
  let gifPickerCategoryLabel = $state<string | null>(null);

  const serverEmojiPickerCategories = $derived(
    () => $activeServerEmojiCategories,
  );

  const emojiPickerCategories = $derived(() => {
    const combinedSources: EmojiCategory[] = [];

    if (
      Array.isArray(serverEmojiPickerCategories) &&
      serverEmojiPickerCategories.length > 0
    ) {
      combinedSources.push(...serverEmojiPickerCategories);
    }

    if (defaultEmojiCategories) {
      combinedSources.push(...defaultEmojiCategories);
    }

    if (combinedSources.length === 0) {
      return null;
    }

    const seen = new Set<string>();
    const merged: EmojiCategory[] = [];

    for (const category of combinedSources) {
      if (!category) continue;
      const filtered = category.emojis.filter((entry) => {
        const key = entry.value;
        if (!key) {
          return false;
        }
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });

      if (filtered.length > 0) {
        merged.push({ ...category, emojis: filtered });
      }
    }

    return merged.length > 0 ? merged : null;
  });

  const emojiPickerFallbackUsed = $derived(() =>
    defaultEmojiCategories ? defaultEmojiFallbackUsed : false,
  );

  async function loadDefaultEmojiCategoriesOnce() {
    if (defaultEmojiCategories) {
      return;
    }

    if (emojiMetadataLoad) {
      await emojiMetadataLoad;
      return;
    }

    emojiMetadataLoad = (async () => {
      const result = await loadEmojiData();
      defaultEmojiCategories = result.categories;
      defaultEmojiFallbackUsed = result.usedFallback;
    })();

    try {
      await emojiMetadataLoad;
    } finally {
      emojiMetadataLoad = null;
    }
  }

  const mentionableMembers = $derived(() => {
    if (!chat) return [] as MentionCandidate[];

    const candidates: MentionCandidate[] = [];

    if (chat.type === "dm") {
      if (chat.friend) {
        candidates.push({
          id: chat.friend.id,
          name: chat.friend.name,
          avatar: chat.friend.avatar,
          tag: chat.friend.tag,
          kind: "user",
          searchText: chat.friend.tag ? `@${chat.friend.tag}` : undefined,
        });
      }
      return candidates;
    }

    const members = chat.members ?? [];
    for (const member of members) {
      candidates.push({
        id: member.id,
        name: member.name,
        avatar: member.avatar,
        tag: member.tag,
        kind: "user",
        searchText: member.tag ? `@${member.tag}` : undefined,
      });
    }

    if (chat.type === "channel") {
      const allowSpecialMentions = canMentionEveryone();
      const server = $serverStore.servers.find(
        (entry) => entry.id === chat.serverId,
      );
      if (server) {
        for (const channel of server.channels ?? []) {
          candidates.push({
            id: channel.id,
            name: channel.name,
            kind: "channel",
            searchText: `#${channel.name}`,
          });
        }

        for (const role of server.roles ?? []) {
          if (role.mentionable) {
            candidates.push({
              id: role.id,
              name: role.name,
              kind: "role",
              searchText: `@${role.name}`,
            });
          }
        }

        const specialCandidates =
          buildSpecialMentionCandidates(allowSpecialMentions);
        if (specialCandidates.length > 0) {
          candidates.push(...specialCandidates);
        }
      }
    }

    return candidates;
  });

  $effect(() => {
    mentionableMembers();
    mentionSuggestions.close();
  });

  const notifyMessagesViewed = () => {
    if (!chat) return;
    void chatStore.markActiveChatViewed();
  };

  const resetTypingTimer = () => {
    if (typingResetTimer) {
      clearTimeout(typingResetTimer);
      typingResetTimer = null;
    }
  };

  const scheduleTypingStop = () => {
    resetTypingTimer();
    typingResetTimer = setTimeout(() => {
      typingResetTimer = null;
      if (typingActive) {
        typingActive = false;
        void chatStore.sendTypingIndicator(false);
      }
    }, TYPING_IDLE_TIMEOUT_MS);
  };

  const closeComposerPicker = (options?: { focusComposer?: boolean }) => {
    if (!showComposerPicker) {
      return;
    }
    showComposerPicker = false;
    composerPickerTab = "emoji";
    emojiSearchTerm = "";
    if (options?.focusComposer) {
      queueMicrotask(() => {
        textareaRef?.focus();
      });
    }
  };

  const openComposerPicker = (tab: ComposerPickerTab) => {
    composerPickerTab = tab;
    showComposerPicker = true;
  };

  const toggleComposerPicker = (tab: ComposerPickerTab) => {
    if (tab === "emoji" && !canUseComposerEmoji()) {
      return;
    }
    if (showComposerPicker && composerPickerTab === tab) {
      closeComposerPicker();
      return;
    }
    openComposerPicker(tab);
  };

  const handleGifPickerBack = () => {
    gifPickerSelectedCategoryId = null;
    gifPickerCategoryLabel = null;
  };

  const insertTextIntoComposer = (text: string) => {
    const textarea = textareaRef;
    const selectionStart = textarea?.selectionStart ?? messageInput.length;
    const selectionEnd = textarea?.selectionEnd ?? messageInput.length;
    const before = messageInput.slice(0, selectionStart);
    const after = messageInput.slice(selectionEnd);
    messageInput = `${before}${text}${after}`;

    if (!typingActive) {
      typingActive = true;
      void chatStore.sendTypingIndicator(true);
    }

    const nextCaret = before.length + text.length;

    queueMicrotask(() => {
      const el = textareaRef;
      if (!el) {
        return;
      }
      el.focus();
      el.setSelectionRange(nextCaret, nextCaret);
      adjustTextareaHeight();
      updateMentionSuggestions(nextCaret);
    });

    scheduleTypingStop();
  };

  const handleComposerEmojiSelect = (emoji: string) => {
    if (!canUseComposerEmoji()) {
      return;
    }
    insertTextIntoComposer(emoji);
    closeComposerPicker({ focusComposer: true });
  };

  const handleComposerGifSelect = (gif: { url: string }) => {
    insertTextIntoComposer(gif.url);
    closeComposerPicker({ focusComposer: true });
  };

  const baseModerationPreferences = {
    transparentEdits: false,
    deletedMessageDisplay: "ghost" as const,
  };

  const moderationPreferences = $derived(() => {
    if (!chat || chat.type !== "channel") {
      return baseModerationPreferences;
    }
    const server = $serverStore.servers.find((entry) =>
      (entry.channels ?? []).some((channel) => channel.id === chat.id),
    );
    if (!server) {
      return baseModerationPreferences;
    }
    const settings = server.settings ?? {};
    return {
      transparentEdits: settings.transparentEdits === true,
      deletedMessageDisplay:
        settings.deletedMessageDisplay === "tombstone"
          ? ("tombstone" as const)
          : ("ghost" as const),
    };
  });

  const showTransparentEditHistory = $derived(
    () => moderationPreferences().transparentEdits,
  );
  const showDeletedTombstones = $derived(
    () => moderationPreferences().deletedMessageDisplay === "tombstone",
  );

  const updateMentionSuggestions = (cursorPosition?: number) => {
    if (!canSendMessages()) {
      mentionSuggestions.close();
      return;
    }
    const candidates = mentionableMembers();
    if (!candidates.length) {
      mentionSuggestions.close();
      return;
    }
    if (!textareaRef) {
      mentionSuggestions.updateInput(
        messageInput,
        cursorPosition ?? messageInput.length,
        candidates,
      );
      return;
    }
    const cursor =
      typeof cursorPosition === "number"
        ? cursorPosition
        : (textareaRef.selectionStart ?? messageInput.length);
    mentionSuggestions.updateInput(messageInput, cursor, candidates);
  };

  const handleComposerFocus = () => {
    if (!canSendMessages()) {
      return;
    }
    if (!typingActive) {
      typingActive = true;
      void chatStore.sendTypingIndicator(true);
    }
    scheduleTypingStop();
    updateMentionSuggestions();
  };

  const handleComposerInput = (event?: Event) => {
    if (!canSendMessages()) {
      return;
    }
    if (!typingActive) {
      typingActive = true;
      void chatStore.sendTypingIndicator(true);
    }
    scheduleTypingStop();
    if (
      event &&
      "target" in event &&
      event.target instanceof HTMLTextAreaElement
    ) {
      updateMentionSuggestions(event.target.selectionStart ?? undefined);
    } else {
      updateMentionSuggestions();
    }
  };

  const handleComposerBlur = () => {
    if (typingActive) {
      typingActive = false;
      void chatStore.sendTypingIndicator(false);
    }
    resetTypingTimer();
    mentionSuggestions.close();
  };

  const handleComposerPointerUp = () => {
    updateMentionSuggestions();
  };

  const handleComposerKeyup = (event: KeyboardEvent) => {
    if (
      event.key === "ArrowLeft" ||
      event.key === "ArrowRight" ||
      event.key === "Home" ||
      event.key === "End"
    ) {
      updateMentionSuggestions();
    }
  };

  function formatMentionCandidateLabel(candidate: MentionCandidate): string {
    switch (candidate.kind) {
      case "channel":
        return `#${candidate.name}`;
      case "role":
        return `@${candidate.name}`;
      case "special":
        return candidate.name.startsWith("@")
          ? candidate.name
          : `@${candidate.name}`;
      case "user":
      default:
        return candidate.name;
    }
  }

  function getMentionCandidateBadge(candidate: MentionCandidate): string {
    switch (candidate.kind) {
      case "channel":
        return "#";
      case "role":
        return "@";
      case "special":
        return "@";
      case "user":
      default:
        return candidate.name?.charAt(0)?.toUpperCase?.() ?? "@";
    }
  }

  function getMentionCandidateBadgeClasses(
    candidate: MentionCandidate,
  ): string {
    switch (candidate.kind) {
      case "channel":
        return "bg-cyan-600/70 text-cyan-100";
      case "role":
        return "bg-emerald-600/70 text-emerald-100";
      case "special":
        return "bg-amber-600/70 text-amber-100";
      case "user":
      default:
        return "bg-zinc-600/70 text-zinc-100";
    }
  }

  function buildMentionToken(candidate: MentionCandidate): string {
    switch (candidate.kind) {
      case "channel":
        return `<#${candidate.id}>`;
      case "role":
        return `<@&${candidate.id}>`;
      case "special": {
        if (candidate.specialKey === "here") {
          return "@here";
        }
        return "@everyone";
      }
      case "user":
      default:
        return `<@${candidate.id}>`;
    }
  }

  const handleMentionSelection = (index?: number) => {
    const candidate = mentionSuggestions.select(index);
    const state = get(mentionSuggestions);
    if (!candidate || !state.active) {
      return;
    }
    const start = state.triggerIndex;
    const end = state.cursorIndex;
    if (start < 0 || end < start) {
      mentionSuggestions.close();
      return;
    }
    const mentionToken = buildMentionToken(candidate);
    const before = messageInput.slice(0, start);
    const after = messageInput.slice(end);
    const needsTrailingSpace = after.length === 0 || !/^\s/.test(after);
    const insertion = `${mentionToken}${needsTrailingSpace ? " " : ""}`;
    messageInput = `${before}${insertion}${after}`;
    mentionSuggestions.close();
    if (!typingActive) {
      typingActive = true;
      void chatStore.sendTypingIndicator(true);
    }
    queueMicrotask(() => {
      if (textareaRef) {
        const caret =
          start + mentionToken.length + (needsTrailingSpace ? 1 : 0);
        textareaRef.focus();
        textareaRef.setSelectionRange(caret, caret);
      }
    });
    adjustTextareaHeight();
    scheduleTypingStop();
  };

  const handleComposerKeydown = (event: KeyboardEvent) => {
    if (!canSendMessages()) {
      return;
    }
    const state = get(mentionSuggestions);
    if (state.active) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        mentionSuggestions.moveSelection(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        mentionSuggestions.moveSelection(-1);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        handleMentionSelection();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        mentionSuggestions.close();
        return;
      }
    }

    if (event.key !== "Enter") {
      return;
    }

    if (event.isComposing) {
      return;
    }

    const hasExplicitNewlineModifier = event.shiftKey || event.ctrlKey;
    const hasOtherModifier = event.altKey || event.metaKey;

    if (hasExplicitNewlineModifier || hasOtherModifier) {
      return;
    }

    event.preventDefault();
    sendMessage(event);
  };

  const onScroll = () => {
    const el = viewportEl;
    if (!el) return;

    const bottomThreshold = 24;
    const atBottom =
      el.scrollHeight - (el.scrollTop + el.clientHeight) <= bottomThreshold;
    isAtBottom = atBottom;
    if (atBottom) {
      unseenCount = 0;
      notifyMessagesViewed();
    }

    const topThreshold = TOP_LOAD_THRESHOLD_PX;
    const hasMore = hasMoreHistory;
    const awayThreshold = topThreshold * TOP_LOAD_AWAY_MULTIPLIER;
    if (!loadingMoreMessages && el.scrollTop > awayThreshold) {
      canTriggerTopLoad = true;
    }
    const now = Date.now();
    if (
      !loadingMoreMessages &&
      !historyLoadPromise &&
      hasMore &&
      canTriggerTopLoad &&
      now - lastTopLoad > LOAD_COOLDOWN_MS &&
      el.scrollTop <= topThreshold &&
      chat?.id
    ) {
      canTriggerTopLoad = false;
      lastTopLoad = now;
      void loadOlderMessages({ preserveScroll: true });
    }
  };

  function attachViewportElement(element: HTMLElement | null) {
    if (viewportEl === element) return;
    if (detachViewportListener) {
      detachViewportListener();
      detachViewportListener = null;
    }

    viewportEl = element;
    if (!viewportEl) return;

    viewportEl.addEventListener("scroll", onScroll, {
      passive: true,
    } as AddEventListenerOptions);
    onScroll();
    detachViewportListener = () => {
      viewportEl?.removeEventListener("scroll", onScroll);
      if (viewportEl === element) {
        viewportEl = null;
      }
    };
  }

  function captureViewport(node: HTMLElement) {
    const nextViewport = node.closest(".chat-viewport") as HTMLElement | null;
    if (nextViewport) {
      attachViewportElement(nextViewport);
    }
    return {
      destroy() {
        if (viewportEl && !viewportEl.isConnected) {
          attachViewportElement(null);
        }
      },
    };
  }

  onMount(() => {
    void loadDefaultEmojiCategoriesOnce();
    const unregisterSearchHandlers = chatSearchStore.registerHandlers({
      jumpToMatch,
      clearSearch,
      focusMatch,
    });
    return () => {
      detachViewportListener?.();
      detachViewportListener = null;
      viewportEl = null;
      unregisterSearchHandlers();
      chatSearchStore.reset();
    };
  });

  onDestroy(() => {
    if (chat?.id) {
      void persistChatDraft(chat.id, buildCurrentDraft());
    }
    if (isRecording || mediaRecorder || recordingStream) {
      stopRecording({ save: false, silent: true });
    }
    resetTypingTimer();
    if (typingActive) {
      typingActive = false;
      void chatStore.sendTypingIndicator(false);
    }
  });

  $effect(() => {
    if (viewportEl && !viewportEl.isConnected) {
      attachViewportElement(null);
    }
    if (isAtBottom) {
      notifyMessagesViewed();
    }
  });

  $effect(() => {
    if (!showComposerPicker) {
      return;
    }
    if (typeof document === "undefined") {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (
        (target && composerPickerTriggerEl?.contains(target)) ||
        (target && composerPickerEl?.contains(target))
      ) {
        return;
      }
      closeComposerPicker();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  });

  let prevCount = $state(0);
  let prevChatId = $state<string | null>(null);
  $effect(() => {
    const nextChatId = chat?.id ?? null;
    if (nextChatId === prevChatId) {
      return;
    }

    unseenCount = 0;
    isAtBottom = true;
    prevCount = 0;
    chatSearchStore.reset();
    const previousChatId = prevChatId;
    const previousDraft = previousChatId ? buildCurrentDraft() : null;
    prevChatId = nextChatId;

    const loadToken = Symbol("chat-draft-load");
    activeDraftLoadToken = loadToken;

    const previousPersistence =
      previousChatId && previousDraft
        ? persistChatDraft(previousChatId, previousDraft)
        : Promise.resolve();

    isRestoringDraft = true;
    messageInput = "";
    attachedFiles = [];
    replyTargetMessageId = null;
    replyPreview = null;
    showComposerPicker = false;
    composerPickerTab = "emoji";

    void (async () => {
      try {
        if (!nextChatId) {
          await tick();
          if (activeDraftLoadToken === loadToken && textareaRef) {
            textareaRef.style.height = "";
            adjustTextareaHeight();
          }
          return;
        }

        const restoredDraft = await loadChatDraft(nextChatId);
        if (activeDraftLoadToken !== loadToken) {
          return;
        }

        if (restoredDraft) {
          messageInput = restoredDraft.messageInput;
          attachedFiles = [...restoredDraft.attachments];
          replyTargetMessageId = restoredDraft.replyTargetMessageId;
          replyPreview = restoredDraft.replyPreview
            ? { ...restoredDraft.replyPreview }
            : null;
        }

        await tick();
        if (activeDraftLoadToken !== loadToken) {
          return;
        }

        if (textareaRef) {
          textareaRef.style.height = restoredDraft?.textareaHeight ?? "";
          adjustTextareaHeight();
        }
      } finally {
        try {
          await previousPersistence;
        } catch (error) {
          console.warn("[ChatView] Failed to persist chat draft:", error);
        }
        if (activeDraftLoadToken === loadToken) {
          isRestoringDraft = false;
        }
      }
    })();
  });

  const unsubscribeFriends = friendStore.subscribe((state) => {
    friendById = mapFriendsById(state.friends ?? []);
  });

  onDestroy(() => {
    unsubscribeFriends();
  });

  $effect(() => {
    if ((chat?.type === "channel" || chat?.type === "group") && chat.members) {
      memberById = new Map(
        chat.members.map((member: User) => [member.id, member]),
      );
    } else {
      memberById = new Map();
    }
  });

  $effect(() => {
    if (chat?.type === "channel") {
      const server = $serverStore.servers.find(
        (entry) => entry.id === chat.serverId,
      );
      if (server) {
        channelById = new Map(
          (server.channels ?? []).map((channel: Channel) => [
            channel.id,
            channel,
          ]),
        );
        roleById = new Map(
          (server.roles ?? []).map((role: Role) => [role.id, role]),
        );
        return;
      }
    }
    channelById = new Map();
    roleById = new Map();
  });

  $effect(() => {
    if (!replyTargetMessageId) {
      return;
    }
    const target =
      currentChatMessages?.find((msg) => msg.id === replyTargetMessageId) ??
      null;
    if (target) {
      replyPreview = buildReplyPreviewFromMessage(target);
    }
  });

  $effect(() => {
    const count = currentChatMessages?.length ?? 0;
    if (!count) return;
    if (count !== prevCount) {
      if (!loadingMoreMessages) {
        if (isAtBottom && listRef && typeof listRef.scroll === "function") {
          listRef.scroll({
            index: count - 1,
            align: "bottom",
            smoothScroll: prevCount > 0,
          });
        } else if (!isAtBottom && count > prevCount) {
          unseenCount += count - prevCount;
        }
      }
      prevCount = count;
    }
  });

  $effect(() => {
    const chatId = chat?.id ?? null;
    if (!chatId || isRestoringDraft) {
      return;
    }

    const snapshot = buildCurrentDraft();
    void persistChatDraft(chatId, snapshot);
  });

  const myId = $userStore.me?.id;
  const chatSearchQueryStore = derived(chatSearchStore, (state) => state.query);

  function resolveMentionName(userId: string): string {
    if (!userId) {
      return "";
    }

    if (userId === myId) {
      return $userStore.me?.name ?? "You";
    }

    const member = memberById.get(userId);
    if (member?.name) {
      return member.name;
    }

    if (chat?.type === "dm") {
      if (chat.friend.id === userId) {
        return chat.friend.name;
      }
    }

    const friend = friendById.get(userId);
    if (friend?.name) {
      return friend.name;
    }

    return userId;
  }

  function resolveChannelName(channelId: string): string {
    if (!channelId) {
      return "";
    }

    const channel = channelById.get(channelId);
    if (channel?.name) {
      return channel.name;
    }

    if (chat?.type === "channel") {
      const server = $serverStore.servers.find(
        (entry) => entry.id === chat.serverId,
      );
      const fallback = server?.channels?.find(
        (entry) => entry.id === channelId,
      );
      if (fallback?.name) {
        return fallback.name;
      }
    }

    return channelId;
  }

  function resolveRoleName(roleId: string): string {
    if (!roleId) {
      return "";
    }

    const role = roleById.get(roleId);
    if (role?.name) {
      return role.name;
    }

    if (chat?.type === "channel") {
      const server = $serverStore.servers.find(
        (entry) => entry.id === chat.serverId,
      );
      const fallback = server?.roles?.find((entry) => entry.id === roleId);
      if (fallback?.name) {
        return fallback.name;
      }
    }

    return roleId;
  }

  function resolveSpecialMentionName(key: "everyone" | "here"): string {
    switch (key) {
      case "here":
        return "@here";
      case "everyone":
      default:
        return "@everyone";
    }
  }

  function formatMessageSegments(
    content: string | null | undefined,
  ): FormattedMessageSegment[] {
    return renderMessageContent(content ?? "", {
      resolveMentionName,
      resolveChannelName,
      resolveRoleName,
      resolveSpecialMentionName,
    });
  }

  function focusMatch(index: number) {
    const { matches } = get(chatSearchStore);
    if (!matches.length) return;
    const safeIndex = Math.max(0, Math.min(index, matches.length - 1));
    chatSearchStore.setActiveMatchIndex(safeIndex);
    const msgIndex = matches[safeIndex];
    if (listRef && typeof listRef.scroll === "function") {
      listRef.scroll({ index: msgIndex, align: "center", smoothScroll: true });
    }
  }

  function jumpToMatch(next = true) {
    const { matches, activeMatchIndex } = get(chatSearchStore);
    if (!matches.length) return;
    const count = matches.length;
    const nextIndex = (activeMatchIndex + (next ? 1 : -1) + count) % count;
    focusMatch(nextIndex);
  }

  function clearSearch() {
    chatSearchStore.reset();
  }

  type ContextMenuEntry = {
    label?: string;
    action?: string;
    isDestructive?: boolean;
    isSeparator?: boolean;
  };

  let contextMenuItems = $state<ContextMenuEntry[]>([]);

  $effect(() => {
    const base: ContextMenuEntry[] = [
      { label: "View Profile", action: "view_profile" },
    ];
    if (chat?.type === "dm") {
      base.push({ label: "Remove Friend", action: "remove_friend" });
    }
    if (canBanMembers()) {
      base.push({ label: "Ban Member", action: "ban_member", isDestructive: true });
    }
    base.push(
      { isSeparator: true },
      { label: "Block", action: "block_user", isDestructive: true },
      { label: "Mute", action: "mute_user" },
      { label: "Report User", action: "report_user", isDestructive: true },
      { isSeparator: true },
    );
    if (chat?.type === "channel") {
      base.push({ label: "Add to Group", action: "add_to_group" });
    } else {
      base.push({ label: "Invite to Server", action: "invite_to_server" });
    }
    base.push(
      {
        label: "Share Collaborative Document",
        action: "open_collaboration_document",
      },
      {
        label: "Open Shared Whiteboard",
        action: "open_collaboration_whiteboard",
      },
    );
    contextMenuItems = base;
  });

  function handleContextMenu(event: MouseEvent, user: User | Friend) {
    event.preventDefault();
    showContextMenu = true;
    contextMenuX = event.clientX;
    contextMenuY = event.clientY;
    selectedUser = user;
  }

  function handleContextMenuAction(detail: {
    action: string;
    itemData: Friend | User | null;
  }) {
    const item = detail.itemData;
    if (!item) {
      return;
    }
    if (detail.action === "view_profile") {
      openDetailedProfileModal?.(item);
    } else if (detail.action === "remove_friend") {
      removeFriend(item as Friend);
    } else if (detail.action === "block_user") {
      blockUserAction(item);
    } else if (detail.action === "mute_user") {
      toggleMuteUser(item);
    } else if (detail.action === "ban_member") {
      void banMemberAction(item);
    } else if (detail.action === "invite_to_server") {
      inviteUserToServer(item);
    } else if (detail.action === "add_to_group") {
      if (!openCreateGroupModal) {
        toasts.addToast("Group creation is unavailable.", "error");
        return;
      }
      const options = buildGroupModalOptions(item);
      openCreateGroupModal(options);
    } else if (detail.action === "report_user") {
      if (!openReportUserModal) {
        toasts.addToast("Reporting is currently unavailable.", "error");
        return;
      }
      const payload = buildReportUserPayload(chat, item);
      openReportUserModal(payload);
    } else if (detail.action === "open_collaboration_document") {
      if (!openCollaborativeDocumentModal) {
        toasts.addToast("Collaboration tools are unavailable.", "error");
        return;
      }
      const prefix = chat?.id ?? "doc";
      openCollaborativeDocumentModal({
        documentId: generateCollaborationDocumentId(prefix),
        kind: "document",
      });
    } else if (detail.action === "open_collaboration_whiteboard") {
      if (!openCollaborativeWhiteboard) {
        toasts.addToast("Collaboration tools are unavailable.", "error");
        return;
      }
      const prefix = chat?.id ?? "whiteboard";
      openCollaborativeWhiteboard({
        documentId: generateCollaborationDocumentId(prefix),
      });
    } else {
      console.log(`Action not implemented: ${detail.action}`);
    }
  }

  async function removeFriend(user: Friend) {
    const meId = $userStore.me?.id;
    if (!meId) {
      toasts.addToast("You must be signed in to remove friends.", "error");
      return;
    }

    const usesFallbackId = user.friendshipId == null;
    const friendshipId = usesFallbackId ? user.id : user.friendshipId;

    if (!friendshipId) {
      toasts.addToast("Unable to determine friendship identifier.", "error");
      return;
    }

    try {
      await invoke("remove_friendship", { friendship_id: friendshipId });
      friendStore.removeFriend(user.id);
      mutedFriendsStore.unmute(user.id);
      toasts.addToast("Friend removed.", "success");
      await friendStore.initialize();
    } catch (error: any) {
      console.error("Failed to remove friend:", error);
      toasts.addToast(error?.message ?? "Failed to remove friend.", "error");
    }
  }

  async function blockUserAction(user: User | Friend) {
    const meId = $userStore.me?.id;
    if (!meId) {
      toasts.addToast("You must be signed in to block users.", "error");
      return;
    }

    try {
      await invoke("block_user", {
        current_user_id: meId,
        target_user_id: user.id,
      });
      toasts.addToast("User blocked.", "success");
      await friendStore.initialize();
    } catch (error: any) {
      console.error("Failed to block user:", error);
      toasts.addToast(error?.message ?? "Failed to block user.", "error");
    }
  }

  async function banMemberAction(user: User | Friend) {
    if (!chat || chat.type !== "channel") {
      toasts.addToast("Bans are only available in server channels.", "error");
      return;
    }

    if (!canBanMembers()) {
      toasts.addToast("You do not have permission to ban members.", "error");
      return;
    }

    const serverId = chat.serverId;
    if (!serverId) {
      toasts.addToast("Unable to determine server context.", "error");
      return;
    }

    const normalized = normalizeUser(user);
    const displayName =
      normalized.name && normalized.name.trim().length > 0
        ? normalized.name.trim()
        : "this member";

    const meId = $userStore.me?.id;
    if (meId && normalized.id === meId) {
      toasts.addToast("You cannot ban yourself.", "error");
      return;
    }

    const server = $serverStore.servers.find((entry) => entry.id === serverId);
    if (server && server.owner_id === normalized.id) {
      toasts.addToast("You cannot ban the server owner.", "error");
      return;
    }

    const confirmed = confirm(
      `Ban ${displayName} from ${chat.name ?? "this server"}? They will be removed and prevented from rejoining.`,
    );
    if (!confirmed) {
      return;
    }

    try {
      const result = await serverStore.banMember(serverId, normalized);
      if (!result.success) {
        const message =
          result.error ?? "Failed to ban member. Please try again.";
        toasts.addToast(message, "error");
        return;
      }

      toasts.addToast(`${displayName} banned from server.`, "success");
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to ban member.";
      toasts.addToast(message, "error");
    }
  }

  async function toggleMuteUser(user: User | Friend) {
    const meId = $userStore.me?.id;
    if (!meId) {
      toasts.addToast("You must be signed in to mute users.", "error");
      return;
    }

    const currentlyMuted = mutedFriendsStore.isMuted(user.id);
    try {
      await invoke("mute_user", {
        current_user_id: meId,
        target_user_id: user.id,
        muted: !currentlyMuted,
        spam_score: null,
      });

      if (currentlyMuted) {
        mutedFriendsStore.unmute(user.id);
        toasts.addToast("User unmuted.", "success");
      } else {
        mutedFriendsStore.mute(user.id);
        toasts.addToast("User muted.", "success");
      }
    } catch (error: any) {
      console.error("Failed to toggle mute:", error);
      toasts.addToast(
        error?.message ?? "Failed to update mute status.",
        "error",
      );
    }
  }

  async function allowSpamMessage(msg: Message) {
    chatStore.overrideSpamDecision(msg.chatId, msg.id, "allow");
    mutedFriendsStore.unmute(msg.senderId);

    const meId = $userStore.me?.id;
    if (meId) {
      try {
        await invoke("mute_user", {
          current_user_id: meId,
          target_user_id: msg.senderId,
          muted: false,
          spam_score: msg.spamScore ?? null,
        });
      } catch (error) {
        console.debug("mute_user logging failed", error);
      }
    }

    toasts.addToast("Message allowed.", "success");
  }

  async function keepSpamMessageMuted(msg: Message) {
    chatStore.overrideSpamDecision(msg.chatId, msg.id, "mute");
    mutedFriendsStore.mute(msg.senderId);

    const meId = $userStore.me?.id;
    if (meId) {
      try {
        await invoke("mute_user", {
          current_user_id: meId,
          target_user_id: msg.senderId,
          muted: true,
          spam_score: msg.spamScore ?? null,
        });
      } catch (error) {
        console.debug("mute_user logging failed", error);
      }
    }

    toasts.addToast("Message will remain hidden.", "info");
  }

  async function inviteUserToServer(user: User | Friend) {
    const meId = $userStore.me?.id;
    if (!meId) {
      toasts.addToast("You must be signed in to send invites.", "error");
      return;
    }

    const activeServerId = get(serverStore).activeServerId;
    if (!activeServerId) {
      toasts.addToast("Select a server to send an invite.", "error");
      return;
    }

    try {
      const result = await invoke<SendServerInviteResult>(
        "send_server_invite",
        {
          server_id: activeServerId,
          user_id: user.id,
        },
      );

      if (!result.already_member) {
        await serverStore.fetchServerDetails(result.server_id);
      }

      const message = result.already_member
        ? "User is already a member of the server."
        : "Invite sent.";
      const tone = result.already_member ? "info" : "success";
      toasts.addToast(message, tone);
    } catch (error: any) {
      console.error("Failed to send server invite:", error);
      toasts.addToast(
        error?.message ?? "Failed to send server invite.",
        "error",
      );
    }
  }

  function adjustTextareaHeight() {
    if (!textareaRef) return;
    textareaRef.style.height = "auto";
    const maxHeight = 6 * 24;
    textareaRef.style.height =
      Math.min(textareaRef.scrollHeight, maxHeight) + "px";
  }

  function clearRecordingInterval() {
    if (recordingInterval) {
      clearInterval(recordingInterval);
      recordingInterval = null;
    }
  }

  function cleanupRecordingStream() {
    if (!recordingStream) return;
    for (const track of recordingStream.getTracks()) {
      try {
        track.stop();
      } catch (error) {
        console.warn("Failed to stop recording track", error);
      }
    }
    recordingStream = null;
  }

  async function stopRecording({
    save = true,
    silent = false,
  }: { save?: boolean; silent?: boolean } = {}) {
    if (!mediaRecorder) {
      clearRecordingInterval();
      cleanupRecordingStream();
      recordingDuration = 0;
      recordingStartedAt = 0;
      isRecording = false;
      recordedChunks = [];
      return;
    }

    const recorder = mediaRecorder;
    clearRecordingInterval();
    const wasRecording = isRecording;
    isRecording = false;

    const stopPromise =
      recorder.state !== "inactive"
        ? new Promise<void>((resolve) => {
            recorder.addEventListener(
              "stop",
              () => {
                resolve();
              },
              { once: true },
            );
          })
        : Promise.resolve();

    if (recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch (error) {
        console.warn("Failed to stop recorder", error);
      }
    }

    await stopPromise;

    cleanupRecordingStream();

    const blob =
      recordedChunks.length > 0
        ? new Blob(recordedChunks, {
            type: recorder.mimeType || "audio/webm",
          })
        : null;

    recordedChunks = [];
    mediaRecorder = null;
    recordingDuration = 0;
    recordingStartedAt = 0;

    if (!save) {
      if (wasRecording && !silent) {
        toasts.addToast("Recording discarded.", "info");
      }
      return;
    }

    if (!blob || blob.size === 0) {
      if (!silent) {
        toasts.addToast("Recording was empty.", "warning");
      }
      return;
    }

    try {
      const safeTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fileName = `voice-message-${safeTimestamp}.webm`;
      const file = new File([blob], fileName, {
        type: blob.type || "audio/webm",
      });
      addAttachments([file]);
      if (!silent) {
        toasts.addToast("Voice message attached.", "success");
      }
    } catch (error) {
      console.error("Failed to attach recording", error);
      if (!silent) {
        toasts.showErrorToast("Failed to attach recording.");
      }
    }
  }

  async function startRecording() {
    if (!supportsVoiceRecording || !navigator.mediaDevices?.getUserMedia) {
      toasts.addToast(
        "Voice recording is not supported on this device.",
        "warning",
      );
      return;
    }

    if (isRecording) {
      await stopRecording();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true },
      });
      recordingStream = stream;
      recordedChunks = [];

      const recorder = new MediaRecorder(stream);
      mediaRecorder = recorder;
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      });
      recorder.addEventListener("error", (event) => {
        console.error("MediaRecorder error", event);
        toasts.showErrorToast("Recording error occurred.");
        stopRecording({ save: false, silent: true });
      });

      recorder.start();
      recordingStartedAt = Date.now();
      recordingDuration = 0;
      clearRecordingInterval();
      recordingInterval = setInterval(() => {
        recordingDuration = Date.now() - recordingStartedAt;
      }, 200);
      isRecording = true;
      toasts.addToast("Recording voice message...", "info");
    } catch (error) {
      console.error("Failed to start recording", error);
      const message =
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Microphone permission is required to record audio."
          : "Unable to access the microphone.";
      toasts.showErrorToast(message);
      clearRecordingInterval();
      cleanupRecordingStream();
      mediaRecorder = null;
      recordedChunks = [];
      isRecording = false;
      recordingDuration = 0;
      recordingStartedAt = 0;
    }
  }

  async function handleMicClick() {
    if (!voiceMemoControlEnabled() && !isRecording) {
      const message =
        voiceMemoRestrictionMessage() ??
        (voiceMemosEnabled
          ? "You do not have permission to send voice memos."
          : "Voice memos are disabled in settings.");
      toasts.addToast(message, "info");
      return;
    }

    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  }

  function formatRecordingDuration(ms: number) {
    if (!ms) return "00:00";
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }

  function formatSlowmodeCountdown(seconds: number): string {
    const clamped = Math.max(0, Math.floor(seconds));
    if (clamped < 60) {
      return `${clamped}s`;
    }
    if (clamped < 3600) {
      const minutes = Math.floor(clamped / 60);
      const remainder = clamped % 60;
      return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
    }
    const hours = Math.floor(clamped / 3600);
    const minutes = Math.floor((clamped % 3600) / 60);
    if (minutes === 0) {
      return `${hours}h`;
    }
    return `${hours}h ${minutes}m`;
  }

  function isSlowmodeError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
      return false;
    }
    const record = error as Record<string, unknown>;
    if (record.name === "SlowmodeError") {
      return true;
    }
    return typeof record.remainingSeconds === "number";
  }

  function resolveReplyAuthor(message: Message): string | undefined {
    if (message.senderId === myId) {
      return $userStore.me?.name ?? "You";
    }

    if (!chat) {
      return memberById.get(message.senderId)?.name ?? message.senderId;
    }

    if (chat.type === "dm") {
      if (message.senderId === chat.friend.id) {
        return chat.friend.name;
      }
      return $userStore.me?.name ?? message.senderId;
    }

    return memberById.get(message.senderId)?.name ?? message.senderId;
  }

  function buildReplySnippet(message: Message): string | undefined {
    const content = message.content?.trim();
    if (content && content.length > 0) {
      const firstLine = content.split(/\r?\n/, 1)[0];
      if (firstLine.length > MAX_REPLY_SNIPPET_LENGTH) {
        return `${firstLine.slice(0, MAX_REPLY_SNIPPET_LENGTH - 1)}…`;
      }
      return firstLine;
    }

    const attachment = message.attachments?.[0];
    if (attachment?.name) {
      return `Attachment: ${attachment.name}`;
    }

    if (message.attachments && message.attachments.length > 0) {
      return "Attachment";
    }

    return undefined;
  }

  function resolveReportChatName(): string | undefined {
    if (!chat) {
      return undefined;
    }

    if (chat.type === "channel" || chat.type === "group") {
      return chat.name;
    }

    if (chat.type === "dm") {
      return chat.friend?.name ?? undefined;
    }

    return undefined;
  }

  function resolveMessageAuthor(message: Message): User | Friend | null {
    if (message.senderId === $userStore.me?.id) {
      return $userStore.me ?? null;
    }

    if (!chat) {
      return memberById.get(message.senderId) ?? null;
    }

    if (chat.type === "dm") {
      if (message.senderId === chat.friend.id) {
        return chat.friend;
      }
      return $userStore.me ?? null;
    }

    return memberById.get(message.senderId) ?? null;
  }

  function collectSurroundingMessageIds(
    message: Message,
    windowSize = 2,
  ): string[] {
    const messages = currentChatMessages || [];
    const index = messages.findIndex((entry) => entry.id === message.id);
    if (index === -1) {
      return [];
    }

    const start = Math.max(0, index - windowSize);
    const end = Math.min(messages.length, index + windowSize + 1);

    return messages
      .slice(start, end)
      .map((entry) => entry.id)
      .filter((id) => id !== message.id);
  }

  function buildReportMessagePayload(
    message: Message,
  ): ReportMessageModalPayload {
    const author = resolveMessageAuthor(message);
    const resolvedAuthorName =
      author?.name ?? resolveReplyAuthor(message) ?? message.senderId;
    const authorAvatar = author?.avatar ?? null;

    return {
      messageId: message.id,
      chatId: chat?.id,
      chatType: chat?.type,
      chatName: resolveReportChatName(),
      authorId: author?.id ?? message.senderId,
      authorName: resolvedAuthorName,
      authorAvatar,
      messageExcerpt: buildReplySnippet(message) ?? message.content ?? undefined,
      messageTimestamp: message.timestamp,
      surroundingMessageIds: collectSurroundingMessageIds(message),
    };
  }

  function buildReplyPreviewFromMessage(message: Message): ReplyPreview {
    return {
      messageId: message.id,
      author: resolveReplyAuthor(message),
      snippet: buildReplySnippet(message),
    };
  }

  function enterReplyMode(message: Message) {
    replyTargetMessageId = message.id;
    replyPreview = buildReplyPreviewFromMessage(message);
    textareaRef?.focus();
    adjustTextareaHeight();
  }

  function cancelReply() {
    if (!replyTargetMessageId && !replyPreview) {
      return;
    }
    replyTargetMessageId = null;
    replyPreview = null;
    textareaRef?.focus();
  }

  function addAttachments(newFiles: File[]) {
    if (!canAttachFiles()) {
      toasts.addToast(
        "You do not have permission to attach files in this channel.",
        "warning",
      );
      return;
    }

    if (!newFiles.length) return;

    let filesToProcess = newFiles;

    if (!voiceMemoControlEnabled()) {
      const allowed = newFiles.filter((file) => !isVoiceMemoFile(file));
      if (allowed.length !== newFiles.length) {
        const message =
          voiceMemoRestrictionMessage() ??
          (voiceMemosEnabled
            ? "You do not have permission to send voice memos."
            : "Voice memos are disabled in settings.");
        toasts.addToast(message, "info");
      }
      filesToProcess = allowed;
    }

    if (filesToProcess.length === 0) {
      return;
    }

    const { files, duplicates } = mergeAttachments(
      attachedFiles,
      filesToProcess,
    );
    attachedFiles = files;

    if (duplicates > 0) {
      const message =
        duplicates === 1
          ? "Duplicate attachment skipped."
          : `${duplicates} duplicate attachments skipped.`;
      toasts.addToast(message, "warning");
    }
  }

  async function sendMessage(event: Event) {
    event.preventDefault();
    mentionSuggestions.close();
    if (!canSendMessages()) {
      toasts.addToast(
        "You do not have permission to send messages in this channel.",
        "warning",
      );
      return;
    }
    if (
      (messageInput.trim() === "" && attachedFiles.length === 0) ||
      !chat ||
      sending
    )
      return;
    if (
      chat.type === "channel" &&
      !canMentionEveryone() &&
      extractSpecialMentionKeys(messageInput).size > 0
    ) {
      toasts.addToast(SPECIAL_MENTION_PERMISSION_WARNING, "warning");
      return;
    }
    const blocked = connectivitySendBlocked();
    const queueing = connectivityQueueing();
    if (blocked || queueing) {
      const reason = connectivitySendBlockedMessage();
      const now = Date.now();
      if (
        reason &&
        (lastConnectivityWarningAt === 0 ||
          now - lastConnectivityWarningAt >= CONNECTIVITY_WARNING_THROTTLE_MS)
      ) {
        toasts.addToast(reason, "warning");
        lastConnectivityWarningAt = now;
      }
    }
    if (blocked) {
      return;
    }
    try {
      sending = true;
      const replyOptions =
        replyTargetMessageId && replyPreview
          ? {
              replyToMessageId: replyTargetMessageId,
              replySnapshot: {
                author: replyPreview.author,
                snippet: replyPreview.snippet,
              },
            }
          : undefined;
      if (attachedFiles.length > 0) {
        await chatStore.sendMessageWithAttachments(
          messageInput,
          attachedFiles,
          replyOptions,
        );
      } else {
        await chatStore.sendMessage(messageInput, replyOptions);
      }
      if (chat?.id) {
        await clearChatDraft(chat.id);
      }
      messageInput = "";
      attachedFiles = [];
      cancelReply();
      adjustTextareaHeight();
      if (typingActive) {
        typingActive = false;
        void chatStore.sendTypingIndicator(false);
      }
      resetTypingTimer();
    } catch (error) {
      if (isSlowmodeError(error)) {
        return;
      }
      console.error("Failed to send message", error);
      toasts.addToast("Failed to send message.", "error");
    } finally {
      sending = false;
    }
  }

  async function retryFailedMessage(message: Message) {
    if (message.pending) {
      return;
    }

    try {
      await chatStore.retryMessageSend(message.chatId, message.id);
    } catch (error) {
      console.error("Failed to retry message send", error);
      const messageText =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Failed to resend message.";
      toasts.addToast(messageText, "error");
    }
  }

  function handleFileSelect(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files) {
      addAttachments(Array.from(target.files));
      target.value = "";
    }
  }

  function handleComposerAttachFile() {
    if (!canAttachFiles()) {
      toasts.addToast(
        "You do not have permission to attach files in this channel.",
        "error",
      );
      return;
    }
    fileInput?.click();
  }

  function handleComposerCreateThread() {
    toasts.addToast("Thread creation is coming soon.", "info");
  }

  function handleComposerCreatePoll() {
    toasts.addToast("Poll creation is coming soon.", "info");
  }

  function micButtonClasses() {
    const base =
      "flex items-center justify-center p-2 text-muted-foreground rounded-full transition-colors";
    const states = [];
    if (voiceMemoControlEnabled()) {
      states.push("cursor-pointer", "hover:text-white");
    } else {
      states.push("opacity-50", "cursor-not-allowed");
    }
    if (isRecording) {
      states.push("text-red-400");
    }
    return [base, ...states].join(" ");
  }

  function popoverVoiceButtonClasses() {
    const base = "justify-start w-full transition";
    const states = [];
    if (voiceMemoControlEnabled()) {
      states.push("hover:text-white", "cursor-pointer");
    } else {
      states.push("opacity-50", "cursor-not-allowed");
    }
    if (isRecording) {
      states.push("text-red-400");
    }
    return [base, ...states].join(" ");
  }

  function removeAttachment(fileToRemove: File) {
    attachedFiles = attachedFiles.filter((file) => file !== fileToRemove);
  }

  function openLightbox(imageUrl: string) {
    lightboxImageUrl = imageUrl;
    showLightbox = true;
  }

  const TOP_LOAD_THRESHOLD_PX = 24;
  const TOP_LOAD_AWAY_MULTIPLIER = 8;

  function scrollToBottom() {
    const count = currentChatMessages?.length ?? 0;
    if (count && listRef && typeof listRef.scroll === "function") {
      listRef.scroll({ index: count - 1, align: "bottom", smoothScroll: true });
      unseenCount = 0;
      isAtBottom = true;
      notifyMessagesViewed();
    }
  }

  function attemptScrollToMessage(messageId: string) {
    if (!messageId) return false;

    const messages = currentChatMessages || [];
    const index = messages.findIndex((msg) => msg.id === messageId);
    if (listRef && typeof listRef.scroll === "function" && index !== -1) {
      listRef.scroll({ index, align: "center", smoothScroll: true });
      return true;
    }

    const element = document.getElementById(`message-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      return true;
    }

    return false;
  }

  type HistoryLoadOptions = {
    preserveScroll?: boolean;
  };

  async function loadOlderMessages(options: HistoryLoadOptions = {}) {
    const targetChatId = chat?.id;
    if (!targetChatId) return false;
    if (historyLoadPromise) {
      return historyLoadPromise;
    }

    const beforeCount = currentChatMessages?.length ?? 0;
    const previousScroll =
      options.preserveScroll && viewportEl
        ? {
            element: viewportEl,
            scrollTop: viewportEl.scrollTop,
            scrollHeight: viewportEl.scrollHeight,
          }
        : null;

    const loadTask = (async () => {
      loadingMoreMessages = true;
      try {
        await chatStore.loadMoreMessages(targetChatId);
        await tick();
        if (
          previousScroll &&
          viewportEl &&
          viewportEl === previousScroll.element
        ) {
          requestAnimationFrame(() => {
            if (!viewportEl || viewportEl !== previousScroll.element) return;
            const newScrollHeight = viewportEl.scrollHeight;
            const delta = newScrollHeight - previousScroll.scrollHeight;
            let nextTop =
              previousScroll.scrollTop + (Number.isFinite(delta) ? delta : 0);
            if (nextTop <= TOP_LOAD_THRESHOLD_PX) {
              nextTop = TOP_LOAD_THRESHOLD_PX + 1;
            }
            viewportEl.scrollTop = nextTop;
          });
        }
        const afterCount = currentChatMessages?.length ?? 0;
        return afterCount > beforeCount;
      } finally {
        loadingMoreMessages = false;
        historyLoadPromise = null;
      }
    })();

    historyLoadPromise = loadTask;
    return loadTask;
  }

  async function scrollToMessage(messageId: string) {
    if (!messageId) {
      return;
    }

    pendingScrollTarget = messageId;

    if (attemptScrollToMessage(messageId)) {
      if (pendingScrollTarget === messageId) {
        pendingScrollTarget = null;
      }
      return;
    }

    const MAX_HISTORY_ATTEMPTS = 10;
    let attempt = 0;
    while (
      pendingScrollTarget === messageId &&
      hasMoreHistory &&
      attempt < MAX_HISTORY_ATTEMPTS
    ) {
      attempt += 1;
      const loaded = await loadOlderMessages();
      if (pendingScrollTarget !== messageId) {
        return;
      }
      if (!loaded) {
        break;
      }
      await tick();
      if (attemptScrollToMessage(messageId)) {
        break;
      }
    }

    if (pendingScrollTarget === messageId) {
      attemptScrollToMessage(messageId);
      pendingScrollTarget = null;
    }
  }

  let currentChatMessages = $derived(
    chat ? $messagesByChatId.get(chat.id) || [] : [],
  );

  $effect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const hasExpiringMessages =
      currentChatMessages?.some((message) => Boolean(message.expiresAt)) ??
      false;

    if (!hasExpiringMessages) {
      return;
    }

    expiryNow = Date.now();
    const interval = setInterval(() => {
      expiryNow = Date.now();
    }, 1_000);

    return () => {
      clearInterval(interval);
    };
  });

  let hasMoreHistory = $derived(
    chat?.id ? ($hasMoreByChatId.get(chat.id) ?? true) : false,
  );

  let isChatLoading = $derived(
    chat ? Boolean($loadingStateByChat.get(chat.id)) : false,
  );

  let showEmptyChannelMessage = $derived(() => {
    if (!chat || chat.type !== "channel") {
      return false;
    }
    if (isChatLoading) {
      return false;
    }
    return (currentChatMessages?.length ?? 0) === 0;
  });

  const messageContentCache: MessageContentCache = new Map();

  let normalizedMessages = $derived(
    buildLowercaseContent(currentChatMessages || [], messageContentCache),
  );

  const searchUsers = $derived(() => {
    const entries = new Map<
      string,
      { id: string; name?: string | null; tag?: string | null }
    >();
    if (!chat) {
      return [] as { id: string; name?: string | null; tag?: string | null }[];
    }
    if (chat.type === "dm" && chat.friend) {
      entries.set(chat.friend.id, {
        id: chat.friend.id,
        name: chat.friend.name ?? chat.friend.id,
        tag: chat.friend.tag ?? null,
      });
    }
    if ((chat.type === "group" || chat.type === "channel") && chat.members) {
      chat.members.forEach((member: User) => {
        entries.set(member.id, {
          id: member.id,
          name: member.name ?? member.id,
          tag: member.tag ?? null,
        });
      });
    }
    const currentUser = $userStore.me;
    if (currentUser) {
      entries.set(currentUser.id, {
        id: currentUser.id,
        name: currentUser.name ?? currentUser.id,
        tag: currentUser.tag ?? null,
      });
    }
    return Array.from(entries.values());
  });

  const userLookup = $derived(() => buildUserLookup(searchUsers()));

  const searchChannels = $derived(() => {
    if (!chat) {
      return [] as { id: string; name?: string | null }[];
    }
    switch (chat.type) {
      case "channel":
        return [{ id: chat.id, name: chat.name }];
      case "group":
        return [{ id: chat.id, name: chat.name }];
      case "dm":
      default:
        return [
          {
            id: chat.id,
            name: chat.friend?.name ?? chat.id,
          },
        ];
    }
  });

  const channelLookup = $derived(() => buildChannelLookup(searchChannels()));

  const searchParseOptions = $derived(() => ({
    lookups: {
      users: userLookup(),
      channels: channelLookup(),
    },
    allowedHas: DEFAULT_HAS_TOKENS,
    allowedAuthorTypes: DEFAULT_AUTHOR_TYPES,
  }));

  let callForChat = $derived.by(() => {
    if (!chat?.id) return null;
    const activeCall = $callStore.activeCall;
    return activeCall && activeCall.chatId === chat.id ? activeCall : null;
  });

  function hangUpCurrentCall() {
    const call = callForChat;
    if (!call) {
      callStore.dismissCall();
      return;
    }
    const reason =
      call.type === "video" ? "Video call ended" : "Voice call ended";
    callStore.endCall(reason);
  }

  function dismissCallStatus() {
    callStore.dismissCall();
  }

  let parsedSearchQuery = $derived(
    parseSearchQuery($chatSearchQueryStore, searchParseOptions()),
  );
  let normalizedQuery = $derived(parsedSearchQuery.normalizedText);
  let activeSearchFilters = $derived(parsedSearchQuery.filters);

  const REMOTE_SEARCH_INITIAL_PAGES = 3;
  type RemoteSearchController = {
    id: number;
    cancelled: boolean;
    cursor: string | null;
    hasMore: boolean;
    running: boolean;
    autoRemaining: number;
    manualHandled: number;
  };
  let activeSearchController: RemoteSearchController | null = null;

  const cancelActiveSearch = () => {
    if (activeSearchController) {
      chatSearchStore.setSearchLoading(activeSearchController.id, false);
      activeSearchController.cancelled = true;
      activeSearchController = null;
    }
  };

  async function fetchSearchPages(
    controller: RemoteSearchController,
    context: {
      chatId: string;
      query: string;
      filters: typeof activeSearchFilters;
    },
  ) {
    if (controller.running) {
      return;
    }

    if (!controller.hasMore) {
      chatSearchStore.setSearchLoading(controller.id, false);
      return;
    }

    const initialManualTarget = get(chatSearchStore).loadMoreRequests;
    const hasPendingAuto = controller.autoRemaining > 0;
    const hasPendingManual = initialManualTarget - controller.manualHandled > 0;
    if (!hasPendingAuto && !hasPendingManual) {
      return;
    }

    controller.running = true;
    chatSearchStore.setSearchLoading(controller.id, true);

    try {
      while (!controller.cancelled && controller.hasMore) {
        const latestManualTarget = get(chatSearchStore).loadMoreRequests;
        const pendingAutoPages = controller.autoRemaining;
        const pendingManualPages =
          latestManualTarget - controller.manualHandled;

        if (pendingAutoPages <= 0 && pendingManualPages <= 0) {
          break;
        }

        const useAutoPage = pendingAutoPages > 0;
        if (useAutoPage) {
          controller.autoRemaining -= 1;
        } else {
          controller.manualHandled += 1;
        }

        try {
          const result = await chatStore.searchMessages({
            chatId: context.chatId,
            query: context.query,
            filters: context.filters,
            cursor: controller.cursor,
          });

          if (controller.cancelled) {
            return;
          }

          const nextHasMore = result.hasMore && result.received > 0;
          const nextCursor = nextHasMore ? result.nextCursor : null;
          controller.cursor = nextCursor;
          controller.hasMore = nextHasMore;

          chatSearchStore.recordSearchPage(controller.id, {
            cursor: nextCursor,
            hasMore: nextHasMore,
            results: result.received,
          });

          if (!nextHasMore) {
            break;
          }
        } catch (error) {
          if (!controller.cancelled) {
            console.error("Failed to search messages", error);
            controller.hasMore = false;
            chatSearchStore.recordSearchPage(controller.id, {
              cursor: null,
              hasMore: false,
              results: 0,
            });
          }
          break;
        }
      }
    } finally {
      controller.running = false;
      if (!controller.cancelled) {
        const latestManualTarget = get(chatSearchStore).loadMoreRequests;
        const pendingAutoPages = controller.autoRemaining;
        const pendingManualPages =
          latestManualTarget - controller.manualHandled;

        const shouldRemainLoading =
          controller.hasMore &&
          (pendingAutoPages > 0 || pendingManualPages > 0);

        chatSearchStore.setSearchLoading(controller.id, shouldRemainLoading);
      }
    }
  }

  let chatSearchMatches = $derived(() => {
    if (!chat?.id) {
      return [];
    }
    return matchNormalizedMessages(normalizedMessages, normalizedQuery, {
      filters: activeSearchFilters,
      messages: currentChatMessages || [],
      cache: messageContentCache,
    });
  });

  $effect(() => {
    chatSearchStore.setMatches(chatSearchMatches());
  });

  $effect(() => {
    const searchState = $chatSearchStore;
    const chatId = chat?.id ?? null;
    if (!chatId) {
      cancelActiveSearch();
      return;
    }

    const trimmed = searchState.query.trim();
    if (!searchState.searching || trimmed.length === 0) {
      const requestId = searchState.searchRequestId;
      if (searchState.loading) {
        chatSearchStore.setSearchLoading(requestId, false);
      }
      cancelActiveSearch();
      return;
    }

    if (
      activeSearchController &&
      activeSearchController.id === searchState.searchRequestId
    ) {
      if (!activeSearchController.cancelled) {
        void fetchSearchPages(activeSearchController, {
          chatId,
          query: trimmed,
          filters: activeSearchFilters,
        });
      }
      return;
    }

    cancelActiveSearch();

    const controller: RemoteSearchController = {
      id: searchState.searchRequestId,
      cancelled: false,
      cursor: null,
      hasMore: true,
      running: false,
      autoRemaining: REMOTE_SEARCH_INITIAL_PAGES,
      manualHandled: searchState.loadMoreRequests,
    };
    activeSearchController = controller;
    void fetchSearchPages(controller, {
      chatId,
      query: trimmed,
      filters: activeSearchFilters,
    });
  });

  onDestroy(() => {
    cancelActiveSearch();
  });

  $effect(() => {
    if (!editingMessageId) return;
    const exists =
      currentChatMessages?.some((msg) => msg.id === editingMessageId) ?? false;
    if (!exists) {
      cancelEditingMessage();
    }
  });

  function handlePaste(e: ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const it of items as any) {
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      addAttachments(files);
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    const dt = e.dataTransfer;
    if (!dt?.files?.length) return;
    addAttachments(Array.from(dt.files));
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
  }

  function handleMessageContextMenu(e: MouseEvent, msg: Message) {
    e.preventDefault();
    selectedMsg = msg;
    msgMenuX = e.clientX;
    msgMenuY = e.clientY;
    showMsgMenu = true;
  }

  const REACTION_EMOJIS = ["❤️", "😂", "👍", "🔥"] as const;
  const reactionOptions = REACTION_EMOJIS.map((emoji) => ({
    emoji,
    action: `react_${emoji}` as const,
  }));
  const reactionMenuItems = $derived(() =>
    canAddMessageReactions()
      ? reactionOptions.map(({ emoji, action }) => ({
          label: `React ${emoji}`,
          action,
        }))
      : [],
  );
  const reactionActionMap = new Map(
    reactionOptions.map(({ action, emoji }) => [action, emoji] as const),
  );
  type ReactionAction = (typeof reactionOptions)[number]["action"];
  type MessageMenuItem = {
    label: string;
    action: string;
    disabled?: boolean;
    isDestructive?: boolean;
  };

  let reactionPickerChatId = $state<string | null>(null);
  let reactionPickerMessageId = $state<string | null>(null);
  let reactionPickerActivator: HTMLButtonElement | null = null;

  const baseMessageMenuItems = $derived(() => {
    const items: MessageMenuItem[] = [
      { label: "Copy Message", action: "copy_message" },
      { label: "Copy Message Link", action: "copy_message_link" },
    ];
    items.push({
      label: "Report Message",
      action: "report_message",
      isDestructive: true,
    });
    if (canSendMessages()) {
      items.push({ label: "Reply", action: "reply_message" });
    }
    return items;
  });

  function handleMessageMenuAction({ action }: { action: string }) {
    if (!selectedMsg) return;

    const reactionEmoji = reactionActionMap.get(action as ReactionAction);
    if (reactionEmoji) {
      if (!canAddMessageReactions()) {
        toasts.addToast(
          "You do not have permission to add reactions in this channel.",
          "warning",
        );
        showMsgMenu = false;
        return;
      }
      chatStore.addReaction(selectedMsg.chatId, selectedMsg.id, reactionEmoji);
      showMsgMenu = false;
      return;
    }

    switch (action) {
      case "copy_message":
        showMsgMenu = false;
        void writeTextToClipboard(selectedMsg.content ?? "").then((success) => {
          toasts.addToast(
            success ? "Message copied." : "Failed to copy message.",
            success ? "success" : "error",
          );
        });
        break;
      case "copy_message_link":
        showMsgMenu = false;
        void chatStore
          .copyMessageLink(selectedMsg.id, selectedMsg.chatId)
          .then(() => {
            toasts.addToast("Message link copied.", "success");
          })
          .catch((error) => {
            console.error("Failed to copy message link:", error);
            toasts.addToast("Failed to copy message link.", "error");
          });
        break;
      case "report_message":
        if (!openReportMessageModal) {
          toasts.addToast("Reporting is currently unavailable.", "error");
          break;
        }
        openReportMessageModal(buildReportMessagePayload(selectedMsg));
        break;
      case "reply_message":
        if (!canSendMessages()) {
          toasts.addToast(
            "You do not have permission to send messages in this channel.",
            "warning",
          );
          break;
        }
        enterReplyMode(selectedMsg);
        break;
      case "edit_message":
        if (selectedMsg.senderId === $userStore.me?.id) {
          startEditingMessage(selectedMsg);
        } else {
          toasts.addToast("Cannot edit others' messages.", "warning");
        }
        break;
      case "delete_message":
        if (selectedMsg.senderId === $userStore.me?.id) {
          chatStore.deleteMessage(selectedMsg.chatId, selectedMsg.id);
        } else {
          toasts.addToast("Cannot delete others' messages.", "warning");
        }
        break;
      case "pin_message":
        if (!canManageMessages()) {
          toasts.addToast(
            "You do not have permission to manage messages in this channel.",
            "warning",
          );
          break;
        }
        void chatStore
          .pinMessage(selectedMsg.chatId, selectedMsg.id)
          .catch((error) => {
            console.error("Failed to pin message", error);
            toasts.addToast("Failed to pin message.", "error");
          });
        break;
      case "unpin_message":
        if (!canManageMessages()) {
          toasts.addToast(
            "You do not have permission to manage messages in this channel.",
            "warning",
          );
          break;
        }
        void chatStore
          .unpinMessage(selectedMsg.chatId, selectedMsg.id)
          .catch((error) => {
            console.error("Failed to unpin message", error);
            toasts.addToast("Failed to unpin message.", "error");
          });
        break;
      default:
        console.debug("Unhandled message action", action);
    }
    showMsgMenu = false;
  }

  function openReactionPicker(event: MouseEvent, msg: Message) {
    if (!canAddMessageReactions()) {
      return;
    }
    const button = event.currentTarget as HTMLButtonElement | null;
    if (!button) return;

    if (reactionPickerMessageId === msg.id) {
      closeReactionPicker();
      return;
    }

    reactionPickerChatId = msg.chatId;
    reactionPickerMessageId = msg.id;
    reactionPickerActivator = button;
  }

  function closeReactionPicker() {
    const activator = reactionPickerActivator;
    reactionPickerChatId = null;
    reactionPickerMessageId = null;
    reactionPickerActivator = null;
    activator?.focus();
  }

  function handleReactionSelect(emoji: string) {
    if (!reactionPickerChatId || !reactionPickerMessageId) return;
    if (!canAddMessageReactions()) {
      closeReactionPicker();
      return;
    }
    chatStore.addReaction(reactionPickerChatId, reactionPickerMessageId, emoji);
    closeReactionPicker();
  }

  async function startEditingMessage(msg: Message) {
    editingMessageId = msg.id;
    editingDraft = msg.content;
    editingSaving = false;
    selectedMsg = null;
    showMsgMenu = false;
    await tick();
    if (editingTextarea) {
      editingTextarea.focus();
      const length = editingTextarea.value.length;
      editingTextarea.setSelectionRange?.(length, length);
    }
  }

  function cancelEditingMessage() {
    editingMessageId = null;
    editingDraft = "";
    editingSaving = false;
  }

  async function submitMessageEdit(msg: Message) {
    if (!editingMessageId) return;
    const trimmed = editingDraft.trim();
    if (!trimmed) {
      toasts.addToast("Message content cannot be empty.", "warning");
      return;
    }
    if (
      chat?.type === "channel" &&
      !canMentionEveryone() &&
      extractSpecialMentionKeys(trimmed).size > 0
    ) {
      toasts.addToast(SPECIAL_MENTION_PERMISSION_WARNING, "warning");
      return;
    }
    editingSaving = true;
    try {
      await chatStore.editMessage(msg.chatId, msg.id, trimmed);
      cancelEditingMessage();
    } catch (error) {
      console.error("Failed to edit message", error);
      toasts.addToast("Failed to update message.", "error");
    } finally {
      editingSaving = false;
    }
  }

  function handleEditKeydown(event: KeyboardEvent, msg: Message) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelEditingMessage();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      submitMessageEdit(msg);
    }
  }

  function handleEditChannelClick() {
    if (!chat?.serverId || chat.type !== "channel") {
      return;
    }
    void goto(`/channels/${chat.serverId}/settings?tab=channels`);
  }
</script>

<FileTransferApprovals />
<FileTransferHistory />

<div class="grow min-h-0 flex flex-col bg-card/50">
  {#if chat}
    <div class="flex min-h-0 grow flex-col">
      {#if callForChat}
        <div class="px-4 pt-4">
          <CallStatusBanner
            call={callForChat}
            onLeave={hangUpCurrentCall}
            onDismiss={dismissCallStatus}
          />
        </div>
      {/if}
      <div class="grow min-h-0 relative">
        <VirtualList
          items={currentChatMessages}
          mode="bottomToTop"
          defaultEstimatedItemHeight={messageDensity === "compact" ? 64 : 80}
          viewportClass={`virtual-list-viewport ${densityClass(
            "p-4",
            "p-2",
          )} chat-viewport${(currentChatMessages?.length ?? 0) > 0 ? " chat-has-messages" : ""}`}
          bind:this={listRef}
        >
          {#snippet renderItem(msg, index)}
            {@const isMe = msg.senderId === myId}
            {@const senderInfo =
              chat.type === "dm" ? chat.friend : memberById.get(msg.senderId)}
            {@const senderName = isMe
              ? $userStore.me?.name
              : senderInfo?.name || "Unknown User"}
            {@const senderAvatar = isMe
              ? $userStore.me?.avatar
              : senderInfo?.avatar}
            {@const displayableUser = isMe ? $userStore.me : senderInfo}
            {#if loadingMoreMessages && index === 0}
              <div
                class="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground"
              >
                <LoaderCircle class="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>Loading previous messages…</span>
              </div>
            {/if}
            <div
              class={`transition-colors duration-150 ${densityClass(
                "space-y-6 px-4 py-3 rounded-2xl",
                "space-y-3 px-3 py-2 rounded-xl",
              )} hover:bg-zinc-900/60`}
              use:captureViewport
              id={`message-${msg.id}`}
            >
              <div
                class={`flex items-start ${isMe ? "flex-row-reverse" : ""} ${
                  showMessageAvatars
                    ? densityClass("gap-3", "gap-2")
                    : densityClass("gap-0", "gap-1")
                }`}
              >
                {#if showMessageAvatars}
                  <button
                    onclick={(e) =>
                      displayableUser &&
                      openUserCardModal?.(
                        displayableUser as User,
                        e.clientX,
                        e.clientY,
                        chat.type === "channel" && Boolean(chat.serverId),
                      )}
                    oncontextmenu={(e) =>
                      displayableUser && handleContextMenu(e, displayableUser)}
                    class="w-10 h-10 rounded-full shrink-0 cursor-pointer"
                  >
                    <img
                      src={senderAvatar}
                      alt={senderName}
                      class="w-full h-full rounded-full"
                    />
                  </button>
                {/if}
                <div class="flex flex-col {isMe ? 'items-end' : ''}">
                  <div class="flex items-center gap-2 mb-1">
                    {#if msg.expiresAt}
                      {@const expiryTimestamp = Date.parse(msg.expiresAt)}
                      {#if !Number.isNaN(expiryTimestamp)}
                        {@const remainingMs = expiryTimestamp - expiryNow}
                        {@const expiryLabel = formatExpiryLabel(remainingMs)}
                        {@const expiryTone = resolveExpiryTone(remainingMs)}
                        {@const expiryAriaLabel =
                          expiryLabel === "Expired"
                            ? "Message expired"
                            : `Message ${expiryLabel.toLowerCase()}`}
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <span
                                class={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide ${expiryIndicatorToneClasses[expiryTone]}`}
                                aria-live="polite"
                                aria-label={expiryAriaLabel}
                              >
                                <Timer class="h-3 w-3" aria-hidden="true" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <div class="space-y-0.5">
                                <p class="text-xs font-semibold text-white leading-none">
                                  {expiryLabel}
                                </p>
                                <p class="text-[0.65rem] text-muted-foreground leading-none">
                                  {formatExpiryTooltip(expiryTimestamp, remainingMs)}
                                </p>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      {/if}
                    {/if}
                    {#if showMessageTimestamps}
                      <p class="text-xs text-muted-foreground">
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    {/if}
                    <MessageAuthorName
                      chatType={chat.type}
                      channelId={chat.type === "channel" ? chat.id : null}
                      senderName={senderName ?? ""}
                      className="font-bold text-white hover:underline cursor-pointer"
                      onNameClick={(e) =>
                        displayableUser &&
                        openUserCardModal?.(
                        displayableUser as User,
                        e.clientX,
                        e.clientY,
                        chat.type === "channel" && Boolean(chat.serverId),
                      )}
                      onNameContextMenu={(e) =>
                        displayableUser &&
                        handleContextMenu(e, displayableUser)}
                    />
                    {#if typeof msg.authorType === "string"}
                      {@const normalizedAuthorType =
                        msg.authorType.toLowerCase() as MessageAuthorType}
                      {#if normalizedAuthorType !== "user"}
                        {@const badgeMeta =
                          AUTHOR_TYPE_META[
                            normalizedAuthorType as AutomatedAuthorType
                          ]}
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <span
                                class="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-secondary-foreground"
                                aria-label={badgeMeta.tooltip}
                              >
                                <badgeMeta.icon
                                  class="size-3"
                                  aria-hidden="true"
                                />
                                <span>{badgeMeta.label}</span>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              {badgeMeta.tooltip}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      {/if}
                    {/if}
                    {#if msg.editedAt}
                      <span
                        class="text-[0.625rem] uppercase tracking-wide text-muted-foreground/80"
                      >
                        (edited)
                      </span>
                    {/if}
                  </div>
                  {#if msg.isSpamFlagged && msg.spamDecision !== "allowed"}
                    <div
                      class="max-w-md rounded-lg border border-status-warning/60 bg-status-warning/10 p-3 text-sm text-status-warning-foreground"
                    >
                      <p class="font-semibold flex items-center gap-2">
                        Message hidden
                        <span class="text-xs font-normal text-muted-foreground">
                          Score {(msg.spamScore ?? 0).toFixed(2)}
                        </span>
                      </p>
                      {#if msg.spamReasons?.length}
                        <ul
                          class="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground"
                        >
                          {#each msg.spamReasons as reason, idx (idx)}
                            <li>{reason}</li>
                          {/each}
                        </ul>
                      {/if}
                      <div class="mt-3 flex flex-wrap gap-2">
                        <button
                          class="rounded-md bg-success px-3 py-1 text-xs font-semibold text-foreground hover:bg-success/80"
                          onclick={() => allowSpamMessage(msg)}
                        >
                          Allow message
                        </button>
                        <button
                          class="rounded-md bg-status-warning px-3 py-1 text-xs font-semibold text-foreground hover:bg-status-warning/80"
                          onclick={() => keepSpamMessageMuted(msg)}
                        >
                          Keep muted
                        </button>
                      </div>
                    </div>
                  {:else if showDeletedTombstones() && msg.deleted}
                    <div
                      class="max-w-md rounded-lg border border-dashed border-muted-foreground/40 bg-muted/20 px-3 py-2 text-sm text-muted-foreground"
                    >
                      <p class="italic">
                        Message deleted
                        {#if msg.deletedBy}
                          · removed by
                          {msg.deletedBy === myId
                            ? "you"
                            : (memberById.get(msg.deletedBy)?.name ??
                              "a moderator")}
                        {/if}
                        {#if msg.deletedAt}
                          ·
                          {new Date(msg.deletedAt).toLocaleString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        {/if}
                      </p>
                    </div>
                  {:else if msg.content}
                    <div
                      class="max-w-md p-3 text-white"
                      role="button"
                      tabindex="0"
                      aria-label="Message options"
                      oncontextmenu={(e) => {
                        if (editingMessageId === msg.id) {
                          e.preventDefault();
                          return;
                        }
                        handleMessageContextMenu(e, msg);
                      }}
                      onkeydown={(e) => {
                        if (editingMessageId === msg.id) {
                          return;
                        }
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleMessageContextMenu(e as any as MouseEvent, msg);
                        }
                      }}
                    >
                      {#if msg.replyToMessageId}
                        <button
                          type="button"
                          class="mb-2 w-full rounded-md bg-black/20 px-3 py-2 text-left text-xs text-white/80 hover:bg-black/30 focus:outline-none"
                          onclick={() =>
                            void scrollToMessage(msg.replyToMessageId ?? "")}
                        >
                          <p
                            class="font-semibold text-[0.65rem] uppercase tracking-wide text-white/60"
                          >
                            Replying to {msg.replySnapshot?.author ?? "message"}
                          </p>
                          {#if msg.replySnapshot?.snippet}
                            <p
                              class="mt-1 text-sm text-white/90 overflow-hidden text-ellipsis whitespace-nowrap"
                            >
                              {msg.replySnapshot.snippet}
                            </p>
                          {/if}
                        </button>
                      {/if}
                      {#if editingMessageId === msg.id}
                        <form
                          class="space-y-2"
                          onsubmit={(e) => {
                            e.preventDefault();
                            submitMessageEdit(msg);
                          }}
                        >
                          <textarea
                            class="w-full resize-none rounded-md bg-zinc-800 p-2 text-sm text-white focus:outline-none"
                            rows="3"
                            bind:value={editingDraft}
                            bind:this={editingTextarea}
                            disabled={editingSaving}
                            onkeydown={(event) => handleEditKeydown(event, msg)}
                          ></textarea>
                          <div
                            class="flex items-center justify-end gap-2 text-sm"
                          >
                            <button
                              type="button"
                              class="rounded-md px-2 py-1 text-muted-foreground hover:text-white disabled:opacity-60"
                              onclick={cancelEditingMessage}
                              disabled={editingSaving}
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              class="rounded-md bg-cyan-600 px-3 py-1 text-white hover:bg-cyan-700 disabled:bg-cyan-800 disabled:cursor-not-allowed"
                              disabled={editingSaving ||
                                editingDraft.trim().length === 0}
                            >
                              {editingSaving ? "Saving..." : "Save"}
                            </button>
                          </div>
                        </form>
                      {:else if $chatSearchStore.query}
                        <p
                          class="text-base whitespace-pre-wrap wrap-break-word"
                        >
                          {#each highlightText(msg.content, $chatSearchStore.query) as part, i (i)}
                            {@const segments = formatMessageSegments(part.text)}
                            {#if part.match}
                              <mark class="bg-yellow-500/60 text-white">
                                {#each segments as segment, segIndex (segIndex)}
                                  {#if segment.type === "text"}
                                    {@html segment.html}
                                  {:else if segment.type === "mention"}
                                    <span
                                      class="font-semibold text-white"
                                      data-mention-id={segment.id}
                                    >
                                      @{segment.name}
                                    </span>
                                  {:else if segment.type === "channel"}
                                    <span
                                      class="font-semibold text-cyan-300"
                                      data-channel-id={segment.id}
                                    >
                                      #{segment.name}
                                    </span>
                                  {:else if segment.type === "role"}
                                    <span
                                      class="font-semibold text-emerald-300"
                                      data-role-id={segment.id}
                                    >
                                      @{segment.name}
                                    </span>
                                  {:else if segment.type === "special"}
                                    <span
                                      class="font-semibold text-amber-300"
                                      data-special-mention={segment.key}
                                    >
                                      {segment.name}
                                    </span>
                                  {:else if segment.type === "link"}
                                    <a
                                      href={segment.url}
                                      rel="noreferrer noopener"
                                      target="_blank"
                                      class="underline wrap-break-word text-cyan-200 hover:text-white"
                                    >
                                      {segment.label}
                                    </a>
                                  {/if}
                                {/each}
                              </mark>
                            {:else}
                              {#each segments as segment, segIndex (segIndex)}
                                {#if segment.type === "text"}
                                  {@html segment.html}
                                {:else if segment.type === "mention"}
                                  <span
                                    class="font-semibold text-white"
                                    data-mention-id={segment.id}
                                  >
                                    @{segment.name}
                                  </span>
                                {:else if segment.type === "channel"}
                                  <span
                                    class="font-semibold text-cyan-300"
                                    data-channel-id={segment.id}
                                  >
                                    #{segment.name}
                                  </span>
                                {:else if segment.type === "role"}
                                  <span
                                    class="font-semibold text-emerald-300"
                                    data-role-id={segment.id}
                                  >
                                    @{segment.name}
                                  </span>
                                {:else if segment.type === "special"}
                                  <span
                                    class="font-semibold text-amber-300"
                                    data-special-mention={segment.key}
                                  >
                                    {segment.name}
                                  </span>
                                {:else if segment.type === "link"}
                                  <a
                                    href={segment.url}
                                    rel="noreferrer noopener"
                                    target="_blank"
                                    class="underline wrap-break-word text-cyan-200 hover:text-white"
                                  >
                                    {segment.label}
                                  </a>
                                {/if}
                              {/each}
                            {/if}
                          {/each}
                        </p>
                      {:else}
                        {@const segments = formatMessageSegments(msg.content)}
                        <p
                          class="text-base whitespace-pre-wrap wrap-break-word"
                        >
                          {#each segments as segment, segIndex (segIndex)}
                            {#if segment.type === "text"}
                              {@html segment.html}
                            {:else if segment.type === "mention"}
                              <span
                                class="font-semibold text-white"
                                data-mention-id={segment.id}
                              >
                                @{segment.name}
                              </span>
                            {:else if segment.type === "channel"}
                              <span
                                class="font-semibold text-cyan-300"
                                data-channel-id={segment.id}
                              >
                                #{segment.name}
                              </span>
                            {:else if segment.type === "role"}
                              <span
                                class="font-semibold text-emerald-300"
                                data-role-id={segment.id}
                              >
                                @{segment.name}
                              </span>
                            {:else if segment.type === "special"}
                              <span
                                class="font-semibold text-amber-300"
                                data-special-mention={segment.key}
                              >
                                {segment.name}
                              </span>
                            {:else if segment.type === "link"}
                              <a
                                href={segment.url}
                                rel="noreferrer noopener"
                                target="_blank"
                                class="underline wrap-break-word text-cyan-200 hover:text-white"
                              >
                                {segment.label}
                              </a>
                            {/if}
                          {/each}
                        </p>
                        {#if $settings.enableLinkPreviews}
                          {@const previewUrl = extractFirstLink(
                            msg.content ?? "",
                          )}
                          {#if previewUrl}
                            <div class="mt-2">
                              <LinkPreview url={previewUrl} />
                            </div>
                          {/if}
                        {/if}
                      {/if}
                      {#if showTransparentEditHistory() && msg.editHistory?.length}
                        <div
                          class="mt-3 space-y-1 border-t border-white/10 pt-2 text-xs text-white/80"
                        >
                          <p
                            class="text-[0.625rem] uppercase tracking-wide opacity-70"
                          >
                            Edit history
                          </p>
                          {#each [...msg.editHistory].reverse() as previous, historyIndex (historyIndex)}
                            <p
                              class="whitespace-pre-wrap wrap-break-word text-white/80"
                            >
                              {previous}
                            </p>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  {/if}
                  {#if msg.reactions}
                    <div class="mt-1 flex gap-1 flex-wrap">
                      {#each Object.entries(msg.reactions) as [emoji, users] (emoji)}
                        <button
                          type="button"
                          class="px-2 py-0.5 text-sm rounded-full bg-zinc-600 hover:bg-zinc-500"
                          class:cursor-pointer={canAddMessageReactions()}
                          class:cursor-not-allowed={!canAddMessageReactions()}
                          class:opacity-50={!canAddMessageReactions()}
                          aria-pressed={users.includes(myId || "")}
                          onclick={() => {
                            if (!canAddMessageReactions()) {
                              return;
                            }
                            if (users.includes(myId || "")) {
                              chatStore.removeReaction(
                                msg.chatId,
                                msg.id,
                                emoji,
                              );
                            } else {
                              chatStore.addReaction(msg.chatId, msg.id, emoji);
                            }
                          }}
                          disabled={!canAddMessageReactions()}
                          aria-disabled={!canAddMessageReactions()}
                        >
                          {emoji}
                          {users.length}
                        </button>
                      {/each}
                      {#if canAddMessageReactions()}
                        <div class="relative inline-block">
                          <button
                            type="button"
                            class="px-2 py-0.5 text-sm rounded-full bg-zinc-600 hover:bg-zinc-500 cursor-pointer"
                            onclick={(event) => openReactionPicker(event, msg)}
                            aria-label="Add reaction"
                            aria-haspopup="dialog"
                            aria-expanded={reactionPickerMessageId === msg.id}
                          >
                            + React
                          </button>
                          {#if reactionPickerMessageId === msg.id}
                            <div
                              class="absolute left-0 z-30 mt-2"
                              role="presentation"
                              onclick={(event) => event.stopPropagation()}
                              onkeydown={(event) => event.stopPropagation()}
                            >
                              <EmojiPicker
                                emojiCategories={emojiPickerCategories() ?? undefined}
                                fallbackUsed={emojiPickerFallbackUsed()}
                                on:select={(event) =>
                                  handleReactionSelect(event.detail.emoji)}
                                on:close={closeReactionPicker}
                              />
                            </div>
                          {/if}
                        </div>
                      {/if}
                    </div>
                  {:else if canAddMessageReactions()}
                    <div class="mt-1">
                      <div class="relative inline-block">
                        <button
                          type="button"
                          class="px-2 py-0.5 text-xs rounded-full bg-zinc-600 hover:bg-zinc-500 cursor-pointer"
                          onclick={(event) => openReactionPicker(event, msg)}
                          aria-label="Add reaction"
                          aria-haspopup="dialog"
                          aria-expanded={reactionPickerMessageId === msg.id}
                        >
                          + React
                        </button>
                        {#if reactionPickerMessageId === msg.id}
                          <div
                            class="absolute left-0 z-30 mt-2"
                            role="presentation"
                            onclick={(event) => event.stopPropagation()}
                            onkeydown={(event) => event.stopPropagation()}
                          >
                            <EmojiPicker
                              emojiCategories={emojiPickerCategories() ?? undefined}
                              fallbackUsed={emojiPickerFallbackUsed()}
                              on:select={(event) =>
                                handleReactionSelect(event.detail.emoji)}
                              on:close={closeReactionPicker}
                            />
                          </div>
                        {/if}
                      </div>
                    </div>
                  {/if}
                  {#if msg.embeds && msg.embeds.length > 0}
                    <div class="mt-2 space-y-2">
                      {#each msg.embeds as embed, index (embed.id ?? `${embed.url ?? index}`)}
                        <MessageEmbed {embed} />
                      {/each}
                    </div>
                  {/if}
                  {#if msg.attachments && msg.attachments.length > 0}
                    <div class="mt-2 space-y-2">
                      {#each msg.attachments as attachment (attachment.id)}
                        <div
                          role="button"
                          tabindex="-1"
                          aria-label="Attachment options"
                          oncontextmenu={(event) =>
                            handleMessageContextMenu(event, msg)}
                        >
                          <FilePreview
                            variant="message"
                            {attachment}
                            chatId={msg.chatId}
                            messageId={msg.id}
                            onOpen={openLightbox}
                          />
                        </div>
                      {/each}
                    </div>
                  {/if}
                  {#if msg}
                    {@const deliveryState = resolveMessageDeliveryState(
                      msg,
                    ) as { state: MessageDeliveryState; reason?: string }}
                    {#if deliveryState}
                      <div
                        class={`mt-1 flex items-center gap-2 text-[0.625rem] ${
                          deliveryState.state === "failed"
                            ? "text-destructive/90"
                            : "text-muted-foreground/80"
                        }`}
                        role={deliveryState.state === "sent"
                          ? undefined
                          : "status"}
                        aria-live={deliveryState.state === "sent"
                          ? "off"
                          : "polite"}
                        aria-atomic={deliveryState.state === "sent"
                          ? undefined
                          : "true"}
                      >
                        {#if deliveryState.state === "pending"}
                          <LoaderCircle
                            class="h-3 w-3 animate-spin"
                            aria-hidden="true"
                          />
                          <span>Sending…</span>
                        {:else if deliveryState.state === "failed"}
                          <CircleAlert class="h-3 w-3" aria-hidden="true" />
                          <span
                            >{deliveryState.reason ??
                              "Message failed to send"}</span
                          >
                          {#if isMe && msg.status === "failed" && msg.retryable}
                            <button
                              type="button"
                              class="text-xs font-semibold text-cyan-300 underline underline-offset-2 hover:text-cyan-200"
                              onclick={() => void retryFailedMessage(msg)}
                            >
                              Retry message
                            </button>
                          {/if}
                        {:else}
                          <span class="uppercase tracking-wide">
                            {isMe
                              ? msg.read
                                ? "Read by recipient"
                                : "Not read yet"
                              : msg.read
                                ? "Read"
                                : "Unread"}
                          </span>
                        {/if}
                      </div>
                    {/if}
                  {/if}
                </div>
              </div>
            </div>
          {/snippet}
        </VirtualList>

        {#if showEmptyChannelMessage()}
          <div class="pointer-events-none absolute bottom-4 flex justify-start">
            <div class="pointer-events-auto max-w-sm p-4 text-sm">
              <div class="mb-3 flex justify-left">
                <div class="flex h-18 w-18 items-center justify-center rounded-full bg-muted/80 text-muted-foreground">
                  {#if chat?.channelType === "voice"}
                    <MessageCircle size={40} />
                  {:else}
                    <Hash size={40} />
                  {/if}
                </div>
              </div>
              <h1 class="text-4xl font-bold text-foreground whitespace-nowrap">
                Welcome to #{chat.name}!
              </h1>
              <p class="text-base text-muted-foreground">
                This is the start of the #{chat.name} channel.
              </p>
              <Button
                variant="outline"
                size="sm"
                class="mt-3 w-fit"
                onclick={handleEditChannelClick}
              >
                <Pencil size={16} />
                Edit Channel
              </Button>
            </div>
          </div>
        {/if}

        {#if unseenCount > 0}
          <button
            class="absolute right-4 bottom-4 bg-zinc-900/90 text-white text-xs px-3 py-1.5 rounded-full shadow-lg shadow-black/60 hover:bg-zinc-800/80 transition-colors focus-visible:outline-none focus-visible:ring focus-visible:ring-cyan-500/70 cursor-pointer"
            onclick={scrollToBottom}
            aria-live="polite"
          >
            New messages ({unseenCount})
          </button>
        {/if}
      </div>

      <footer class="p-2">
        {#if replyPreview}
          <div
            class="mb-2 flex items-center justify-between rounded-md border border-zinc-700/40 bg-muted/60 px-3 py-2 text-sm"
          >
            <div class="mr-2 min-w-0">
              <p class="text-xs uppercase tracking-wide text-muted-foreground">
                Replying to {replyPreview.author ?? "message"}
              </p>
              {#if replyPreview.snippet}
                <p class="truncate text-sm text-white/90">
                  {replyPreview.snippet}
                </p>
              {/if}
            </div>
            <button
              type="button"
              class="text-xs font-medium text-muted-foreground hover:text-white"
              onclick={cancelReply}
            >
              Cancel
            </button>
          </div>
        {/if}
        {#if slowmodeActive() && slowmodeRemainingSeconds > 0}
          <div
            class="mb-2 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100"
            role="status"
            aria-live="polite"
          >
            <Timer class="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span class="flex-1">
              Slowmode enabled. You can send another message in
              {" "}{formatSlowmodeCountdown(slowmodeRemainingSeconds)}.
            </span>
          </div>
        {/if}
        {#if canSendMessages() && attachedFiles.length > 0}
          <div class="p-2 mb-2 border-b border-zinc-700/50">
            <p class="text-sm font-semibold mb-2 text-zinc-300">Attachments</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {#each attachedFiles as file, i (i)}
                <FilePreview {file} onRemove={removeAttachment} />
              {/each}
            </div>
          </div>
        {/if}
        {#if canSendMessages()}
          <form
            onsubmit={sendMessage}
            class="flex items-center bg-muted/50 rounded-lg pr-2 py-2 border border-transparent focus-within:border-zinc-600 transition-all"
            onpaste={handlePaste}
            ondrop={handleDrop}
            ondragover={handleDragOver}
          >
            <input
              type="file"
              multiple
              bind:this={fileInput}
              onchange={handleFileSelect}
              class="hidden"
              aria-disabled={!canAttachFiles()}
            />
            <Popover.Root>
              <Popover.Trigger
                type="button"
                class="p-2 text-muted-foreground transition-colors hover:text-white cursor-pointer"
                aria-label="Composer actions"
              >
                <Plus size={20} />
              </Popover.Trigger>
              <Popover.Content
                side="top"
                align="start"
                sideOffset={2}
                class="w-48 border border-border bg-card p-2"
              >
                <div class="flex flex-col gap-1 items-start">
                  <Button
                    variant="ghost"
                    onclick={handleComposerAttachFile}
                    disabled={!canAttachFiles()}
                    class="justify-start w-full"
                  >
                    <Link size={16} />
                    Upload a File
                  </Button>
                  <Button
                    variant="ghost"
                    onclick={handleMicClick}
                    disabled={!voiceMemoControlEnabled()}
                    class={popoverVoiceButtonClasses()}
                    aria-pressed={isRecording}
                    aria-disabled={!voiceMemoControlEnabled()}
                    aria-label={voiceMemoControlEnabled()
                      ? isRecording
                        ? "Stop recording voice message"
                        : "Record voice message"
                      : (voiceMemoRestrictionMessage() ??
                        "Voice memos are unavailable")}
                    title={voiceMemoControlEnabled()
                      ? isRecording
                        ? "Stop recording voice message"
                        : "Record voice message"
                      : (voiceMemoRestrictionMessage() ??
                        "Voice memos are unavailable")}
                  >
                    {#if isRecording}
                      <Square size={16} />
                    {:else}
                      <Mic size={16} />
                    {/if}
                    Record Voice
                  </Button>
                  <Button
                    variant="ghost"
                    onclick={handleComposerCreateThread}
                    class="justify-start w-full"
                  >
                    <Users size={16} />
                    Create Thread
                  </Button>
                  <Button
                    variant="ghost"
                    onclick={handleComposerCreatePoll}
                    class="justify-start w-full"
                  >
                    <Bot size={16} />
                    Create Poll
                  </Button>
                </div>
              </Popover.Content>
            </Popover.Root>
            <div class="relative mx-2 flex-1">
              <textarea
                rows="1"
                placeholder={`Message ${
                  chat.type === "dm"
                    ? `@${chat.friend.name}`
                    : chat.type === "group"
                      ? chat.name
                      : `#${chat.name}`
                }`}
                class="w-full bg-transparent resize-none focus:outline-none text-white placeholder-zinc-400"
                bind:value={messageInput}
                bind:this={textareaRef}
                oninput={(event) => {
                  adjustTextareaHeight();
                  handleComposerInput(event);
                }}
                onfocus={(event) => {
                  adjustTextareaHeight();
                  handleComposerFocus();
                }}
                onblur={handleComposerBlur}
                onkeyup={handleComposerKeyup}
                onpointerup={handleComposerPointerUp}
                title="Press Enter to send. Use Shift+Enter for a newline."
                onkeydown={handleComposerKeydown}
              ></textarea>
              {#if $mentionSuggestions.active}
                <div
                  class="absolute bottom-full left-0 right-0 z-30 mb-2 overflow-hidden rounded-md border border-zinc-700/70 bg-zinc-900/95 shadow-lg backdrop-blur"
                >
                  <ul class="max-h-48 overflow-auto py-1">
                    {#each $mentionSuggestions.suggestions as suggestion, index (suggestion.id)}
                      <li>
                        <button
                          type="button"
                          class={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-white/90 hover:bg-zinc-700/60 ${
                            index === $mentionSuggestions.activeIndex
                              ? "bg-zinc-700/80"
                              : ""
                          }`}
                          onpointerdown={() => handleMentionSelection(index)}
                          onclick={() => handleMentionSelection(index)}
                        >
                          {#if suggestion.avatar}
                            <img
                              src={suggestion.avatar}
                              alt={suggestion.name}
                              class="h-6 w-6 rounded-full object-cover"
                            />
                          {:else}
                            <div
                              class={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${getMentionCandidateBadgeClasses(suggestion)}`}
                            >
                              {getMentionCandidateBadge(suggestion)}
                            </div>
                          {/if}
                          <div class="min-w-0">
                            <p class="truncate text-sm font-medium text-white">
                              {formatMentionCandidateLabel(suggestion)}
                            </p>
                            {#if suggestion.kind === "user" && suggestion.tag}
                              <p class="text-xs text-zinc-400">
                                @{suggestion.tag}
                              </p>
                            {/if}
                          </div>
                        </button>
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}
            </div>
            <div class="relative ml-1">
              <div class="flex items-center gap-2" bind:this={composerPickerTriggerEl}>
                <button
                  type="button"
                  class="flex items-center justify-center p-2 text-muted-foreground rounded-full transition-colors"
                  class:hover:text-white={canUseComposerEmoji()}
                  class:cursor-pointer={canUseComposerEmoji()}
                  class:cursor-not-allowed={!canUseComposerEmoji()}
                  class:opacity-50={!canUseComposerEmoji()}
                  aria-label={canUseComposerEmoji()
                    ? "Insert emoji"
                    : "Emoji insertion is disabled in this channel"}
                  aria-haspopup="dialog"
                  aria-expanded={showComposerPicker}
                  aria-controls={composerPickerId()}
                  onclick={() => toggleComposerPicker("emoji")}
                  disabled={!canUseComposerEmoji()}
                  aria-disabled={!canUseComposerEmoji()}
                  title={canUseComposerEmoji()
                    ? "Insert emoji"
                    : "You do not have permission to use emojis in this channel."}
                >
                  <Smile size={20} />
                </button>
                <button
                  type="button"
                  class="flex items-center justify-center p-2 text-muted-foreground rounded-full transition-colors hover:text-white cursor-pointer"
                  aria-label="Open GIFs picker"
                  aria-haspopup="dialog"
                  aria-expanded={showComposerPicker}
                  aria-controls={composerPickerId()}
                  title="GIFs picker"
                  onclick={() => toggleComposerPicker("gif")}
                >
                  <Clapperboard size={20} />
                </button>
              </div>
              {#if showComposerPicker}
                <div
                  class="absolute bottom-full right-0 z-30 mb-4"
                  id={composerPickerId()}
                  bind:this={composerPickerEl}
                  role="presentation"
                >
                  <div class="w-[496px] h-[468px] overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 shadow-[0_24px_60px_rgba(0,0,0,0.65)]">
                    <Tabs
                      value={composerPickerTab}
                      onValueChange={(value) =>
                        (composerPickerTab = value as ComposerPickerTab)}
                      class="h-full gap-0"
                    >
                      <div class="flex flex-col gap-2 pt-3 px-3 bg-card/70 pb-3 border border-border">
                        <TabsList class="self-start space-x-1">
                          <TabsTrigger value="gif" class="cursor-pointer">GIFs</TabsTrigger>
                          <TabsTrigger value="emoji" class="cursor-pointer">Emoji</TabsTrigger>
                        </TabsList>
                        <div class="relative w-full">
                          {#if composerPickerTab === "gif" && gifPickerCategoryLabel}
                            <div class="flex items-center gap-2 rounded-lg border border-border bg-background/70 px-3 py-2 text-sm text-white">
                              <button
                                type="button"
                                class="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-muted/40 text-white/80 transition hover:text-white"
                                aria-label="Back to GIF categories"
                                onclick={handleGifPickerBack}
                              >
                                <ArrowLeft size={16} />
                              </button>
                              <p class="truncate text-sm font-semibold text-white">
                                {gifPickerCategoryLabel}
                              </p>
                            </div>
                          {:else}
                            <Input
                              type="search"
                              class={`w-full pr-9 disabled:opacity-60 ${composerPickerTab !== "emoji" ? "cursor-not-allowed" : ""}`}
                              placeholder="Search emojis"
                              bind:value={emojiSearchTerm}
                              autocomplete="off"
                              aria-label="Search emojis"
                              disabled={composerPickerTab !== "emoji"}
                            />
                            <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/60">
                              <Search size={14} aria-hidden="true" />
                            </span>
                          {/if}
                        </div>
                      </div>

                      <TabsContent value="emoji" class="flex flex-col h-full min-h-0">
                        <EmojiPicker
                          emojiCategories={emojiPickerCategories() ?? undefined}
                          fallbackUsed={emojiPickerFallbackUsed()}
                          searchTerm={emojiSearchTerm}
                          on:select={(event) =>
                            handleComposerEmojiSelect(event.detail.emoji)}
                          on:close={() =>
                            closeComposerPicker({ focusComposer: true })}
                        />
                      </TabsContent>

                      <TabsContent value="gif" class="flex flex-col h-full min-h-0">
                        <GifPicker
                          bind:selectedCategoryId={gifPickerSelectedCategoryId}
                          on:categoryChange={(event) =>
                            (gifPickerCategoryLabel = event.detail?.label ?? null)
                          }
                          on:select={(event) => handleComposerGifSelect(event.detail.gif)}
                        />
                      </TabsContent>
                    </Tabs>
                  </div>
                </div>
              {/if}
            </div>
            <button
              type="submit"
              class="flex items-center justify-center ml-2 p-2 text-white disabled:cursor-not-allowed cursor-pointer rounded-full transition-colors"
              disabled={sending ||
                connectivitySendBlocked() ||
                (slowmodeActive() && slowmodeRemainingSeconds > 0)}
              aria-busy={sending}
              aria-label={slowmodeActive() && slowmodeRemainingSeconds > 0
                ? `Slowmode active. ${formatSlowmodeCountdown(slowmodeRemainingSeconds)} remaining.`
                : connectivitySendBlocked() || connectivityQueueing()
                  ? (connectivitySendBlockedMessage() ?? "Send message")
                  : "Send message"}
              title={slowmodeActive() && slowmodeRemainingSeconds > 0
                ? `Slowmode active. ${formatSlowmodeCountdown(slowmodeRemainingSeconds)} remaining.`
                : connectivitySendBlocked() || connectivityQueueing()
                  ? (connectivitySendBlockedMessage() ??
                    "Connectivity unavailable")
                  : "Send message"}
            >
              <SendHorizontal size={16} />
            </button>
          </form>
        {:else}
          <div
            class="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"
            role="status"
            aria-live="polite"
          >
            <span
              >You do not have permission to send messages in this channel.</span
            >
          </div>
        {/if}
      </footer>
    </div>
  {:else}
    <div
      class="flex flex-col h-full w-full items-center justify-center text-zinc-500"
    >
      <Users size={20} />
      <p class="text-lg mt-4">
        Select a chat from the sidebar to start messaging.
      </p>
    </div>
  {/if}
</div>

{#if showLightbox}
  <ImageLightbox
    imageUrl={lightboxImageUrl}
    show={showLightbox}
    onClose={() => (showLightbox = false)}
  />
{/if}

{#if showContextMenu}
  <FloatingContextMenu
    x={contextMenuX}
    y={contextMenuY}
    show={showContextMenu}
    menuItems={contextMenuItems.map((item) => ({
      ...item,
      data: selectedUser,
    }))}
    onclose={() => (showContextMenu = false)}
    onaction={handleContextMenuAction}
  />
{/if}

{#if showMsgMenu && selectedMsg}
  <FloatingContextMenu
    x={msgMenuX}
    y={msgMenuY}
    show={showMsgMenu}
    menuItems={[
      ...baseMessageMenuItems(),
      ...(canManageMessages()
        ? selectedMsg.pinned
          ? [
              {
                label: "Unpin Message",
                action: "unpin_message",
                disabled: selectedMsg.pending === true,
              },
            ]
          : [
              {
                label: "Pin Message",
                action: "pin_message",
                disabled: selectedMsg.pending === true,
              },
            ]
        : []),
      ...reactionMenuItems(),
      ...(selectedMsg.senderId === $userStore.me?.id
        ? [
            {
              label: "Edit Message",
              action: "edit_message",
              disabled: selectedMsg.pending === true,
            },
            {
              label: "Delete Message",
              action: "delete_message",
              isDestructive: true,
            },
          ]
        : []),
    ]}
    onclose={() => (showMsgMenu = false)}
    onaction={handleMessageMenuAction}
  />
{/if}

<style>
  :global(.virtual-list-viewport.chat-viewport) {
    overflow-y: hidden;
    scrollbar-width: none;
  }

  :global(.virtual-list-viewport.chat-viewport.chat-has-messages) {
    overflow-y: auto;
  }

  :global(.virtual-list-viewport.chat-viewport.chat-has-messages:hover) {
    scrollbar-width: thin;
  }

  :global(.chat-viewport.chat-has-messages) {
    scrollbar-color: transparent transparent;
  }

  :global(.chat-viewport.chat-has-messages:hover) {
    scrollbar-color: rgba(248, 250, 252, 0.6) transparent;
  }

  :global(.chat-viewport.chat-has-messages::-webkit-scrollbar) {
    width: 0;
  }

  :global(.chat-viewport.chat-has-messages:hover::-webkit-scrollbar) {
    width: 6px;
  }

  :global(.chat-viewport.chat-has-messages::-webkit-scrollbar-track) {
    background: transparent;
  }

  :global(.chat-viewport.chat-has-messages:hover::-webkit-scrollbar-thumb) {
    background-color: rgba(248, 250, 252, 0.6);
    border-radius: 999px;
    border: 1px solid rgba(15, 23, 42, 0.3);
  }
</style>
