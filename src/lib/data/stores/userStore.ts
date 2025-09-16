import { writable, type Readable, get } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { v4 as uuidv4 } from 'uuid';
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

interface UserStore extends Readable<UserStoreState> {
  init: () => Promise<void>;
  toggleOnlineStatus: () => Promise<void>;
  updateProfile: (updatedUser: User) => Promise<void>;
  getUser: (id: string) => Promise<User | null>;
}

function createUserStore(): UserStore {
  const { subscribe, set, update } = writable<UserStoreState>({ me: null, loading: true });

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
    } catch (e) {
      console.error(`Failed to get user ${id}:`, e);
      return null;
    }
  };

  const init = async () => {
    update(s => ({ ...s, loading: true }));
    try {
      await invoke('initialize_app', { password: 'aegis-default-password' });
      const identityExists = await invoke('is_identity_created');
      if (identityExists) {
        let userId = localStorage.getItem('aegis_user_id');
        if (!userId) {
          userId = uuidv4();
          localStorage.setItem('aegis_user_id', userId);
        }
        const existingUser = userCache.get(userId);
        if (existingUser) {
          set({ me: existingUser, loading: false });
        } else {
          const userFromBackend = await getUser(userId);
          if (userFromBackend) {
            set({ me: userFromBackend, loading: false });
            userCache.set(userId, userFromBackend);
          } else {
            const publicKey: string = await invoke('get_public_key');
            const newUser: User = {
              id: userId,
              name: `User-${userId.substring(0, 4)}`,
              avatar: `https://api.dicebear.com/8.x/bottts-neutral/svg?seed=${userId}`,
              online: true,
              publicKey: publicKey,
              bio: 'A new Aegis user.',
              tag: '#0000',
            };
            await invoke('update_user_profile', { user: toBackendUser(newUser) });
            set({ me: newUser, loading: false });
            userCache.set(userId, newUser);
          }
        }
      } else {
        throw new Error('Identity not created after initialization');
      }
    } catch (e) {
      console.error("Failed to initialize user:", e);
      toasts.addToast('Failed to load user profile.', 'error');
      update(s => ({ ...s, loading: false }));
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
      update(s => ({ ...s, me: updatedUser }));
      userCache.set(updatedUser.id, updatedUser);
      toasts.addToast(`You are now ${newStatus ? 'Online' : 'Offline'}`, 'success');
    } catch (e) {
      console.error("Failed to toggle online status:", e);
      toasts.addToast(`Failed to set status to ${newStatus ? 'Online' : 'Offline'}`, 'error');
    }
  };

  const updateProfile = async (updatedUser: User) => {
    try {
      await invoke('update_user_profile', { user: toBackendUser(updatedUser) });
      update(s => ({ ...s, me: updatedUser }));
      userCache.set(updatedUser.id, updatedUser);
      toasts.addToast('Profile updated successfully!', 'success');
    } catch (e) {
      console.error("Failed to update user profile:", e);
      toasts.addToast('Failed to update profile.', 'error');
      throw e;
    }
  };

  return {
    subscribe,
    init,
    toggleOnlineStatus,
    updateProfile,
    getUser,
  };
}

export const userStore = createUserStore();
