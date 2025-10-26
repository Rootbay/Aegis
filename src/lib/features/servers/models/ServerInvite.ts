export interface ServerInvite {
  id: string;
  serverId: string;
  code: string;
  createdBy: string;
  createdAt: string;
  expiresAt?: string | null;
  maxUses?: number | null;
  uses: number;
}
