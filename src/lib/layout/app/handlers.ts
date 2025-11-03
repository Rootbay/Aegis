import { goto } from "$app/navigation";
import { page } from "$app/stores";
import { get } from "svelte/store";
import { chatStore } from "$lib/features/chat/stores/chatStore";
import { commandPaletteStore } from "$lib/features/navigation/commandPaletteStore";
import type { ModalManager } from "./modalManager";
import type { AppHandlers } from "./types";

function navigateToUrl(url: URL) {
  const target = `${url.pathname}${url.search}`;
  // eslint-disable-next-line svelte/no-navigation-without-resolve
  goto(target);
}

export function createAppHandlers(modalManager: ModalManager): AppHandlers {
  const handleFriendsTabSelect: AppHandlers["handleFriendsTabSelect"] = (
    tab,
  ) => {
    const url = new URL(get(page).url);
    if (url.pathname === "/friends/add") {
      url.pathname = "/friends";
    }
    url.searchParams.set("tab", tab);
    navigateToUrl(url);
  };

  const handleFriendsAddClick: AppHandlers["handleFriendsAddClick"] = () => {
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    goto("/friends/add");
  };

  const handleSelectChannel: AppHandlers["handleSelectChannel"] = (
    serverId,
    channelId,
  ) => {
    if (channelId) {
      chatStore.setActiveChat(serverId, "server", channelId);
    }
  };

  const handleSelectDirectMessage: AppHandlers["handleSelectDirectMessage"] = ({
    chatId,
    type = "dm",
  }) => {
    if (chatId) {
      chatStore.setActiveChat(chatId, type);
    }
  };

  const handleKeydown: AppHandlers["handleKeydown"] = (event) => {
    const key = event.key.toLowerCase();

    if ((event.ctrlKey || event.metaKey) && key === "k") {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
      commandPaletteStore.open();
      return;
    }

    if (key === "escape") {
      if (get(commandPaletteStore.isOpen)) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") {
          event.stopImmediatePropagation();
        }
        commandPaletteStore.close();
        return;
      }
      modalManager.closeModal();
    }
  };

  return {
    handleKeydown,
    handleFriendsTabSelect,
    handleFriendsAddClick,
    handleSelectChannel,
    handleSelectDirectMessage,
    openModal: modalManager.openModal,
    closeModal: modalManager.closeModal,
    openDetailedProfileModal: modalManager.openDetailedProfileModal,
    openProfileReviewsModal: modalManager.openProfileReviewsModal,
    openCommandPalette: commandPaletteStore.open,
    closeCommandPalette: commandPaletteStore.close,
  };
}
