export interface Channel {
  id: string;
  name: string;
  server_id: string;
  channel_type: "text" | "voice";
  private: boolean;
  category_id?: string | null;
  topic?: string | null;
  allowed_role_ids?: string[];
  allowed_user_ids?: string[];
}
