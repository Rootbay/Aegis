
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
}
