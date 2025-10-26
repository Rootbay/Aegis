<svelte:options runes={true} />

<script lang="ts">
  import { Link, Mic, SendHorizontal, Square, Users } from "@lucide/svelte";
  import ImageLightbox from "$lib/components/media/ImageLightbox.svelte";
  import FilePreview from "$lib/components/media/FilePreview.svelte";
  import FileTransferApprovals from "$lib/features/chat/components/FileTransferApprovals.svelte";
  import FileTransferHistory from "$lib/features/chat/components/FileTransferHistory.svelte";
  import CallStatusBanner from "$lib/features/calls/components/CallStatusBanner.svelte";

  import BaseContextMenu from "$lib/components/context-menus/BaseContextMenu.svelte";
  import VirtualList from "@humanspeak/svelte-virtual-list";

  import { userStore } from "$lib/stores/userStore";
  import { friendStore } from "$lib/features/friends/stores/friendStore";
  import {
    chatStore,
    messagesByChatId,
    hasMoreByChatId,
    loadingStateByChat,
  } from "$lib/features/chat/stores/chatStore";
  import { afterUpdate, getContext, onDestroy, onMount, tick } from "svelte";
  import { toasts } from "$lib/stores/ToastStore";
  import { chatSearchStore } from "$lib/features/chat/stores/chatSearchStore";
  import { get, derived } from "svelte/store";
  import {
    buildLowercaseContent,
    matchNormalizedMessages,
    normalizeSearchQuery,
    type MessageContentCache,
  } from "$lib/features/chat/utils/chatSearch";
  import { mergeAttachments } from "$lib/features/chat/utils/attachments";
  import { callStore } from "$lib/features/calls/stores/callStore";

  import { CREATE_GROUP_CONTEXT_KEY } from "$lib/contextKeys";
  import type { CreateGroupContext } from "$lib/contextTypes";
  import type { User } from "$lib/features/auth/models/User";
  import type { Friend } from "$lib/features/friends/models/Friend";
  import type { Chat } from "$lib/features/chat/models/Chat";
  import type { Message } from "$lib/features/chat/models/Message";

  let { chat } = $props<{ chat: Chat | null }>();

  const { openUserCardModal, openDetailedProfileModal } =
    getContext<CreateGroupContext>(CREATE_GROUP_CONTEXT_KEY);

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

  const supportsVoiceRecording =
    typeof window !== "undefined" && "MediaRecorder" in window;
  let isRecording = $state(false);
  let recordingDuration = $state(0);
  let recordingStartedAt = 0;
  let recordingInterval: ReturnType<typeof setInterval> | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let recordingStream: MediaStream | null = null;
  let recordedChunks: Blob[] = [];

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

  const onScroll = () => {
    const el = viewportEl;
    if (!el) return;

    const bottomThreshold = 24;
    const atBottom =
      el.scrollHeight - (el.scrollTop + el.clientHeight) <= bottomThreshold;
    isAtBottom = atBottom;
    if (atBottom) unseenCount = 0;

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
    if (isRecording || mediaRecorder || recordingStream) {
      stopRecording({ save: false, silent: true });
    }
  });

  afterUpdate(() => {
    if (viewportEl && !viewportEl.isConnected) {
      attachViewportElement(null);
    }
  });

  let prevCount = $state(0);
  let prevChatId = $state<string | null>(null);
  $effect(() => {
    const id = chat?.id ?? null;
    if (id !== prevChatId) {
      unseenCount = 0;
      isAtBottom = true;
      prevCount = 0;
      prevChatId = id;
      chatSearchStore.reset();
    }
  });

  $effect(() => {
    if (
      (chat?.type === "channel" || chat?.type === "group") &&
      chat.members
    ) {
      memberById = new Map(chat.members.map((member) => [member.id, member]));
    } else {
      memberById = new Map();
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

  function jumpToMatch(next = true) {
    const { matches, activeMatchIndex } = get(chatSearchStore);
    if (!matches.length) return;
    const count = matches.length;
    const nextIndex = (activeMatchIndex + (next ? 1 : -1) + count) % count;
    chatSearchStore.setActiveMatchIndex(nextIndex);
    const msgIndex = matches[nextIndex];
    if (listRef && typeof listRef.scroll === "function") {
      listRef.scroll({ index: msgIndex, align: "center", smoothScroll: true });
    }
  }

  function clearSearch() {
    chatSearchStore.reset();
  }

  function highlightText(
    text: string,
    query: string,
  ): { text: string; match: boolean }[] {
    if (!query) return [{ text, match: false }];
    const q = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(q, "ig");
    const parts: { text: string; match: boolean }[] = [];
    let lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index > lastIndex)
        parts.push({ text: text.slice(lastIndex, m.index), match: false });
      parts.push({ text: m[0], match: true });
      lastIndex = m.index + m[0].length;
    }
    if (lastIndex < text.length)
      parts.push({ text: text.slice(lastIndex), match: false });
    return parts.length ? parts : [{ text, match: false }];
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
    } else {
      console.log(`Action not implemented: ${detail.action}`);
    }
  }

  function removeFriend(user: Friend) {
    friendStore.removeFriend(user.id);
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

  function addAttachments(newFiles: File[]) {
    if (!newFiles.length) return;

    const { files, duplicates } = mergeAttachments(attachedFiles, newFiles);
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
      if (attachedFiles.length > 0) {
        await chatStore.sendMessageWithAttachments(messageInput, attachedFiles);
      } else {
        await chatStore.sendMessage(messageInput);
      }
      messageInput = "";
      attachedFiles = [];
      adjustTextareaHeight();
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
    }
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
      callForChat.type === "video"
        ? "Video call ended"
        : "Voice call ended";
    callStore.endCall(reason);
  }

  function reopenCallModal() {
    callStore.setCallModalOpen(true);
  }

  function dismissCallStatus() {
    callStore.dismissCall();
  }

  let normalizedQuery = $derived(normalizeSearchQuery($chatSearchQueryStore));

  let chatSearchMatches = $derived(() => {
    if (!chat?.id) {
      return [];
    }
    return matchNormalizedMessages(normalizedMessages, normalizedQuery);
  });

  $effect(() => {
    chatSearchStore.setMatches(chatSearchMatches);
  });

  $effect(() => {
    if (!editingMessageId) return;
    const exists = currentChatMessages?.some((msg) => msg.id === editingMessageId) ?? false;
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
        messageInput = `> ${selectedMsg.content}\n`;
        textareaRef?.focus();
        adjustTextareaHeight();
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
        defaultEstimatedItemHeight={80}
        viewportClass="virtual-list-viewport p-4 chat-viewport"
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
          <div class="space-y-6" use:captureViewport>
            <div
              class="flex items-start gap-3 {isMe ? 'flex-row-reverse' : ''}"
            >
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
              <div class="flex flex-col {isMe ? 'items-end' : ''}">
                <div class="flex items-center gap-2 mb-1">
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
                    class="font-bold text-white hover:underline cursor-pointer"
                    >{senderName}</button
                  >
                  <p class="text-xs text-muted-foreground">
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  {#if msg.editedAt}
                    <span class="text-[0.625rem] uppercase tracking-wide text-muted-foreground/80">
                      (edited)
                    </span>
                  {/if}
                </div>
                {#if msg.content}
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
                        <div class="flex items-center justify-end gap-2 text-sm">
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
                            disabled={editingSaving || editingDraft.trim().length === 0}
                          >
                            {editingSaving ? "Saving..." : "Save"}
                          </button>
                        </div>
                      </form>
                    {:else}
                      {#if $chatSearchStore.query}
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
                      {/if}
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
                            chatStore.removeReaction(msg.chatId, msg.id, emoji);
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
              </div>
            </div>
          </div>
        {/snippet}
      </VirtualList>

      {#if isChatLoading && (currentChatMessages?.length ?? 0) === 0}
        <div
          class="absolute inset-0 flex items-center justify-center pointer-events-none"
        >
          <span class="text-sm text-muted-foreground">Loading messages...</span>
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
          oninput={adjustTextareaHeight}
          onfocus={adjustTextareaHeight}
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
          <div class="mr-2 flex items-center gap-2 rounded-full border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs font-medium text-red-400">
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
          title={
            isRecording
              ? "Stop recording voice message"
              : "Record voice message"
          }
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
