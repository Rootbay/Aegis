export interface ChatMessage {
  sender: string;
  content: string;
  channel_id?: string;
  server_id?: string;
}

export interface PeerDiscovery {
  peer_id: string;
  address: string;
}

export interface PresenceUpdate {
  user_id: string;
  is_online: boolean;
}

export interface AepMessage {
  ChatMessage?: ChatMessage;
  PeerDiscovery?: PeerDiscovery;
  PresenceUpdate?: PresenceUpdate;
}
