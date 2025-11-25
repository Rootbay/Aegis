export interface FriendshipRecord {
  id: string;
  user_a_id: string;
  user_b_id: string;
  status: string;
  created_at?: string;
  updated_at?: string;
}

export interface FriendshipCounterpart {
  id?: string;
  username?: string | null;
  avatar?: string | null;
  is_online?: boolean | null;
  public_key?: string | null;
  bio?: string | null;
  tag?: string | null;
  status_message?: string | null;
  location?: string | null;
  status?: string | null;
}

export interface FriendshipBackend {
  friendship: FriendshipRecord;
  counterpart?: FriendshipCounterpart | null;
}
