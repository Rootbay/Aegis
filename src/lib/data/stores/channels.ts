import { persistentStore } from '$stores/persistentStore';
import type { User } from '../../models/User';

export interface Channel {
  id: string;
  name: string;
  serverId: string;
  members: User[];
}

export const channels = persistentStore<Channel[]>('channels', []);
