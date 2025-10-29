export interface Role {
  id: string;
  name: string;
  color: string;
  hoist: boolean;
  mentionable: boolean;
  permissions: { [key: string]: boolean };
  member_ids: string[];
}
