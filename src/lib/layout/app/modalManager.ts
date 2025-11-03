import { get, writable } from "svelte/store";
import { friendStore } from "$lib/features/friends/stores/friendStore";
import type { User } from "$lib/features/auth/models/User";
import type { AppModalType, ModalState, PageState } from "./types";

const CARD_WIDTH = 300;
const CARD_HEIGHT = 410;
const CARD_MARGIN = 16;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function withProfileDefaults(user: User) {
  const source = user as User & {
    bio?: string;
    pfpUrl?: string;
    bannerUrl?: string;
    isOnline?: boolean;
    publicKey?: string;
  };

  return {
    ...user,
    bio: source.bio ?? "",
    pfpUrl: source.pfpUrl ?? user.avatar,
    bannerUrl: source.bannerUrl ?? "",
    isOnline: source.isOnline ?? user.online ?? false,
    publicKey: source.publicKey ?? "",
  };
}

function computeUserCardPosition(clickX: number, clickY: number) {
  const viewportWidth =
    typeof window !== "undefined"
      ? window.innerWidth
      : CARD_WIDTH + CARD_MARGIN * 2;
  const viewportHeight =
    typeof window !== "undefined"
      ? window.innerHeight
      : CARD_HEIGHT + CARD_MARGIN * 2;

  const safeX = Number.isFinite(clickX) ? clickX : viewportWidth - CARD_MARGIN;
  const safeY = Number.isFinite(clickY) ? clickY : viewportHeight - CARD_MARGIN;

  const x = clamp(
    safeX - CARD_WIDTH / 2,
    CARD_MARGIN,
    Math.max(CARD_MARGIN, viewportWidth - CARD_WIDTH - CARD_MARGIN),
  );

  let y = safeY - CARD_HEIGHT - CARD_MARGIN;
  const maxY = Math.max(
    CARD_MARGIN,
    viewportHeight - CARD_HEIGHT - CARD_MARGIN,
  );

  if (y < CARD_MARGIN) {
    y = clamp(safeY + CARD_MARGIN, CARD_MARGIN, maxY);
  } else {
    y = Math.min(y, maxY);
  }

  return { x, y };
}

function toProfileModalUser(user: User) {
  const normalizedUser = withProfileDefaults(user);
  return {
    id: normalizedUser.id,
    name: normalizedUser.name ?? "Unknown User",
    bio: normalizedUser.bio,
    pfpUrl: normalizedUser.pfpUrl,
    bannerUrl: normalizedUser.bannerUrl,
    isOnline: normalizedUser.isOnline,
    publicKey: normalizedUser.publicKey,
  };
}

export function createModalManager() {
  const activeModal = writable<AppModalType | null>(null);
  const modalProps = writable<Record<string, unknown>>({});

  const openModal: PageState["openModal"] = (modalType, props = {}) => {
    activeModal.set(modalType);
    modalProps.set(props);
  };

  const closeModal: PageState["closeModal"] = () => {
    activeModal.set(null);
    modalProps.set({});
  };

  const openDetailedProfileModal: PageState["openDetailedProfileModal"] = (
    user,
  ) => {
    const friends = get(friendStore).friends;
    openModal("detailedProfile", {
      profileUser: toProfileModalUser(user),
      isFriend: friends.some((friend) => friend.id === user.id),
    });
  };

  const openUserCardModal: PageState["openUserCardModal"] = (
    user,
    x,
    y,
    isServerMemberContext,
  ) => {
    const normalizedUser = withProfileDefaults(user);
    const position = computeUserCardPosition(x, y);
    openModal("userCard", {
      profileUser: normalizedUser,
      x: position.x,
      y: position.y,
      isServerMemberContext,
      openDetailedProfileModal,
    });
  };

  const openProfileReviewsModal: PageState["openProfileReviewsModal"] = (
    options,
  ) => {
    openModal("profileReviews", options);
  };

  const openCreateGroupModal: PageState["openCreateGroupModal"] = (
    options = { preselectedUserIds: [] },
  ) => {
    openModal("createGroup", options);
  };

  const openReportUserModal: PageState["openReportUserModal"] = (payload) => {
    openModal("reportUser", payload);
  };

  const openCollaborativeDocument: PageState["openCollaborativeDocument"] = (
    options = {},
  ) => {
    openModal("collaborationDocument", options);
  };

  const openCollaborativeWhiteboard: PageState["openCollaborativeWhiteboard"] =
    (options = {}) => {
      openModal("collaborationWhiteboard", options);
    };

  const state: ModalState = {
    activeModal,
    modalProps,
  };

  return {
    state,
    openModal,
    closeModal,
    openUserCardModal,
    openDetailedProfileModal,
    openProfileReviewsModal,
    openCreateGroupModal,
    openReportUserModal,
    openCollaborativeDocument,
    openCollaborativeWhiteboard,
  };
}

export type ModalManager = ReturnType<typeof createModalManager>;
