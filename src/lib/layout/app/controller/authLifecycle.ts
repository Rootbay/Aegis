import { get, writable, type Unsubscriber, type Writable } from "svelte/store";
import type { AuthState } from "$lib/features/auth/stores/authStore";
import type { User } from "$lib/features/auth/models/User";
import type {
  ChatStoreType,
  ServerStoreType,
  UserStoreType,
} from "./types";

export type AuthStoreType = typeof import("$lib/features/auth/stores/authStore").authStore;

export interface AuthLifecycleOptions {
  authStore: AuthStoreType;
  userStore: UserStoreType;
  chatStore: ChatStoreType;
  serverStore: ServerStoreType;
  runPostAuthBootstrap: () => Promise<Array<() => void>>;
}

export interface AuthLifecycle {
  authState: Writable<AuthState>;
  currentUser: Writable<User | null>;
  initialize: () => void;
  teardown: () => void;
}

export function createAuthLifecycle({
  authStore,
  userStore,
  chatStore,
  serverStore,
  runPostAuthBootstrap,
}: AuthLifecycleOptions): AuthLifecycle {
  const authState = writable<AuthState>(get({ subscribe: authStore.subscribe }));
  const currentUser = writable<User | null>(
    get(userStore).me ?? null,
  );
  const postAuthInitialized = writable(false);

  let unlistenHandlers: Array<() => void> = [];
  let unsubscribers: Unsubscriber[] = [];

  const clearUnlistenHandlers = () => {
    for (const handler of unlistenHandlers) {
      try {
        handler();
      } catch (error) {
        console.error("Failed to detach event listener:", error);
      }
    }
    unlistenHandlers = [];
  };

  const bootstrapAfterAuthentication = async () => {
    clearUnlistenHandlers();
    const handlers = await runPostAuthBootstrap();
    unlistenHandlers = handlers;
  };

  const handleAuthChange = (state: AuthState) => {
    if (state.status !== "authenticated") {
      postAuthInitialized.set(false);
      clearUnlistenHandlers();
      chatStore.clearActiveChat();
      serverStore.setActiveServer(null);
      return;
    }

    if (!get(postAuthInitialized)) {
      postAuthInitialized.set(true);
      bootstrapAfterAuthentication().catch((error) =>
        console.error("Post-auth bootstrap failed:", error),
      );
    }
  };

  const initialize = () => {
    if (unsubscribers.length > 0) {
      return;
    }

    unsubscribers = [
      authStore.subscribe((value) => {
        authState.set(value);
      }),
      userStore.subscribe((value) => {
        currentUser.set(value.me ?? null);
      }),
      authState.subscribe(handleAuthChange),
    ];
  };

  const teardown = () => {
    for (const unsubscribe of unsubscribers) {
      try {
        unsubscribe();
      } catch (error) {
        console.error("Failed to unsubscribe from auth lifecycle:", error);
      }
    }
    unsubscribers = [];
    postAuthInitialized.set(false);
    clearUnlistenHandlers();
  };

  return {
    authState,
    currentUser,
    initialize,
    teardown,
  };
}
