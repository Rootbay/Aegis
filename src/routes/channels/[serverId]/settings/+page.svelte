<script lang="ts">
  import SettingsLayout from '$lib/components/server-settings/SettingsLayout.svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import type { Component } from 'svelte';
  import { serverStore } from '$lib/data/stores/serverStore';
  import type { Server } from '$lib/models/Server';
  import type { Channel } from '$lib/models/Channel';
  import type { Role } from '$lib/models/Role';
  import { Ban, Boxes, Hash, LayoutPanelTop, MessageSquare, Puzzle, ScrollText, Shield, ShieldCheck, Smile, Sticker, UserCog, Users } from '@lucide/svelte';

  let serverId = $derived($page.params.serverId ?? null);
  let server = $derived(
    serverId ? $serverStore.servers.find(s => s.id === serverId) ?? null : null
  );

  type NavigationFn = (value: string | URL) => void; // eslint-disable-line no-unused-vars

  const gotoUnsafe: NavigationFn = goto as unknown as NavigationFn;

  const gotoResolved = (path: string) => {
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    gotoUnsafe(path);
  };

  $effect(() => {
    console.log('Server ID from params:', serverId);
    console.log('Found server:', server);
  });

  type SidebarEntry =
    | { label: string; icon: Component; tab: string; type?: undefined }
    | { type: 'separator'; label?: undefined; icon?: undefined; tab?: undefined };

  const sidebarItems: SidebarEntry[] = [
    { label: 'Overview', icon: Hash, tab: 'overview' },
    { type: 'separator' },
    { label: 'Roles', icon: UserCog, tab: 'roles' },
    { label: 'Channels', icon: MessageSquare, tab: 'channels' },
    { label: 'Moderation', icon: ShieldCheck, tab: 'moderation' },
    { type: 'separator' },
    { label: 'Emojis', icon: Smile, tab: 'emojis' },
    { label: 'Stickers', icon: Sticker, tab: 'stickers' },
    { type: 'separator' },
    { label: 'Widgets', icon: Boxes, tab: 'widgets' },
    { label: 'Server Templates', icon: LayoutPanelTop, tab: 'server_templates' },
    { label: 'Integrations', icon: Puzzle, tab: 'integrations' },
    { type: 'separator' },
    { label: 'Safety & Setup', icon: Shield, tab: 'safety_setup' },
    { label: 'Members', icon: Users, tab: 'members' },
    { label: 'Bans', icon: Ban, tab: 'bans' },
    { label: 'Audit Log', icon: ScrollText, tab: 'audit_log' },
  ];

  let allSettings = $derived([
    { id: 'serverName', category: 'overview', title: 'Server Name', description: 'Change the name of your server.', type: 'text', property: 'name' },
    { id: 'serverIcon', category: 'overview', title: 'Server Icon', description: 'Change the icon of your server.', type: 'image', property: 'iconUrl' },
    { id: 'serverDescription', category: 'overview', title: 'Server Description', type: 'text', property: 'description' },
    { id: 'serverId', category: 'overview', title: 'Server ID', description: 'The unique ID of this server.', type: 'static', property: 'id' },
    {
      id: 'defaultChannel',
      category: 'overview',
      title: 'Default Channel',
      description: 'The channel new members see first.',
      type: 'select',
      property: 'default_channel_id',
      options: server?.channels?.map(c => ({ label: c.name, value: c.id })) || []
    },
    { label: 'Invite Permissions', category: 'overview', title: 'Invite Permissions', description: 'Allow members to invite others.', type: 'toggle', property: 'allow_invites' },

    { id: 'roleManagement', category: 'roles', title: 'Manage Roles', description: 'Create, edit, or delete roles and manage their permissions.', type: 'custom_component', component: 'RolesManagement' },
    { id: 'channelManagement', category: 'channels', title: 'Manage Channels', description: 'Create, edit, or delete channels.', type: 'custom_component', component: 'ChannelManagement' },
    { id: 'moderationLevel', category: 'moderation', title: 'Moderation Level', description: 'Set the moderation level for new members.', type: 'select', property: 'moderation_level', options: ['None', 'Low', 'Medium', 'High'].map(level => ({ label: level, value: level })) },
    { id: 'explicitContentFilter', category: 'moderation', title: 'Explicit Content Filter', description: 'Scan media content from all members.', type: 'toggle', property: 'explicit_content_filter' },
    { id: 'emojiManagement', category: 'emojis', title: 'Manage Emojis', description: 'Add, edit, or delete custom emojis.', type: 'static', property: 'emojis_placeholder' },
    { id: 'stickerManagement', category: 'stickers', title: 'Manage Stickers', description: 'Add, edit, or delete custom stickers.', type: 'static', property: 'stickers_placeholder' },
    { id: 'widgetSettings', category: 'widgets', title: 'Server Widget', description: 'Enable and configure a server widget.', type: 'static', property: 'widgets_placeholder' },
    { id: 'serverTemplate', category: 'server_templates', title: 'Server Template', description: 'Create a server template for easy sharing.', type: 'static', property: 'server_templates_placeholder' },
    { id: 'webhookManagement', category: 'integrations', title: 'Webhooks', description: 'Manage webhooks for this server.', type: 'custom_component', component: 'WebhookManagement' },
    { id: 'safetySetup', category: 'safety_setup', title: 'Safety & Setup', description: 'Configure safety and setup options.', type: 'static', property: 'safety_setup_placeholder' },
    { id: 'memberList', category: 'members', title: 'View Members', description: 'View and manage server members.', type: 'custom_component', component: 'MemberList' },
    { id: 'banList', category: 'bans', title: 'View Bans', description: 'View and manage banned users.', type: 'custom_component', component: 'BanList' },
    { id: 'auditLog', category: 'audit_log', title: 'Audit Log', description: 'View recent server changes.', type: 'static', property: 'audit_log_placeholder' },
  ]);
  
  const categoryHeadings = {
    overview: 'Server Overview',
    roles: 'Roles',
    channels: 'Channels',
    moderation: 'Moderation',
    emojis: 'Emojis',
    stickers: 'Stickers',
    widgets: 'Widgets',
    server_templates: 'Server Templates',
    integrations: 'Integrations',
    safety_setup: 'Safety & Setup',
    members: 'Members',
    bans: 'Bans',
    audit_log: 'Audit Log',
  };

  function handleUpdateSetting({ id, property, rootProperty, nestedProperty, value }: { id: string; property: string; rootProperty?: string; nestedProperty?: string; value: any }) {
    if (server) {
      if (rootProperty && nestedProperty) {
        if (rootProperty === 'roles') {
          const updatedRoles = server.roles.map(role => {
            if (role.id === id) {
              const [propGroup, propName] = nestedProperty.split('.');
              if (propGroup === 'permissions') {
                return { ...role, permissions: { ...role.permissions, [propName]: value } };
              }
            }
            return role;
          });
          serverStore.updateServer(server.id, { roles: updatedRoles });
        } else {
          console.warn(`Unhandled nested property update: ${rootProperty}.${nestedProperty}`);
        }
      } else {
        serverStore.updateServer(server.id, { [property]: value });
      }
    }
  }

  function handleAddRole(newRole: Role) {
    if (server) {
      serverStore.updateServer(server.id, { roles: [...server.roles, newRole] });
    }
  }

  function handleUpdateRole(updatedRole: Role) {
    if (server) {
      const updatedRoles = server.roles.map(role =>
        role.id === updatedRole.id ? updatedRole : role
      );
      serverStore.updateServer(server.id, { roles: updatedRoles });
    }
  }

  function handleDeleteRole(roleIdToDelete: string) {
    if (server) {
      const updatedRoles = server.roles.filter(role => role.id !== roleIdToDelete);
      serverStore.updateServer(server.id, { roles: updatedRoles });
    }
  }

  function handleTogglePermission({ roleId, permission }: { roleId: string; permission: keyof Role['permissions'] }) {
    if (server) {
      const updatedRoles = server.roles.map(role => {
        if (role.id === roleId) {
          return { ...role, permissions: { ...role.permissions, [permission]: !role.permissions[permission] } };
        }
        return role;
      });
      serverStore.updateServer(server.id, { roles: updatedRoles });
    }
  }

  function handleAddChannel(newChannel: Channel) {
    if (server) {
      serverStore.updateServer(server.id, { channels: [...(server.channels || []), newChannel] });
    }
  }

  function handleUpdateChannel(updatedChannel: Channel) {
    if (server) {
      const updatedChannels = (server.channels || []).map(channel =>
        channel.id === updatedChannel.id ? updatedChannel : channel
      );
      serverStore.updateServer(server.id, { channels: updatedChannels });
    }
  }

  function handleDeleteChannel(channelIdToDelete: string) {
    if (server) {
      const updatedChannels = (server.channels || []).filter(channel => channel.id !== channelIdToDelete);
      serverStore.updateServer(server.id, { channels: updatedChannels });
    }
  }

  function handleUpdateServer(updates: Partial<Server>) {
    if (!server) {
      return;
    }
    if (updates && typeof updates === 'object') {
      serverStore.updateServer(server.id, updates);
    }
  }

  function handleDeleteServer({ serverId }: { serverId?: string }) {
    const targetId = serverId ?? server?.id;
    if (!targetId) {
      return;
    }
    serverStore.removeServer(targetId);
    if ($serverStore.activeServerId === targetId) {
      serverStore.setActiveServer(null);
      gotoResolved('/friends?tab=All');
    }
  }

  function handleButtonClick({ id }: { id: string }) {
    if (id === 'deleteServer' && server) {
      handleDeleteServer({ serverId: server.id });
    }
  }
</script>

{#if server}
  <SettingsLayout
    title={server ? server.name : 'Server Settings'}
    {sidebarItems}
    {allSettings}
    {categoryHeadings}
    currentData={server}
    initialActiveTab={$page.url.searchParams.get('tab') || undefined}
    onupdate_setting={handleUpdateSetting}
    onbutton_click={handleButtonClick}
    onadd_channel={handleAddChannel}
    onupdate_channel={handleUpdateChannel}
    ondelete_channel={handleDeleteChannel}
    onadd_role={handleAddRole}
    onupdate_role={handleUpdateRole}
    ondelete_role={handleDeleteRole}
    onupdate_server={handleUpdateServer}
    ondelete_server={handleDeleteServer}
    ontoggle_permission={handleTogglePermission}
    onclose={() => {
      if (server && serverId) {
        gotoResolved(`/channels/${serverId}`);
      } else {
        gotoResolved('/friends?tab=All');
      }
    }}
  >
    </SettingsLayout>
{:else}
  <div class="text-center py-10 text-white">
    <p class="text-muted-foreground">Server not found or not selected.</p>
  </div>
{/if}

