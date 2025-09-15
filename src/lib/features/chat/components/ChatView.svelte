<script lang="ts">
  import Icon from '$lib/components/ui/Icon.svelte';
  import { mdiPaperclip, mdiMicrophone, mdiPound, mdiAccountGroup, mdiPhone, mdiVideo, mdiDotsVertical, mdiMagnify, mdiSend, mdiClose } from '@mdi/js';
  import ImageLightbox from '$lib/components/media/ImageLightbox.svelte';
  import FilePreview from '$lib/components/media/FilePreview.svelte';
  import DownloadProgress from '$lib/components/ui/DownloadProgress.svelte';

  import BaseContextMenu from '$lib/components/context-menus/BaseContextMenu.svelte';
  import VirtualList from '@humanspeak/svelte-virtual-list';

  import { userStore } from '$lib/data/stores/userStore';
  import { friendStore } from '$lib/data/stores/friendStore';
  import { chatStore, messagesByChatId, hasMoreByChatId } from '$lib/data/stores/chatStore';
  import { getContext, onMount, onDestroy } from 'svelte';
  import { toasts } from '$lib/data/stores/ToastStore';

  import { CREATE_GROUP_CONTEXT_KEY } from '$lib/data/contextKeys';
  import type { CreateGroupContext } from '$lib/data/contextTypes';
  import type { User } from '$lib/models/User';
  import type { Friend } from '$lib/models/Friend';
  import type { Chat } from '$lib/models/Chat';
  import type { Message } from '$lib/models/Message';

  let { chat } = $props<{ chat: Chat | null }>();

  const { openUserCardModal, openDetailedProfileModal } = getContext<CreateGroupContext>(CREATE_GROUP_CONTEXT_KEY);
  
  const LOAD_COOLDOWN_MS = 600;
  let showContextMenu = $state(false);
  let contextMenuX = $state(0);
  let contextMenuY = $state(0);
  let selectedUser = $state<User | Friend | null>(null);
  let messageInput = $state('');
  let showLightbox = $state(false);
  let lightboxImageUrl = $state('');
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
  let searchOpen = $state(false);
  let searchQuery = $state('');
  let activeMatchIndex = $state(0);
  let showMsgMenu = $state(false);
  let msgMenuX = $state(0);
  let msgMenuY = $state(0);
  let selectedMsg: Message | null = $state(null);

  onMount(() => {
    viewportEl = document.querySelector('.chat-viewport') as HTMLElement | null;
    const onScroll = () => {
      if (!viewportEl) return;
      const bottomThreshold = 24;
      const atBottom = viewportEl.scrollHeight - (viewportEl.scrollTop + viewportEl.clientHeight) <= bottomThreshold;
      isAtBottom = atBottom;
      if (atBottom) unseenCount = 0;

      const topThreshold = 24;
      const hasMore = chat?.id ? ($hasMoreByChatId.get(chat.id) ?? true) : false;
      const awayThreshold = topThreshold * 8;
      if (!loadingMoreMessages && viewportEl.scrollTop > awayThreshold) {
        canTriggerTopLoad = true;
      }
      const now = Date.now();
      if (!loadingMoreMessages && hasMore && canTriggerTopLoad && (now - lastTopLoad) > LOAD_COOLDOWN_MS && viewportEl.scrollTop <= topThreshold && chat?.id) {
        loadingMoreMessages = true;
        canTriggerTopLoad = false;
        lastTopLoad = now;
        const oldScrollHeight = viewportEl.scrollHeight;
        const oldScrollTop = viewportEl.scrollTop;
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
    if (viewportEl) {
      viewportEl.addEventListener('scroll', onScroll, { passive: true } as any);
      onScroll();
    }
    return () => {
      if (viewportEl) viewportEl.removeEventListener('scroll', onScroll as any);
    };
  });

  onDestroy(() => {
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
    }
  });

  $effect(() => {
    const count = currentChatMessages?.length ?? 0;
    if (!count) return;
    if (count !== prevCount) {
      if (!loadingMoreMessages) {
        if (isAtBottom && listRef && typeof listRef.scroll === 'function') {
          listRef.scroll({ index: count - 1, align: 'bottom', smoothScroll: prevCount > 0 });
        } else if (!isAtBottom && count > prevCount) {
          unseenCount += (count - prevCount);
        }
      }
      prevCount = count;
    }
  });

  const myId = $userStore.me?.id;
  const searchMatches = $derived(() => {
    if (!searchQuery) return [] as number[];
    const q = searchQuery.toLowerCase();
    return (currentChatMessages || [])
      .map((m, idx) => ({ idx, hit: (m.content || '').toLowerCase().includes(q) }))
      .filter(x => x.hit)
      .map(x => x.idx);
  });

  $effect(() => {
    if (activeMatchIndex >= searchMatches.length) activeMatchIndex = Math.max(0, searchMatches.length - 1);
  });

  function jumpToMatch(next = true) {
    if (!searchMatches.length) return;
    const count = searchMatches.length;
    activeMatchIndex = (activeMatchIndex + (next ? 1 : -1) + count) % count;
    const msgIndex = searchMatches[activeMatchIndex];
    if (listRef && typeof listRef.scroll === 'function') {
      listRef.scroll({ index: msgIndex, align: 'center', smoothScroll: true });
    }
  }

  function clearSearch() {
    searchQuery = '';
    activeMatchIndex = 0;
    searchOpen = false;
  }

  function highlightText(text: string, query: string): { text: string; match: boolean }[] {
    if (!query) return [{ text, match: false }];
    const q = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(q, 'ig');
    const parts: { text: string; match: boolean }[] = [];
    let lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index > lastIndex) parts.push({ text: text.slice(lastIndex, m.index), match: false });
      parts.push({ text: m[0], match: true });
      lastIndex = m.index + m[0].length;
    }
    if (lastIndex < text.length) parts.push({ text: text.slice(lastIndex), match: false });
    return parts.length ? parts : [{ text, match: false }];
  }

  const contextMenuItems = $derived(() => {
    const base = [
      { label: 'View Profile', action: 'view_profile' },
    ];
    if (chat?.type === 'dm') {
      base.push({ label: 'Remove Friend', action: 'remove_friend' });
    }
    base.push(
      { isSeparator: true },
      { label: 'Block', action: 'block_user', isDestructive: true },
      { label: 'Mute', action: 'mute_user' },
      { label: 'Report User', action: 'report_user', isDestructive: true },
      { isSeparator: true },
    );
    if (chat?.type === 'channel') {
      base.push({ label: 'Add to Group', action: 'add_to_group' });
    } else {
      base.push({ label: 'Invite to Server', action: 'invite_to_server' });
    }
    return base;
  });

  function handleContextMenu(event: MouseEvent, user: User | Friend) {
    event.preventDefault();
    showContextMenu = true;
    contextMenuX = event.clientX;
    contextMenuY = event.clientY;
    selectedUser = user;
  }

  function handleContextMenuAction(event: CustomEvent) {
    if (event.detail.action === 'view_profile') {
      openDetailedProfileModal(event.detail.itemData);
    } else if (event.detail.action === 'remove_friend') {
      removeFriend(event.detail.itemData);
    } else {
      console.log(`Action not implemented: ${event.detail.action}`);
    }
  }

  function removeFriend(user: Friend) {
    friendStore.removeFriend(user.id);
  }

  function adjustTextareaHeight() {
    if (!textareaRef) return;
    textareaRef.style.height = 'auto';
    const maxHeight = 6 * 24;
    textareaRef.style.height = Math.min(textareaRef.scrollHeight, maxHeight) + 'px';
  }

  async function sendMessage(event: Event) {
    event.preventDefault();
    if ((messageInput.trim() === '' && attachedFiles.length === 0) || !chat || sending) return;
    try {
      sending = true;
      if (attachedFiles.length > 0) {
        await chatStore.sendMessageWithAttachments(messageInput, attachedFiles);
      } else {
        await chatStore.sendMessage(messageInput);
      }
      messageInput = '';
      attachedFiles = [];
      adjustTextareaHeight();
    } catch (e) {
      console.error('Failed to send message', e);
      toasts.addToast('Failed to send message.', 'error');
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
    attachedFiles = attachedFiles.filter(file => file !== fileToRemove);
  }

  function openLightbox(imageUrl: string) {
    lightboxImageUrl = imageUrl;
    showLightbox = true;
  }

  function scrollToBottom() {
    const count = currentChatMessages?.length ?? 0;
    if (count && listRef && typeof listRef.scroll === 'function') {
      listRef.scroll({ index: count - 1, align: 'bottom', smoothScroll: true });
      unseenCount = 0;
      isAtBottom = true;
    }
  }

  let currentChatMessages = $derived(chat ? $messagesByChatId.get(chat.id) || [] : []);

  function handlePaste(e: ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const it of items as any) {
      if (it.kind === 'file') {
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

  function handleMessageMenuAction(event: CustomEvent) {
    const { action } = event.detail as { action: string };
    if (!selectedMsg) return;
    switch (action) {
      case 'copy_message':
        navigator.clipboard.writeText(selectedMsg.content || '').then(() => {
          toasts.addToast('Message copied.', 'success');
        });
        break;
      case 'reply_message':
        messageInput = `> ${selectedMsg.content}\n`;
        textareaRef?.focus();
        adjustTextareaHeight();
        break;
      case 'react_ðŸ‘':
        chatStore.addReaction(selectedMsg.chatId, selectedMsg.id, 'ðŸ‘');
        break;
      case 'react_â¤ï¸':
        chatStore.addReaction(selectedMsg.chatId, selectedMsg.id, 'â¤ï¸');
        break;
      case 'react_ðŸ˜‚':
        chatStore.addReaction(selectedMsg.chatId, selectedMsg.id, 'ðŸ˜‚');
        break;
      case 'react_ðŸŽ‰':
        chatStore.addReaction(selectedMsg.chatId, selectedMsg.id, 'ðŸŽ‰');
        break;
      case 'delete_message':
        if (selectedMsg.senderId === $userStore.me?.id) {
          chatStore.deleteMessage(selectedMsg.chatId, selectedMsg.id);
        } else {
          toasts.addToast('Cannot delete others\' messages.', 'warning');
        }
        break;
      default:
        console.debug('Unhandled message action', action);
    }
    showMsgMenu = false;
  }
</script>

<div class="flex-grow min-h-0 flex flex-col bg-card/50">
  {#if chat}
    <header class="flex items-center p-3 border-b border-zinc-700/50 shadow-sm justify-between h-[55px]">
      <div class="flex items-center">
        {#if chat.type === 'dm'}
          <button class="w-10 h-10 rounded-full mr-4 cursor-pointer relative" onclick={(e) => openUserCardModal(chat.friend, e.clientX, e.clientY, false)} aria-label="View profile picture">
            <img src={chat.friend.avatar} alt={chat.friend.name} class="w-full h-full object-cover rounded-full" />
            <div class="absolute bottom-0 right-0 w-3 h-3 {chat.friend.online ? 'bg-green-500' : 'bg-red-500'} rounded-full border-2 border-zinc-800"></div>
          </button>
          <div>
            <button class="font-bold cursor-pointer hover:underline" onclick={(e) => openUserCardModal(chat.friend, e.clientX, e.clientY, false)}>{chat.friend.name}</button>
            <p class="text-xs text-muted-foreground">{chat.friend.online ? 'Online' : 'Offline'}</p>
          </div>
        {:else if chat.type === 'channel'}
          <Icon data={mdiPound} size="6" class="mr-2 text-zinc-600" />
          <h2 class="font-bold text-lg">{chat.name}</h2>
        {/if}
      </div>
      <div class="flex items-center space-x-4">
        <button class="text-muted-foreground hover:text-white cursor-pointer" aria-label="Start voice call"><Icon data={mdiPhone} size="6" /></button>
        <button class="text-muted-foreground hover:text-white cursor-pointer" aria-label="Start video call"><Icon data={mdiVideo} size="6" /></button>
        {#if searchOpen}
          <div class="flex items-center bg-zinc-700/70 rounded px-2 py-1 gap-1">
            <input type="text" class="bg-transparent focus:outline-none text-sm w-40 chat-search-input" placeholder="Search in chat" bind:value={searchQuery} />
            <span class="text-xs text-muted-foreground">{searchMatches.length ? `${activeMatchIndex + 1}/${searchMatches.length}` : '0/0'}</span>
            <button class="text-zinc-300 hover:text-white cursor-pointer" onclick={() => jumpToMatch(false)} aria-label="Previous match">â†‘</button>
            <button class="text-zinc-300 hover:text-white cursor-pointer" onclick={() => jumpToMatch(true)} aria-label="Next match">â†“</button>
            <button class="text-zinc-300 hover:text-white cursor-pointer" onclick={clearSearch} aria-label="Close search"><Icon data={mdiDotsVertical} size="0" class="hidden" />
              <Icon data={mdiClose} size="5" /></button>
          </div>
        {:else}
          <button class="text-muted-foreground hover:text-white cursor-pointer" onclick={() => { searchOpen = true; setTimeout(() => (document.querySelector('.chat-search-input') as HTMLInputElement)?.focus(), 0); }} aria-label="Open search"><Icon data={mdiMagnify} size="6" /></button>
        {/if}
        <button class="text-muted-foreground hover:text-white cursor-pointer" aria-label="More options"><Icon data={mdiDotsVertical} size="6" /></button>
      </div>
    </header>

    <div class="flex-grow min-h-0 relative">
      <VirtualList
        items={currentChatMessages}
        mode="bottomToTop"
        defaultEstimatedItemHeight={80}
        containerClass="h-full"
        viewportClass="h-full overflow-y-auto p-4 chat-viewport"
        bind:this={listRef}
      >
        {#snippet renderItem(msg, index)}
          {@const isMe = msg.senderId === myId}
          {@const senderInfo = chat.type === 'dm' ? chat.friend : chat.members?.find((m: User) => m.id === msg.senderId)}
          {@const senderName = isMe ? $userStore.me?.name : senderInfo?.name || 'Unknown User'}
          {@const senderAvatar = isMe ? $userStore.me?.avatar : senderInfo?.avatar}
          {@const displayableUser = isMe ? $userStore.me : senderInfo}
          {#if loadingMoreMessages && index === 0}
            <div class="text-center text-muted-foreground py-2">Loading older messages...</div>
          {/if}
          <div class="space-y-6">
            <div class="flex items-start gap-3 {isMe ? 'flex-row-reverse' : ''}">
              <button onclick={(e) => displayableUser && openUserCardModal(displayableUser as User, e.clientX, e.clientY, chat.type === 'channel')} oncontextmenu={(e) => displayableUser && handleContextMenu(e, displayableUser)} class="w-10 h-10 rounded-full flex-shrink-0 cursor-pointer">
                <img src={senderAvatar} alt={senderName} class="w-full h-full rounded-full" />
              </button>
              <div class="flex flex-col {isMe ? 'items-end' : ''}">
                <div class="flex items-center gap-2 mb-1">
                  <button onclick={(e) => displayableUser && openUserCardModal(displayableUser as User, e.clientX, e.clientY, chat.type === 'channel')} oncontextmenu={(e) => displayableUser && handleContextMenu(e, displayableUser)} class="font-bold text-white hover:underline cursor-pointer">{senderName}</button>
                  <p class="text-xs text-muted-foreground">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                {#if msg.content}
                  <div
                    class="max-w-md p-3 rounded-lg {isMe ? 'bg-cyan-600 text-white rounded-tr-none' : 'bg-zinc-700 rounded-tl-none'}"
                    role="button"
                    tabindex="0"
                    aria-label="Message options"
                    oncontextmenu={(e) => handleMessageContextMenu(e, msg)}
                    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleMessageContextMenu(e as any as MouseEvent, msg); } }}
                  >
                    {#if searchQuery}
                      {#each highlightText() as part, i (i)}
                        {#if part.match}
                          <mark class="bg-yellow-500/60 text-white">{part.text}</mark>
                        {:else}
                          {part.text}
                        {/if}
                      {/each}
                    {:else}
                      <p class="text-base whitespace-pre-wrap break-words">{msg.content}</p>
                    {/if}
                  </div>
                {/if}
                {#if msg.reactions}
                  <div class="mt-1 flex gap-1 flex-wrap">
                    {#each Object.entries(msg.reactions) as [emoji, users] (emoji)}
                      <button
                        type="button"
                        class="px-2 py-0.5 text-sm rounded-full bg-zinc-600 hover:bg-zinc-500 cursor-pointer"
                        aria-pressed={users.includes(myId || '')}
                        onclick={() => {
                          if (users.includes(myId || '')) {
                            chatStore.removeReaction(msg.chatId, msg.id, emoji);
                          } else {
                            chatStore.addReaction(msg.chatId, msg.id, emoji);
                          }
                        }}
                      >{emoji} {users.length}</button>
                    {/each}
                    <button type="button" class="px-2 py-0.5 text-sm rounded-full bg-zinc-600 hover:bg-zinc-500 cursor-pointer" onclick={() => chatStore.addReaction(msg.chatId, msg.id, 'ðŸ‘')} aria-label="Add reaction">+ React</button>
                  </div>
                {:else}
                  <div class="mt-1">
                    <button type="button" class="px-2 py-0.5 text-xs rounded-full bg-zinc-600 hover:bg-zinc-500 cursor-pointer" onclick={() => chatStore.addReaction(msg.chatId, msg.id, 'ðŸ‘')} aria-label="Add reaction">+ React</button>
                  </div>
                {/if}
                {#if msg.attachments && msg.attachments.length > 0}
                  <div class="mt-2 space-y-2">
                    {#each msg.attachments as attachment, i (i)}
                      {#if attachment.type.startsWith('image/')}
                        <button onclick={() => openLightbox(attachment.url)} class="max-w-xs rounded-lg overflow-hidden cursor-pointer" oncontextmenu={(e) => handleMessageContextMenu(e, msg)}>
                          <img src={attachment.url} alt="attachment" class="max-h-64"/>
                        </button>
                      {:else}
                        <DownloadProgress fileName={attachment.name} status="completed" progress={100} />
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
        <button class="absolute right-4 bottom-4 bg-cyan-600 hover:bg-cyan-700 text-white text-sm px-3 py-2 rounded-full shadow-lg cursor-pointer" onclick={scrollToBottom} aria-live="polite">
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
        <input type="file" multiple bind:this={fileInput} onchange={handleFileSelect} class="hidden" />
        <button type="button" onclick={() => fileInput.click()} class="flex items-center justify-center p-2 text-muted-foreground hover:text-white cursor-pointer rounded-full transition-colors">
          <Icon data={mdiPaperclip} size={6} />
        </button>
        <textarea
          rows="1"
          placeholder="Message {chat.type === 'dm' ? '@' + chat.friend.name : '#' + chat.name}"
          class="flex-grow bg-transparent resize-none focus:outline-none mx-2 text-white placeholder-zinc-400"
          bind:value={messageInput}
          bind:this={textareaRef}
          oninput={adjustTextareaHeight}
          onfocus={adjustTextareaHeight}
          onkeydown={(e) => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); sendMessage(e); } }}
        ></textarea>
        <button type="button" class="flex items-center justify-center p-2 text-muted-foreground hover:text-white cursor-pointer rounded-full transition-colors">
          <Icon data={mdiMicrophone} size={6} />
        </button>
        <button type="submit" class="flex items-center justify-center ml-2 p-2 text-white bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-800 disabled:cursor-not-allowed cursor-pointer rounded-full transition-colors" disabled={sending} aria-busy={sending}>
          <Icon data={mdiSend} size={6} />
        </button>
      </form>
    </footer>
  {:else}
    <div class="flex flex-col h-full w-full items-center justify-center text-zinc-500">
      <Icon data={mdiAccountGroup} size="16" />
      <p class="text-lg mt-4">
        Select a chat from the sidebar to start messaging.
      </p>
    </div>
  {/if}
</div>

{#if showLightbox}
  <ImageLightbox imageUrl={lightboxImageUrl} show={showLightbox} on:close={() => (showLightbox = false)} />
{/if}

{#if showContextMenu}
  <BaseContextMenu
    x={contextMenuX}
    y={contextMenuY}
    show={showContextMenu}
    menuItems={contextMenuItems.map(item => ({ ...item, data: selectedUser }))}
    on:close={() => (showContextMenu = false)}
    on:action={handleContextMenuAction}
  />
{/if}

{#if showMsgMenu && selectedMsg}
  <BaseContextMenu
    x={msgMenuX}
    y={msgMenuY}
    show={showMsgMenu}
    menuItems={[
      { label: 'Copy Message', action: 'copy_message' },
      { label: 'Reply', action: 'reply_message' },
      { label: 'React ðŸ‘', action: 'react_ðŸ‘' },
      { label: 'React â¤ï¸', action: 'react_â¤ï¸' },
      { label: 'React ðŸ˜‚', action: 'react_ðŸ˜‚' },
      { label: 'React ðŸŽ‰', action: 'react_ðŸŽ‰' },
      ...(selectedMsg.senderId === $userStore.me?.id ? [{ label: 'Delete Message', action: 'delete_message', isDestructive: true }] : [])
    ]}
    on:close={() => (showMsgMenu = false)}
    on:action={handleMessageMenuAction}
  />
{/if}
  


