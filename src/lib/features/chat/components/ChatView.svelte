<svelte:options runes={true} />

<script lang="ts">
  import { Link, Mic, SendHorizontal, Users } from "@lucide/svelte";
  import ImageLightbox from "$lib/components/media/ImageLightbox.svelte";
  import FilePreview from "$lib/components/media/FilePreview.svelte";
  import DownloadProgress from "$lib/components/ui/DownloadProgress.svelte";

  import BaseContextMenu from "$lib/components/context-menus/BaseContextMenu.svelte";
  import VirtualList from "@humanspeak/svelte-virtual-list";

  import { userStore } from "$lib/stores/userStore";
  import { friendStore } from "$lib/features/friends/stores/friendStore";
  import {
    chatStore,
    messagesByChatId,
    hasMoreByChatId,
  } from "$lib/features/chat/stores/chatStore";
  import { afterUpdate, getContext, onMount } from "svelte";
  import { toasts } from "$lib/stores/ToastStore";
  import { chatSearchStore } from "$lib/features/chat/stores/chatSearchStore";
  import { get, derived } from "svelte/store";

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

  let listRef: any = $state();
  let fileInput: HTMLInputElement | null = $state(null);
  let textareaRef: HTMLTextAreaElement | null = $state(null);
  let viewportEl: HTMLElement | null = null;
  let detachViewportListener: (() => void) | null = null;
  let showMsgMenu = $state(false);
  let msgMenuX = $state(0);
  let msgMenuY = $state(0);
  let selectedMsg: Message | null = $state(null);

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

  function arraysEqualNumbers(a: number[], b: number[]) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  $effect(() => {
    const query = $chatSearchQueryStore.trim();
    const messages = currentChatMessages || [];
    const { matches: currentMatches } = get(chatSearchStore);

    if (!chat?.id || !query) {
      if (currentMatches.length) {
        chatSearchStore.setMatches([]);
      }
      return;
    }

    const lower = query.toLowerCase();
    const matches = messages
      .map((m, idx) => ({ idx, content: (m.content || "").toLowerCase() }))
      .filter(({ content }) => content.includes(lower))
      .map(({ idx }) => idx);

    if (!arraysEqualNumbers(matches, currentMatches)) {
      chatSearchStore.setMatches(matches);
    }
  });

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
      attachedFiles = [...attachedFiles, ...Array.from(target.files)];
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
      attachedFiles = [...attachedFiles, ...files];
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    const dt = e.dataTransfer;
    if (!dt?.files?.length) return;
    attachedFiles = [...attachedFiles, ...Array.from(dt.files)];
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
</script>

<div class="flex-grow min-h-0 flex flex-col bg-card/50">
  {#if chat}
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
            chat.type === "dm"
              ? chat.friend
              : chat.members?.find((m: User) => m.id === msg.senderId)}
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
                </div>
                {#if msg.content}
                  <div
                    class="max-w-md p-3 rounded-lg {isMe
                      ? 'bg-cyan-600 text-white rounded-tr-none'
                      : 'bg-zinc-700 rounded-tl-none'}"
                    role="button"
                    tabindex="0"
                    aria-label="Message options"
                    oncontextmenu={(e) => handleMessageContextMenu(e, msg)}
                    onkeydown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleMessageContextMenu(e as any as MouseEvent, msg);
                      }
                    }}
                  >
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
                    {#each msg.attachments as attachment, i (i)}
                      {#if attachment.type.startsWith("image/") && attachment.url}
                        <button
                          onclick={() =>
                            attachment.url && openLightbox(attachment.url)}
                          class="max-w-xs rounded-lg overflow-hidden cursor-pointer"
                          oncontextmenu={(event) =>
                            handleMessageContextMenu(event, msg)}
                        >
                          <img
                            src={attachment.url}
                            alt="attachment"
                            class="max-h-64"
                          />
                        </button>
                      {:else}
                        <DownloadProgress
                          fileName={attachment.name}
                          status="completed"
                          progress={100}
                        />
                      {/if}
                    {/each}
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {/snippet}
      </VirtualList>

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
          placeholder="Message {chat.type === 'dm'
            ? '@' + chat.friend.name
            : '#' + chat.name}"
          class="flex-grow bg-transparent resize-none focus:outline-none mx-2 text-white placeholder-zinc-400"
          bind:value={messageInput}
          bind:this={textareaRef}
          oninput={adjustTextareaHeight}
          onfocus={adjustTextareaHeight}
          onkeydown={(e) => {
            if (e.key === "Enter" && e.ctrlKey) {
              e.preventDefault();
              sendMessage(e);
            }
          }}
        ></textarea>
        <button
          type="button"
          class="flex items-center justify-center p-2 text-muted-foreground hover:text-white cursor-pointer rounded-full transition-colors"
        >
          <Mic size={12} />
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
