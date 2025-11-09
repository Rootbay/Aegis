export interface Role {
  id: string;
  name: string;
  color: string;
  hoist: boolean;
  mentionable: boolean;
  position: number;
  permissions: { [key: string]: boolean };
  member_ids: string[];
}

const resolvePosition = (position: unknown, fallback: number): number => {
  if (typeof position === "number" && Number.isFinite(position)) {
    return Math.max(0, Math.floor(position));
  }
  if (typeof position === "string") {
    const parsed = Number.parseFloat(position);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.floor(parsed));
    }
  }
  return fallback;
};

export const sortRolesByPosition = (roles: Role[]): Role[] => {
  const fallbackPosition = (index: number) => index;
  return [...roles]
    .map((role, index) => ({
      ...role,
      position: resolvePosition(role.position, fallbackPosition(index)),
    }))
    .sort((a, b) => {
      if (a.position !== b.position) {
        return a.position - b.position;
      }
      return a.name.localeCompare(b.name);
    });
};

export const reindexRoles = (roles: Role[]): Role[] =>
  sortRolesByPosition(roles).map((role, index) => ({
    ...role,
    position: index,
  }));
