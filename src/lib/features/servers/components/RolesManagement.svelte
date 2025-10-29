<script lang="ts">
  import type { Role } from "$lib/features/servers/models/Role";
  import { v4 as uuidv4 } from "uuid";
  import { Plus, Pencil, Trash, X, Check, Eye } from "@lucide/svelte";

  type UnaryHandler<T> = (value: T) => void; // eslint-disable-line no-unused-vars

  type RolesManagementProps = {
    roles?: Role[];
    onadd_role?: UnaryHandler<Role>;
    onupdate_role?: UnaryHandler<Role>;
    ondelete_role?: UnaryHandler<string>;
    ontoggle_permission?: UnaryHandler<{
      roleId: string;
      permission: keyof Role["permissions"];
    }>;
  };

  let {
    roles = [],
    onadd_role,
    onupdate_role,
    ondelete_role,
    ontoggle_permission,
  }: RolesManagementProps = $props();

  let newRoleName = $state("");
  let editingRole = $state<Role | null>(null);
  let editingRoleName = $state("");
  let editingRoleColor = $state("#000000");
  let editingRoleHoist = $state(false);
  let editingRoleMentionable = $state(false);

  const permissionCategories = {
    "General Permissions": [
      "manage_channels",
      "manage_roles",
      "kick_members",
      "ban_members",
      "view_audit_log",
      "change_nickname",
      "manage_nicknames",
      "moderate_members",
    ],
    "Text Permissions": [
      "read_messages",
      "send_messages",
      "attach_files",
      "embed_links",
      "mention_everyone",
      "use_external_emojis",
      "add_reactions",
    ],
  };

  const allPermissions: Record<string, string> = {
    manage_channels: "Manage Channels",
    manage_roles: "Manage Roles",
    kick_members: "Kick Members",
    ban_members: "Ban Members",
    send_messages: "Send Messages",
    read_messages: "Read Messages",
    attach_files: "Attach Files",
    embed_links: "Embed Links",
    mention_everyone: "Mention Everyone",
    use_external_emojis: "Use External Emojis",
    add_reactions: "Add Reactions",
    view_audit_log: "View Audit Log",
    manage_nicknames: "Manage Nicknames",
    change_nickname: "Change Nickname",
    moderate_members: "Moderate Members",
  };

  function addRole() {
    if (newRoleName.trim()) {
      const newRole: Role = {
        id: uuidv4(),
        name: newRoleName.trim(),
        color: "#99AAB5",
        hoist: false,
        mentionable: false,
        permissions: Object.keys(allPermissions).reduce(
          (acc, perm) => ({ ...acc, [perm]: false }),
          {},
        ),
        member_ids: [],
      };
      onadd_role?.(newRole);
      newRoleName = "";
    }
  }

  function startEditRole(role: Role) {
    editingRole = { ...role };
    editingRoleName = role.name;
    editingRoleColor = role.color || "#000000";
    editingRoleHoist = role.hoist || false;
    editingRoleMentionable = role.mentionable || false;
  }

  function saveEditRole() {
    if (editingRole && editingRoleName.trim()) {
      onupdate_role?.({
        ...editingRole,
        name: editingRoleName.trim(),
        color: editingRoleColor,
        hoist: editingRoleHoist,
        mentionable: editingRoleMentionable,
      });
      editingRole = null;
      editingRoleName = "";
      editingRoleColor = "#000000";
      editingRoleHoist = false;
      editingRoleMentionable = false;
    }
  }

  function cancelEditRole() {
    editingRole = null;
    editingRoleName = "";
    editingRoleColor = "#000000";
    editingRoleHoist = false;
    editingRoleMentionable = false;
  }

  function deleteRole(roleId: string) {
    if (confirm("Are you sure you want to delete this role?")) {
      ondelete_role?.(roleId);
      if (editingRole?.id === roleId) {
        editingRole = null;
      }
    }
  }

  function togglePermission(permissionKey: string) {
    if (editingRole) {
      editingRole.permissions[permissionKey] =
        !editingRole.permissions[permissionKey];
      editingRole = { ...editingRole };
      ontoggle_permission?.({
        roleId: editingRole.id,
        permission: permissionKey as keyof Role["permissions"],
      });
    }
  }
</script>

