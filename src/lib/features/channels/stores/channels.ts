import { persistentStore } from "$lib/stores/persistentStore";
import type { User } from "$lib/features/auth/models/User";

export interface Channel {
  id: string;
  name: string;
  serverId: string;
  members: User[];
}

export const channels = persistentStore<Channel[]>("channels", []);
