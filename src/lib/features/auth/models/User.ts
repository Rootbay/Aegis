export interface User {
  id: string;
  name: string;
  avatar: string;
  online: boolean;
  pfpUrl?: string;
  publicKey?: string;
  bannerUrl?: string;
  bio?: string;
  tag?: string;
  roles?: string[];
  role_ids?: string[];
  roleIds?: string[];
  statusMessage?: string | null;
  location?: string | null;
  isIgnored?: boolean;
}
