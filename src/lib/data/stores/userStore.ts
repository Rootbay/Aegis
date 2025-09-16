import { writable, type Readable, get } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import type { User } from '$lib/models/User';
import { toasts } from './ToastStore';
import { userCache } from '$lib/utils/cache';

type BackendUser = {
  id: string;
  username?: string;
  name?: string;
  avatar: string;
  is_online?: boolean;
  online?: boolean;
  public_key?: string;
  bio?: string;
  tag?: string;
};

interface UserStoreState {
  me: User | null;
  loading: boolean;
}

interface InitializeOptions {
  username?: string;
}

interface UserStore extends Readable<UserStoreState> {
  initialize: (password: string, options?: InitializeOptions) => Promise<User>;
  toggleOnlineStatus: () => Promise<void>;
  updateProfile: (updatedUser: User) => Promise<void>;
  getUser: (id: string) => Promise<User | null>;
  reset: () => void;
}

const DEFAULT_IDENTITY_PASSWORD = 'aegis-default-password';

function createUserStore(): UserStore {
  const { subscribe, set, update } = writable<UserStoreState>({ me: null, loading: false });

  const toBackendUser = (u: User) => ({
    id: u.id,
    username: u.name,
    avatar: u.avatar,
    is_online: u.online,
    public_key: u.publicKey ?? undefined,
    bio: u.bio ?? undefined,
    tag: u.tag ?? undefined,
  });

  const fromBackendUser = (u: BackendUser): User => {
    const fallbackName = u.username ?? u.name;
    const name = fallbackName && fallbackName.trim().length > 0 ? fallbackName : `User-${u.id.slice(0, 4)}`;
    return {
      id: u.id,
      name,
      avatar: u.avatar,
      online: u.is_online ?? u.online ?? false,
      publicKey: u.public_key ?? undefined,
      bio: u.bio ?? undefined,
      tag: u.tag ?? undefined,
    };
  };

  const getUser = async (id: string): Promise<User | null> => {
    if (userCache.has(id)) {
      return userCache.get(id) || null;
    }
    try {
      const backendUser: BackendUser | null = await invoke('get_user', { id });
      if (backendUser) {
        const mapped = fromBackendUser(backendUser);
        userCache.set(id, mapped);
        return mapped;
      }
      return null;
    } catch (error) {
      console.error(`Failed to get user ${id}:`, error);
      return null;
    }
  };

  const initialize = async (password: string, options?: InitializeOptions): Promise<User> => {
    update((state) => ({ ...state, loading: true }));

    const ensureInitialized = async () => {
      try {
        await invoke('initialize_app', { password });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('decrypt identity') || message.includes('aead::Error')) {
          await invoke('rekey_identity', { oldPassword: DEFAULT_IDENTITY_PASSWORD, newPassword: password });
          await invoke('initialize_app', { password });
        } else {
          throw error;
        }
      }
    };

    try {
      await ensureInitialized();
      const peerId = await invoke<string>('get_peer_id');
      let existingUser = await getUser(peerId);

      if (!existingUser && options?.username) {
        const publicKey = await invoke<string>('get_public_key');
        existingUser = {
          id: peerId,
          name: options.username,
          avatar: `https://api.dicebear.com/8.x/bottts-neutral/svg?seed=${peerId}`,
          online: true,
          publicKey,
          bio: 'Ready for secure comms.',
          tag: '#0000',
        };
        await invoke('update_user_profile', { user: toBackendUser(existingUser) });
      } else if (!existingUser) {
        throw new Error('User profile is missing. Complete onboarding first.');
      }

      set({ me: existingUser, loading: false });
      userCache.set(existingUser.id, existingUser);
      return existingUser;
    } catch (error) {
      console.error('Failed to initialize user:', error);
      toasts.addToast('Failed to load user profile.', 'error');
      set({ me: null, loading: false });
      throw error;
    }
  };

  const toggleOnlineStatus = async () => {
    const currentUser = get({ subscribe }).me;

    if (!currentUser) return;

    const newStatus = !currentUser.online;
    const updatedUser = { ...currentUser, online: newStatus };

    try {
      await invoke('send_presence_update', { isOnline: newStatus });
      await invoke('update_user_profile', { user: toBackendUser(updatedUser) });
      update((state) => ({ ...state, me: updatedUser }));
      userCache.set(updatedUser.id, updatedUser);
      toasts.addToast(`You are now ${newStatus ? 'Online' : 'Offline'}`, 'success');
    } catch (error) {
      console.error('Failed to toggle online status:', error);
      toasts.addToast(`Failed to set status to ${newStatus ? 'Online' : 'Offline'}`, 'error');
    }
  };

  const updateProfile = async (updatedUser: User) => {
    try {
      await invoke('update_user_profile', { user: toBackendUser(updatedUser) });
      update((state) => ({ ...state, me: updatedUser }));
      userCache.set(updatedUser.id, updatedUser);
      toasts.addToast('Profile updated successfully!', 'success');
    } catch (error) {
      console.error('Failed to update user profile:', error);
      toasts.addToast('Failed to update profile.', 'error');
      throw error;
    }
  };

  const reset = () => set({ me: null, loading: false });

  return {
    subscribe,
    initialize,
    toggleOnlineStatus,
    updateProfile,
    getUser,
    reset,
  };
}

export const userStore = createUserStore();
