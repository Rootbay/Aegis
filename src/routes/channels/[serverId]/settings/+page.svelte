<script lang="ts">
  import SettingsLayout from '$lib/components/server-settings/SettingsLayout.svelte';
  import { mdiCog, mdiAccount, mdiBell, mdiLock, mdiMessage, mdiWifi, mdiEmoticonOutline, mdiStickerEmoji, mdiWidgets, mdiContentCopy, mdiShieldCheck, mdiClipboardTextClock } from '@mdi/js';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/stores';
  import { serverStore } from '$lib/data/stores/serverStore';
  import type { Server } from '$lib/models/Server';
  import type { Channel } from '$lib/models/Channel';
  import { onDestroy } from 'svelte';

  let server: (Server & { channels?: Channel[] }) | undefined;
  let serverId: string;

  $: {
    serverId = $page.params.serverId;
    server = $serverStore.servers.find(s => s.id === serverId);
    console.log('Server ID from params:', serverId);
    console.log('Found server:', server);
  }

  const sidebarItems = [
    { label: 'Overview', icon: mdiCog, tab: 'overview' },
    { type: 'separator' },
    { label: 'Roles', icon: mdiAccount, tab: 'roles' },
    { label: 'Channels', icon: mdiMessage, tab: 'channels' },
    { label: 'Moderation', icon: mdiLock, tab: 'moderation' },
    { type: 'separator' },
    { label: 'Emojis', icon: mdiEmoticonOutline, tab: 'emojis' },
    { label: 'Stickers', icon: mdiStickerEmoji, tab: 'stickers' },
    { type: 'separator' },
    { label: 'Widgets', icon: mdiWidgets, tab: 'widgets' },
    { label: 'Server Templates', icon: mdiContentCopy, tab: 'server_templates' },
    { label: 'Integrations', icon: mdiWifi, tab: 'integrations' },
    { type: 'separator' },
    { label: 'Safety & Setup', icon: mdiShieldCheck, tab: 'safety_setup' },
    { label: 'Members', icon: mdiAccount, tab: 'members' },
    { label: 'Bans', icon: mdiBell, tab: 'bans' },
    { label: 'Audit Log', icon: mdiClipboardTextClock, tab: 'audit_log' },
  ];

  $: allSettings = [
    { id: 'serverName', category: 'overview', title: 'Server Name', description: 'Change the name of your server.', type: 'text', property: 'name' },
    { id: 'serverIcon', category: 'overview', title: 'Server Icon', description: 'Change the icon of your server.', type: 'image', property: 'iconUrl' },
    { id: 'serverDescription', category: 'overview', title: 'Server Description', type: 'text', property: 'description' },
    { id: 'serverId', category: 'overview', title: 'Server ID', description: 'The unique ID of this server.', type: 'static', property: 'id' },
    { id: 'defaultChannel', category: 'overview', title: 'Default Channel', description: 'The channel new members see first.', type: 'select', property: 'default_channel_id', options: server?.channels?.map(c => ({ label: c.name, value: c.id })) || [] },
    { label: 'Invite Permissions', category: 'overview', title: 'Invite Permissions', description: 'Allow members to invite others.', type: 'toggle', property: 'allow_invites' },

    { id: 'roleManagement', category: 'roles', title: 'Manage Roles', description: 'Create, edit, or delete roles and manage their permissions.', type: 'custom_component', component: 'RolesManagement' },
    { id: 'channelManagement', category: 'channels', title: 'Manage Channels', description: 'Create, edit, or delete channels.', type: 'custom_component', component: 'ChannelManagement' },
    { id: 'moderationLevel', category: 'moderation', title: 'Moderation Level', description: 'Set the moderation level for new members.', type: 'select', property: 'moderation_level', options: ['None', 'Low', 'Medium', 'High'] },
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
  ];
  
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
    delete_server: 'Delete Server',
  };

  function handleUpdateSetting(event: CustomEvent) {
    const { id, property, rootProperty, nestedProperty, value } = event.detail;
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

  function handleAddRole(event: CustomEvent) {
    const newRole = event.detail;
    if (server) {
      serverStore.updateServer(server.id, { roles: [...server.roles, newRole] });
    }
  }

  function handleUpdateRole(event: CustomEvent) {
    const updatedRole = event.detail;
    if (server) {
      const updatedRoles = server.roles.map(role =>
        role.id === updatedRole.id ? updatedRole : role
      );
      serverStore.updateServer(server.id, { roles: updatedRoles });
    }
  }

  function handleDeleteRole(event: CustomEvent) {
    const roleIdToDelete = event.detail;
    if (server) {
      const updatedRoles = server.roles.filter(role => role.id !== roleIdToDelete);
      serverStore.updateServer(server.id, { roles: updatedRoles });
    }
  }

  function handleTogglePermission(event: CustomEvent) {
    const { roleId, permission } = event.detail;
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

  function handleAddChannel(event: CustomEvent) {
    const newChannel = event.detail;
    if (server) {
      serverStore.updateServer(server.id, { channels: [...(server.channels || []), newChannel] });
    }
  }

  function handleUpdateChannel(event: CustomEvent) {
    const updatedChannel = event.detail;
    if (server) {
      const updatedChannels = (server.channels || []).map(channel =>
        channel.id === updatedChannel.id ? updatedChannel : channel
      );
      serverStore.updateServer(server.id, { channels: updatedChannels });
    }
  }

  function handleDeleteChannel(event: CustomEvent) {
    const channelIdToDelete = event.detail;
    if (server) {
      const updatedChannels = (server.channels || []).filter(channel => channel.id !== channelIdToDelete);
      serverStore.updateServer(server.id, { channels: updatedChannels });
    }
  }

  function handleButtonClick(event: CustomEvent) {
    const { id } = event.detail;
    if (id === 'deleteServer') {
      if (server && confirm(`Are you sure you want to delete ${server.name}? This action cannot be undone.`)) {
        serverStore.removeServer(server.id);
        serverStore.setActiveServer(null);
        goto(resolve('/friends?tab=All'));
      }
    }
  }

  onDestroy(() => {
    // Cleanup
  });
</script>

{#if server}
  <SettingsLayout
    title={server ? server.name : 'Server Settings'}
    {sidebarItems}
    {allSettings}
    {categoryHeadings}
    currentData={server}
    initialActiveTab={$page.url.searchParams.get('tab') || undefined}
    on:update_setting={handleUpdateSetting}
    on:button_click={handleButtonClick}
    on:add_channel={handleAddChannel}
    on:update_channel={handleUpdateChannel}
    on:delete_channel={handleDeleteChannel}
    on:add_role={handleAddRole}
    on:update_role={handleUpdateRole}
    on:delete_role={handleDeleteRole}
    on:update_server={handleUpdateServer}
    on:delete_server={handleDeleteServer}
    on:toggle_permission={handleTogglePermission}
    on:close={() => {
      if (server) {
        goto(resolve('/channels/' + serverId));
      } else {
        goto(resolve('/friends?tab=All'));
      }
    }}
  >
    </SettingsLayout>
{:else}
  <div class="text-center py-10 text-white">
    <p class="text-muted-foreground">Server not found or not selected.</p>
  </div>
{/if}
