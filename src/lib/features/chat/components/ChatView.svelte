<svelte:options runes={true} />

<script lang="ts">
  import { Link, Mic, SendHorizontal, Square, Users } from "@lucide/svelte";
  import { invoke } from "@tauri-apps/api/core";
  import ImageLightbox from "$lib/components/media/ImageLightbox.svelte";
  import FilePreview from "$lib/components/media/FilePreview.svelte";
  import FileTransferApprovals from "$lib/features/chat/components/FileTransferApprovals.svelte";
  import FileTransferHistory from "$lib/features/chat/components/FileTransferHistory.svelte";
  import CallStatusBanner from "$lib/features/calls/components/CallStatusBanner.svelte";

  import BaseContextMenu from "$lib/components/context-menus/BaseContextMenu.svelte";
  import VirtualList from "@humanspeak/svelte-virtual-list";

  import { userStore } from "$lib/stores/userStore";
  import { friendStore } from "$lib/features/friends/stores/friendStore";
  import { mutedFriendsStore } from "$lib/features/friends/stores/mutedFriendsStore";
  import {
    chatStore,
    messagesByChatId,
    hasMoreByChatId,
    loadingStateByChat,
  } from "$lib/features/chat/stores/chatStore";
  import { getContext, onDestroy, onMount, tick } from "svelte";
  import { toasts } from "$lib/stores/ToastStore";
  import { generateCollaborationDocumentId } from "$lib/features/collaboration/collabDocumentStore";
  import { chatSearchStore } from "$lib/features/chat/stores/chatSearchStore";
  import { get, derived } from "svelte/store";
  import {
    buildLowercaseContent,
    matchNormalizedMessages,
    parseSearchQuery,
    type MessageContentCache,
  } from "$lib/features/chat/utils/chatSearch";
  import { mergeAttachments } from "$lib/features/chat/utils/attachments";
  import { callStore } from "$lib/features/calls/stores/callStore";
  import { serverStore } from "$lib/features/servers/stores/serverStore";
  import { settings } from "$lib/features/settings/stores/settings";
  import MessageAuthorName from "$lib/features/chat/components/MessageAuthorName.svelte";
  import { highlightText } from "$lib/features/chat/utils/highlightText";
  import LinkPreview from "$lib/features/chat/components/LinkPreview.svelte";
  import { extractFirstLink } from "$lib/features/chat/utils/linkPreviews";
  import {
    clearChatDraft,
    loadChatDraft,
    saveChatDraft,
    type ChatDraft,
  } from "$lib/features/chat/utils/chatDraftStore";

  import { CREATE_GROUP_CONTEXT_KEY } from "$lib/contextKeys";
  import type { CreateGroupContext } from "$lib/contextTypes";
  import {
    buildGroupModalOptions,
    buildReportUserPayload,
  } from "$lib/features/chat/utils/contextMenu";
  import type { User } from "$lib/features/auth/models/User";
  import type { Friend } from "$lib/features/friends/models/Friend";
  import type { Chat } from "$lib/features/chat/models/Chat";
  import type { Message } from "$lib/features/chat/models/Message";

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

  function persistChatDraft(chatId: string) {
    const shouldPersist =
      messageInput.trim().length > 0 ||
      attachedFiles.length > 0 ||
      replyTargetMessageId !== null;

    if (!shouldPersist) {
      clearChatDraft(chatId);
      return;
    }

    saveChatDraft(chatId, {
      messageInput,
      attachments: [...attachedFiles],
      replyTargetMessageId,
      replyPreview: replyPreview ? { ...replyPreview } : null,
      textareaHeight: textareaRef?.style.height ?? "",
    });
  }

  let { chat } = $props<{ chat: Chat | null }>();

  const createGroupContext = getContext<CreateGroupContext | undefined>(
    CREATE_GROUP_CONTEXT_KEY,
  );
  const openUserCardModal = createGroupContext?.openUserCardModal;
  const openDetailedProfileModal = createGroupContext?.openDetailedProfileModal;
  const openCreateGroupModal = createGroupContext?.openCreateGroupModal;
  const openReportUserModal = createGroupContext?.openReportUserModal;
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
  let canTriggerTopLoad = $state(true);
  let lastTopLoad = 0;
  let attachedFiles = $state<File[]>([]);
  let sending = $state(false);
  let isAtBottom = $state(true);
  let unseenCount = $state(0);
  let typingActive = $state(false);
  let typingResetTimer: ReturnType<typeof setTimeout> | null = null;
  const TYPING_IDLE_TIMEOUT_MS = 2_500;
  const MAX_REPLY_SNIPPET_LENGTH = 120;

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

  $effect(() => {
    if (!voiceMemosEnabled && isRecording) {
      void stopRecording({ save: false, silent: true });
    }
  });

  let listRef: any = $state();
  let fileInput: HTMLInputElement | null = $state(null);
  let textareaRef: HTMLTextAreaElement | null = $state(null);
  let viewportEl: HTMLElement | null = null;
  let detachViewportListener: (() => void) | null = null;
  let showMsgMenu = $state(false);
  let msgMenuX = $state(0);
  let msgMenuY = $state(0);
  let selectedMsg: Message | null = $state(null);
  let memberById = $state<Map<string, User>>(new Map());
  let editingMessageId = $state<string | null>(null);
  let editingDraft = $state("");
  let editingSaving = $state(false);
  let editingTextarea: HTMLTextAreaElement | null = $state(null);
  let replyTargetMessageId = $state<string | null>(null);
  let replyPreview = $state<ReplyPreview | null>(null);

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
    () => moderationPreferences.transparentEdits,
  );
  const showDeletedTombstones = $derived(
    () => moderationPreferences.deletedMessageDisplay === "tombstone",
  );

  const handleComposerFocus = () => {
    if (!typingActive) {
      typingActive = true;
      void chatStore.sendTypingIndicator(true);
    }
    scheduleTypingStop();
  };

  const handleComposerInput = () => {
    if (!typingActive) {
      typingActive = true;
      void chatStore.sendTypingIndicator(true);
    }
    scheduleTypingStop();
  };

  const handleComposerBlur = () => {
    if (typingActive) {
      typingActive = false;
      void chatStore.sendTypingIndicator(false);
    }
    resetTypingTimer();
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

    const topThreshold = 24;
    const hasMore = chat?.id ? ($hasMoreByChatId.get(chat.id) ?? true) : false;
    const awayThreshold = topThreshold * 8;
    if (!loadingMoreMessages && el.scrollTop > awayThreshold) {
      canTriggerTopLoad = true;
    }
    const now = Date.now();
    if (
      !loadingMoreMessages &&
      hasMore &&
      canTriggerTopLoad &&
      now - lastTopLoad > LOAD_COOLDOWN_MS &&
      el.scrollTop <= topThreshold &&
      chat?.id
    ) {
      loadingMoreMessages = true;
      canTriggerTopLoad = false;
      lastTopLoad = now;
      const oldScrollHeight = el.scrollHeight;
      const oldScrollTop = el.scrollTop;
      chatStore.loadMoreMessages(chat.id).finally(() => {
        if (viewportEl) {
          requestAnimationFrame(() => {
            const newScrollHeight = viewportEl!.scrollHeight;
            const delta = newScrollHeight - oldScrollHeight;
            let nextTop = oldScrollTop + (Number.isFinite(delta) ? delta : 0);
            if (nextTop <= topThreshold) nextTop = topThreshold + 1;
            viewportEl!.scrollTop = nextTop;
          });
        }
        loadingMoreMessages = false;
      });
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
      persistChatDraft(chat.id);
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

  let prevCount = $state(0);
  let prevChatId = $state<string | null>(null);
  $effect(() => {
    const nextChatId = chat?.id ?? null;
    if (nextChatId === prevChatId) {
      return;
    }

    if (prevChatId) {
      persistChatDraft(prevChatId);
    }

    unseenCount = 0;
    isAtBottom = true;
    prevCount = 0;
    chatSearchStore.reset();
    prevChatId = nextChatId;

    let restoredDraft: ChatDraft | undefined;

    if (nextChatId) {
      restoredDraft = loadChatDraft(nextChatId);
      if (restoredDraft) {
        messageInput = restoredDraft.messageInput;
        attachedFiles = [...restoredDraft.attachments];
        replyTargetMessageId = restoredDraft.replyTargetMessageId;
        replyPreview = restoredDraft.replyPreview
          ? { ...restoredDraft.replyPreview }
          : null;
      } else {
        messageInput = "";
        attachedFiles = [];
        replyTargetMessageId = null;
        replyPreview = null;
      }
    } else {
      messageInput = "";
      attachedFiles = [];
      replyTargetMessageId = null;
      replyPreview = null;
    }

    void tick().then(() => {
      if (!textareaRef) return;
      textareaRef.style.height = restoredDraft?.textareaHeight ?? "";
      adjustTextareaHeight();
    });
  });

  $effect(() => {
    if ((chat?.type === "channel" || chat?.type === "group") && chat.members) {
      memberById = new Map(chat.members.map((member) => [member.id, member]));
    } else {
      memberById = new Map();
    }
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

  const myId = $userStore.me?.id;
  const chatSearchQueryStore = derived(chatSearchStore, (state) => state.query);

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
      openDetailedProfileModal(item);
    } else if (detail.action === "remove_friend") {
      removeFriend(item as Friend);
    } else if (detail.action === "block_user") {
      blockUserAction(item);
    } else if (detail.action === "mute_user") {
      toggleMuteUser(item);
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
      toasts.addToast(
        error?.message ?? "Failed to remove friend.",
        "error",
      );
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
    if (!voiceMemosEnabled) {
      toasts.addToast("Voice memos are disabled in settings.", "info");
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
    if (!newFiles.length) return;

    let filesToProcess = newFiles;

    if (!voiceMemosEnabled) {
      const allowed = newFiles.filter((file) => !isVoiceMemoFile(file));
      if (allowed.length !== newFiles.length) {
        toasts.addToast("Voice memos are disabled in settings.", "info");
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
    if (
      (messageInput.trim() === "" && attachedFiles.length === 0) ||
      !chat ||
      sending
    )
      return;
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
        clearChatDraft(chat.id);
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
    } catch (e) {
      console.error("Failed to send message", e);
      toasts.addToast("Failed to send message.", "error");
    } finally {
      sending = false;
    }
  }

  function handleFileSelect(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files) {
      addAttachments(Array.from(target.files));
      target.value = "";
    }
  }

  function removeAttachment(fileToRemove: File) {
    attachedFiles = attachedFiles.filter((file) => file !== fileToRemove);
  }

  function openLightbox(imageUrl: string) {
    lightboxImageUrl = imageUrl;
    showLightbox = true;
  }

  function scrollToBottom() {
    const count = currentChatMessages?.length ?? 0;
    if (count && listRef && typeof listRef.scroll === "function") {
      listRef.scroll({ index: count - 1, align: "bottom", smoothScroll: true });
      unseenCount = 0;
      isAtBottom = true;
      notifyMessagesViewed();
    }
  }

  function scrollToMessage(messageId: string) {
    if (!messageId) {
      return;
    }

    const messages = currentChatMessages || [];
    const index = messages.findIndex((msg) => msg.id === messageId);
    if (listRef && typeof listRef.scroll === "function" && index !== -1) {
      listRef.scroll({ index, align: "center", smoothScroll: true });
      return;
    }

    const element = document.getElementById(`message-${messageId}`);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  let currentChatMessages = $derived(
    chat ? $messagesByChatId.get(chat.id) || [] : [],
  );

  let isChatLoading = $derived(
    chat ? Boolean($loadingStateByChat.get(chat.id)) : false,
  );

  const messageContentCache: MessageContentCache = new Map();

  let normalizedMessages = $derived(
    buildLowercaseContent(currentChatMessages || [], messageContentCache),
  );

  let callForChat = $derived(() => {
    if (!chat?.id) return null;
    const activeCall = $callStore.activeCall;
    return activeCall && activeCall.chatId === chat.id ? activeCall : null;
  });

  function hangUpCurrentCall() {
    if (!callForChat) {
      callStore.dismissCall();
      return;
    }
    const reason =
      callForChat.type === "video" ? "Video call ended" : "Voice call ended";
    callStore.endCall(reason);
  }

  function reopenCallModal() {
    callStore.setCallModalOpen(true);
  }

  function dismissCallStatus() {
    callStore.dismissCall();
  }

  let parsedSearchQuery = $derived(parseSearchQuery($chatSearchQueryStore));
  let normalizedQuery = $derived(parsedSearchQuery.normalizedText);
  let pinnedFilter = $derived(parsedSearchQuery.filters.pinned);

  let chatSearchMatches = $derived(() => {
    if (!chat?.id) {
      return [];
    }
    return matchNormalizedMessages(normalizedMessages, normalizedQuery, {
      pinned: pinnedFilter ?? undefined,
      messages: currentChatMessages || [],
    });
  });

  $effect(() => {
    chatSearchStore.setMatches(chatSearchMatches);
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
  const DEFAULT_REACTION = REACTION_EMOJIS[2];
  const reactionOptions = REACTION_EMOJIS.map((emoji) => ({
    emoji,
    action: `react_${emoji}` as const,
  }));
  const reactionMenuItems = reactionOptions.map(({ emoji, action }) => ({
    label: `React ${emoji}`,
    action,
  }));
  const reactionActionMap = new Map(
    reactionOptions.map(({ action, emoji }) => [action, emoji] as const),
  );
  type ReactionAction = (typeof reactionOptions)[number]["action"];

  const baseMessageMenuItems = [
    { label: "Copy Message", action: "copy_message" },
    { label: "Reply", action: "reply_message" },
  ];

  function handleMessageMenuAction({ action }: { action: string }) {
    if (!selectedMsg) return;

    const reactionEmoji = reactionActionMap.get(action as ReactionAction);
    if (reactionEmoji) {
      chatStore.addReaction(selectedMsg.chatId, selectedMsg.id, reactionEmoji);
      showMsgMenu = false;
      return;
    }

    switch (action) {
      case "copy_message":
        navigator.clipboard.writeText(selectedMsg.content || "").then(() => {
          toasts.addToast("Message copied.", "success");
        });
        break;
      case "reply_message":
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
        void chatStore
          .pinMessage(selectedMsg.chatId, selectedMsg.id)
          .catch((error) => {
            console.error("Failed to pin message", error);
            toasts.addToast("Failed to pin message.", "error");
          });
        break;
      case "unpin_message":
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
</script>

<FileTransferApprovals />
<FileTransferHistory />

<div class="flex-grow min-h-0 flex flex-col bg-card/50">
  {#if chat}
    <div class="flex min-h-0 flex-grow flex-col">
      {#if callForChat}
        <div class="px-4 pt-4">
          <CallStatusBanner
            call={callForChat}
            onLeave={hangUpCurrentCall}
            onDismiss={dismissCallStatus}
            onOpenModal={reopenCallModal}
          />
        </div>
      {/if}
      <div class="flex-grow min-h-0 relative">
        <VirtualList
          items={currentChatMessages}
          mode="bottomToTop"
          defaultEstimatedItemHeight={
            messageDensity === "compact" ? 64 : 80
          }
          viewportClass={densityClass(
            "virtual-list-viewport p-4 chat-viewport",
            "virtual-list-viewport p-2 chat-viewport",
          )}
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
              <div class="text-center text-muted-foreground py-2">
                Loading older messages...
              </div>
            {/if}
            <div
              class={densityClass("space-y-6", "space-y-3")}
              use:captureViewport
              id={`message-${msg.id}`}
            >
              <div
                class={`flex items-start ${
                  isMe ? "flex-row-reverse" : ""
                } ${
                  showMessageAvatars
                    ? densityClass("gap-3", "gap-2")
                    : densityClass("gap-0", "gap-1")
                }`}
              >
                {#if showMessageAvatars}
                  <button
                    onclick={(e) =>
                      displayableUser &&
                      openUserCardModal(
                        displayableUser as User,
                        e.clientX,
                        e.clientY,
                        chat.type === "channel",
                      )}
                    oncontextmenu={(e) =>
                      displayableUser && handleContextMenu(e, displayableUser)}
                    class="w-10 h-10 rounded-full flex-shrink-0 cursor-pointer"
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
                    <MessageAuthorName
                      chatType={chat.type}
                      channelId={chat.type === "channel" ? chat.id : null}
                      senderName={senderName ?? ""}
                      className="font-bold text-white hover:underline cursor-pointer"
                      onNameClick={(e) =>
                        displayableUser &&
                        openUserCardModal(
                          displayableUser as User,
                          e.clientX,
                          e.clientY,
                          chat.type === "channel",
                        )}
                      onNameContextMenu={(e) =>
                        displayableUser &&
                        handleContextMenu(e, displayableUser)}
                    />
                    {#if showMessageTimestamps}
                      <p class="text-xs text-muted-foreground">
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
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
                  {:else if showDeletedTombstones && msg.deleted}
                    <div
                      class="max-w-md rounded-lg border border-dashed border-muted-foreground/40 bg-muted/20 px-3 py-2 text-sm text-muted-foreground"
                    >
                      <p class="italic">
                        Message deleted
                        {#if msg.deletedBy}
                          · removed by
                          {msg.deletedBy === myId
                            ? "you"
                            : memberById.get(msg.deletedBy)?.name ?? "a moderator"}
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
                      class="max-w-md p-3 rounded-lg {isMe
                        ? 'bg-cyan-600 text-white rounded-tr-none'
                        : 'bg-zinc-700 rounded-tl-none'}"
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
                          onclick={() => scrollToMessage(msg.replyToMessageId ?? "")}
                        >
                          <p class="font-semibold text-[0.65rem] uppercase tracking-wide text-white/60">
                            Replying to {msg.replySnapshot?.author ?? "message"}
                          </p>
                          {#if msg.replySnapshot?.snippet}
                            <p class="mt-1 text-sm text-white/90 overflow-hidden text-ellipsis whitespace-nowrap">
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
                        {#each highlightText(msg.content, $chatSearchStore.query) as part, i (i)}
                          {#if part.match}
                            <mark class="bg-yellow-500/60 text-white"
                              >{part.text}</mark
                            >
                          {:else}
                            {part.text}
                          {/if}
                        {/each}
                      {:else}
                        <p class="text-base whitespace-pre-wrap break-words">
                          {msg.content}
                        </p>
                        {#if $settings.enableLinkPreviews}
                          {@const previewUrl = extractFirstLink(msg.content ?? "")}
                          {#if previewUrl}
                            <div class="mt-2">
                              <LinkPreview url={previewUrl} />
                            </div>
                          {/if}
                        {/if}
                      {/if}
                      {#if showTransparentEditHistory && msg.editHistory?.length}
                        {@const historyEntries = [...msg.editHistory].reverse()}
                        <div class="mt-3 space-y-1 border-t border-white/10 pt-2 text-xs text-white/80">
                          <p class="text-[0.625rem] uppercase tracking-wide opacity-70">
                            Edit history
                          </p>
                          {#each historyEntries as previous, historyIndex (historyIndex)}
                            <p class="whitespace-pre-wrap break-words text-white/80">
                              {previous}
                            </p>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  {/if}
                  {#if msg.reactions}
                    {@const reactionEntries: Array<[string, string[]]> = Object.entries(msg.reactions)}
                    <div class="mt-1 flex gap-1 flex-wrap">
                      {#each reactionEntries as [emoji, users] (emoji)}
                        <button
                          type="button"
                          class="px-2 py-0.5 text-sm rounded-full bg-zinc-600 hover:bg-zinc-500 cursor-pointer"
                          aria-pressed={users.includes(myId || "")}
                          onclick={() => {
                            if (users.includes(myId || "")) {
                              chatStore.removeReaction(
                                msg.chatId,
                                msg.id,
                                emoji,
                              );
                            } else {
                              chatStore.addReaction(msg.chatId, msg.id, emoji);
                            }
                          }}>{emoji} {users.length}</button
                        >
                      {/each}
                      <button
                        type="button"
                        class="px-2 py-0.5 text-sm rounded-full bg-zinc-600 hover:bg-zinc-500 cursor-pointer"
                        onclick={() =>
                          chatStore.addReaction(
                            msg.chatId,
                            msg.id,
                            DEFAULT_REACTION,
                          )}
                        aria-label="Add reaction">+ React</button
                      >
                    </div>
                  {:else}
                    <div class="mt-1">
                      <button
                        type="button"
                        class="px-2 py-0.5 text-xs rounded-full bg-zinc-600 hover:bg-zinc-500 cursor-pointer"
                        onclick={() =>
                          chatStore.addReaction(
                            msg.chatId,
                            msg.id,
                            DEFAULT_REACTION,
                          )}
                        aria-label="Add reaction">+ React</button
                      >
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
                  {#if !msg.pending}
                    <p
                      class="mt-1 text-[0.625rem] uppercase tracking-wide text-muted-foreground/80"
                    >
                      {isMe
                        ? msg.read
                          ? "Read by recipient"
                          : "Not read yet"
                        : msg.read
                          ? "Read"
                          : "Unread"}
                    </p>
                  {/if}
                </div>
              </div>
            </div>
          {/snippet}
        </VirtualList>

        {#if isChatLoading && (currentChatMessages?.length ?? 0) === 0}
          <div
            class="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <span class="text-sm text-muted-foreground"
              >Loading messages...</span
            >
          </div>
        {/if}

        {#if unseenCount > 0}
          <button
            class="absolute right-4 bottom-4 bg-cyan-600 hover:bg-cyan-700 text-white text-sm px-3 py-2 rounded-full shadow-lg cursor-pointer"
            onclick={scrollToBottom}
            aria-live="polite"
          >
            New messages ({unseenCount})
          </button>
        {/if}
      </div>

      <footer class="p-4 bg-card/50 border-t border-zinc-700/50">
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
        {#if attachedFiles.length > 0}
          <div class="p-2 mb-2 border-b border-zinc-700/50">
            <p class="text-sm font-semibold mb-2 text-zinc-300">Attachments</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {#each attachedFiles as file, i (i)}
                <FilePreview {file} onRemove={removeAttachment} />
              {/each}
            </div>
          </div>
        {/if}
        <form
          onsubmit={sendMessage}
          class="flex items-center bg-muted/50 rounded-lg pr-2 py-1 border border-transparent focus-within:border-zinc-600 transition-all"
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
          />
          <button
            type="button"
            onclick={() => fileInput?.click()}
            class="flex items-center justify-center p-2 text-muted-foreground hover:text-white cursor-pointer rounded-full transition-colors"
          >
            <Link size={12} />
          </button>
          <textarea
            rows="1"
            placeholder={`Message ${
              chat.type === "dm"
                ? `@${chat.friend.name}`
                : chat.type === "group"
                  ? chat.name
                  : `#${chat.name}`
            }`}
            class="flex-grow bg-transparent resize-none focus:outline-none mx-2 text-white placeholder-zinc-400"
            bind:value={messageInput}
            bind:this={textareaRef}
            oninput={(event) => {
              adjustTextareaHeight(event);
              handleComposerInput();
            }}
            onfocus={(event) => {
              adjustTextareaHeight(event);
              handleComposerFocus();
            }}
            onblur={handleComposerBlur}
            title="Press Enter to send. Use Shift+Enter for a newline."
            onkeydown={(e) => {
              if (e.key !== "Enter") {
                return;
              }

              if (e.isComposing) {
                return;
              }

              const hasExplicitNewlineModifier = e.shiftKey || e.ctrlKey;
              const hasOtherModifier = e.altKey || e.metaKey;

              if (hasExplicitNewlineModifier || hasOtherModifier) {
                return;
              }

              e.preventDefault();
              sendMessage(e);
            }}
          ></textarea>
          {#if isRecording}
            <div
              class="mr-2 flex items-center gap-2 rounded-full border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs font-medium text-red-400"
            >
              <span
                class="inline-flex h-2 w-2 animate-pulse rounded-full bg-red-500"
                aria-hidden="true"
              ></span>
              <span>{formatRecordingDuration(recordingDuration)}</span>
            </div>
          {/if}
          <button
            type="button"
            class="flex items-center justify-center p-2 text-muted-foreground hover:text-white cursor-pointer rounded-full transition-colors"
            class:text-red-400={isRecording}
            aria-pressed={isRecording}
            onclick={handleMicClick}
            class:opacity-50={!voiceMemosEnabled}
            class:cursor-not-allowed={!voiceMemosEnabled}
            aria-disabled={!voiceMemosEnabled}
            title={voiceMemosEnabled
              ? isRecording
                ? "Stop recording voice message"
                : "Record voice message"
              : "Voice memos are disabled in settings"}
          >
            {#if isRecording}
              <Square size={12} />
            {:else}
              <Mic size={12} />
            {/if}
          </button>
          <button
            type="submit"
            class="flex items-center justify-center ml-2 p-2 text-white bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-800 disabled:cursor-not-allowed cursor-pointer rounded-full transition-colors"
            disabled={sending}
            aria-busy={sending}
          >
            <SendHorizontal size={12} />
          </button>
        </form>
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
  <BaseContextMenu
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
  <BaseContextMenu
    x={msgMenuX}
    y={msgMenuY}
    show={showMsgMenu}
    menuItems={[
      ...baseMessageMenuItems,
      ...(selectedMsg.pinned
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
          ]),
      ...reactionMenuItems,
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