<div class="flex flex-col md:flex-row gap-4">
  <div class="md:w-1/3 bg-muted/50 p-4 rounded-lg flex flex-col">
    <h3 class="text-xl font-semibold text-foreground mb-4">Roles</h3>

    <div class="flex gap-2 mb-4">
      <input
        type="text"
        placeholder="New Role Name"
        bind:value={newRoleName}
        onkeydown={(e) => {
          if (e.key === "Enter") addRole();
        }}
        class="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <button
        onclick={addRole}
        class="bg-primary hover:bg-accent text-foreground p-2 rounded-md flex items-center justify-center"
      >
        <Plus size={12} />
      </button>
    </div>

    <div class="space-y-2 pr-2">
      {#each roles as role (role.id)}
        <div
          role="button"
          tabindex="0"
          class="p-3 rounded-lg flex items-center justify-between cursor-pointer transition-colors"
          class:bg-muted={editingRole?.id === role.id}
          class:hover:bg-muted={editingRole?.id !== role.id}
          onclick={() => startEditRole(role)}
          onkeydown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              startEditRole(role);
            }
          }}
        >
          <span class="font-medium" style="color: {role.color};"
            >{role.name}</span
          >
          <div class="flex items-center gap-2">
            <Pencil
              size={10}
              class="text-muted-foreground hover:text-foreground cursor-pointer"
              onclick={(e) => {
                e.stopPropagation();
                startEditRole(role);
              }}
            />
            <Trash
              size={10}
              class="text-destructive hover:text-destructive/80 cursor-pointer"
              onclick={(e) => {
                e.stopPropagation();
                deleteRole(role.id);
              }}
            />
          </div>
        </div>
      {/each}
    </div>
  </div>

  <div class="md:w-2/3 bg-muted/50 p-4 rounded-lg flex flex-col">
    {#if editingRole}
      <h3 class="text-xl font-semibold text-foreground mb-4">
        Editing Role: {editingRole.name}
      </h3>

      <div class="space-y-4">
        <div class="flex items-center gap-4">
          <label
            for="roleName"
            class="text-sm font-medium text-muted-foreground w-24"
            >Role Name</label
          >
          <input
            type="text"
            id="roleName"
            bind:value={editingRoleName}
            class="flex-1 bg-muted border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div class="flex items-center gap-4">
          <label
            for="roleColor"
            class="text-sm font-medium text-muted-foreground w-24"
            >Role Color</label
          >
          <input
            type="color"
            id="roleColor"
            bind:value={editingRoleColor}
            class="w-10 h-10 rounded-md overflow-hidden cursor-pointer"
          />
          <span class="text-sm text-muted-foreground"
            >{editingRoleColor.toUpperCase()}</span
          >
        </div>

        <label class="flex items-center space-x-3">
          <input
            type="checkbox"
            bind:checked={editingRoleHoist}
            class="form-checkbox h-5 w-5 text-highlight-100 bg-muted border-border rounded"
          />
          <span class="text-muted-foreground"
            >Display role members separately from online members</span
          >
        </label>

        <label class="flex items-center space-x-3">
          <input
            type="checkbox"
            bind:checked={editingRoleMentionable}
            class="form-checkbox h-5 w-5 text-highlight-100 bg-muted border-border rounded"
          />
          <span class="text-muted-foreground"
            >Allow anyone to @mention this role</span
          >
        </label>

        {#each Object.entries(permissionCategories) as [categoryName, permissionsInCat] (categoryName)}
          <div class="pt-4">
            <h4 class="text-lg font-semibold text-foreground mb-2">
              {categoryName}
            </h4>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
              {#each permissionsInCat as permissionKey (permissionKey)}
                <label
                  class="inline-flex items-center p-2 rounded-md hover:bg-muted transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={editingRole.permissions[permissionKey]}
                    onchange={() => togglePermission(permissionKey)}
                    class="form-checkbox h-5 w-5 text-highlight-100 bg-muted border-border rounded"
                  />
                  <span class="ml-3 text-muted-foreground"
                    >{allPermissions[permissionKey]}</span
                  >
                </label>
              {/each}
            </div>
          </div>
        {/each}
      </div>

      <div class="flex justify-end gap-2 mt-4">
        <button
          onclick={cancelEditRole}
          class="px-4 py-2 bg-base-400 hover:bg-base-500 text-foreground rounded-md font-semibold"
        >
          <X size={10} class="inline-block mr-1" /> Cancel
        </button>
        <button
          onclick={saveEditRole}
          class="px-4 py-2 bg-primary hover:bg-accent text-foreground rounded-md font-semibold"
        >
          <Check size={10} class="inline-block mr-1" /> Save
        </button>
      </div>
    {:else}
      <div
        class="flex flex-col items-center justify-center h-full text-muted-foreground"
      >
        <Eye size={20} class="mb-4" />
        <p class="text-lg">Select a role to view and edit its settings.</p>
      </div>
    {/if}
  </div>
</div>
