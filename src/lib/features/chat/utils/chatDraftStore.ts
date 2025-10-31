export type ChatDraft = {
  messageInput: string;
  attachments: File[];
  replyTargetMessageId: string | null;
  replyPreview: {
    messageId: string;
    author?: string;
    snippet?: string;
  } | null;
  textareaHeight: string;
};

const drafts = new Map<string, ChatDraft>();

export function saveChatDraft(chatId: string, draft: ChatDraft | null) {
  if (!chatId) {
    return;
  }

  if (!draft) {
    drafts.delete(chatId);
    return;
  }

  drafts.set(chatId, {
    messageInput: draft.messageInput,
    attachments: [...draft.attachments],
    replyTargetMessageId: draft.replyTargetMessageId,
    replyPreview: draft.replyPreview ? { ...draft.replyPreview } : null,
    textareaHeight: draft.textareaHeight,
  });
}

export function loadChatDraft(chatId: string): ChatDraft | undefined {
  if (!chatId) {
    return undefined;
  }

  const draft = drafts.get(chatId);
  if (!draft) {
    return undefined;
  }

  return {
    messageInput: draft.messageInput,
    attachments: [...draft.attachments],
    replyTargetMessageId: draft.replyTargetMessageId,
    replyPreview: draft.replyPreview ? { ...draft.replyPreview } : null,
    textareaHeight: draft.textareaHeight,
  };
}

export function clearChatDraft(chatId: string) {
  if (!chatId) {
    return;
  }
  drafts.delete(chatId);
}

export function resetChatDrafts() {
  drafts.clear();
}
