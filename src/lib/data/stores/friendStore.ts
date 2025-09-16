import { writable, type Readable, get } from 'svelte/store';
import type { Friend, FriendStatus } from '$lib/models/Friend';
import { getInvoke } from '$services/tauri';
import type { InvokeFn } from '$services/tauri';
import { userStore } from './userStore';

type FriendshipBackend = {
  id: string;
  user_a_id: string;
  user_b_id: string;
  status: string;
};

interface FriendStoreState {
  friends: Friend[];
  loading: boolean;
}

interface FriendStore extends Readable<FriendStoreState> {
  handleFriendsUpdate: (friends: Friend[]) => void;
  updateFriendPresence: (userId: string, isOnline: boolean) => void;
  addFriend: (friend: Friend) => void;
  removeFriend: (friendId: string) => void;
  initialize: () => Promise<void>;
}

function createFriendStore(): FriendStore {
  const { subscribe, set, update } = writable<FriendStoreState>({ friends: [], loading: true });

  const handleFriendsUpdate = (updatedFriends: Friend[]) => {
    set({ friends: updatedFriends, loading: false });
  };

  const updateFriendPresence = (userId: string, isOnline: boolean) => {
    update(s => ({
      ...s,
      friends: s.friends.map(friend =>
        friend.id === userId ? { ...friend, online: isOnline } : friend
      )
    }));
  };

  const addFriend = (friend: Friend) => {
    update(s => ({ ...s, friends: [...s.friends, friend] }));
  };

  const removeFriend = (friendId: string) => {
    update(s => ({ ...s, friends: s.friends.filter(f => f.id !== friendId) }));
  };

  const initialize = async () => {
    update(s => ({ ...s, loading: true }));
    try {
      const invokeFn: InvokeFn | null = await getInvoke();
      if (!invokeFn) {
        console.warn("Tauri invoke not available, cannot fetch friendships.");
        set({ friends: [], loading: false });
        return;
      }

      const currentUser = get(userStore).me;
      if (!currentUser) {
        console.warn("User not loaded, cannot fetch friendships.");
        set({ friends: [], loading: false });
        return;
      }

      const friendships = await invokeFn<FriendshipBackend[]>('get_friendships', { currentUserId: currentUser.id });
      const friends: Friend[] = friendships.map(f => ({
        id: f.id,
        name: f.user_b_id,
        online: false,
        status: f.status as FriendStatus,
        avatar: `https://api.dicebear.com/8.x/bottts-neutral/svg?seed=${f.id}`,
        timestamp: new Date().toISOString(),
        messages: [],
      }));
      set({ friends, loading: false });
    } catch (error) {
      console.error("Failed to fetch friendships:", error);
      set({ friends: [], loading: false });
    }
  };
  return {
    subscribe,
    handleFriendsUpdate,
    updateFriendPresence,
    addFriend,
    removeFriend,
    initialize,
  };
}

export const friendStore = createFriendStore();





