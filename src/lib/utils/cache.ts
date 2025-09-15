import { LRUCache } from 'lru-cache';
import type { User } from '$lib/models/User';
import type { Server } from '$lib/models/Server';

const options = {
  max: 500,
  ttl: 1000 * 60 * 5, // 5min
};

export const userCache = new LRUCache<string, User>(options);
export const serverCache = new LRUCache<string, Server>(options);
