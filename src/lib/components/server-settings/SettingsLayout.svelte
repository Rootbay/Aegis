<script lang="ts">
  import { X, Smile, Search } from '@lucide/svelte';
  import type { Component } from 'svelte';
  import RolesManagement from '$lib/components/RolesManagement.svelte';
  import ChannelManagement from '$lib/components/ChannelManagement.svelte';
  import WebhookManagement from '$lib/components/WebhookManagement.svelte';
  import MemberList from '$lib/components/lists/MemberList.svelte';
  import BanList from '$lib/components/lists/BanList.svelte';
  import Overview from '$lib/components/server-settings/Overview.svelte';
  import Moderation from '$lib/components/server-settings/Moderation.svelte';
  import UserManagement from '$lib/components/server-settings/UserManagement.svelte';
  import Roles from '$lib/components/server-settings/Roles.svelte';
  import Privacy from '$lib/components/server-settings/Privacy.svelte';

  type Events = {
    close: void;
    update_setting: { id: string; property: string; value: any };
    add_role: any;
    update_role: any;
    delete_role: any;
    update_server: any;
    delete_server: any;
    toggle_permission: any;
    add_channel: any;
    update_channel: any;
    delete_channel: any;
    button_click: any;
  };

  type SidebarLinkItem = {
    label: string;
    icon: Component;
    tab: string;
    type?: undefined;
  };

  type SidebarSeparator = {
    type: 'separator';
  };

  type SidebarItem = SidebarLinkItem | SidebarSeparator;
  type EventHandler<T> = T extends void ? (() => void) | undefined : ((detail: T) => void) | undefined; // eslint-disable-line no-unused-vars

  let {
    title,
    sidebarItems,
    allSettings,
    categoryHeadings,
    currentData,
    initialActiveTab,
    onclose,
    onupdate_setting,
    onadd_role,
    onupdate_role,
    ondelete_role,
    onupdate_server,
    ondelete_server,
    ontoggle_permission,
    onadd_channel,
    onupdate_channel,
    ondelete_channel,
    onbutton_click
  }: {
    title: string;
    sidebarItems: SidebarItem[];
    allSettings: any[];
    categoryHeadings: { [key: string]: string };
    currentData: any;
    initialActiveTab?: string;
    onclose?: EventHandler<Events['close']>;
    onupdate_setting?: EventHandler<Events['update_setting']>;
    onadd_role?: EventHandler<Events['add_role']>;
    onupdate_role?: EventHandler<Events['update_role']>;
    ondelete_role?: EventHandler<Events['delete_role']>;
    onupdate_server?: EventHandler<Events['update_server']>;
    ondelete_server?: EventHandler<Events['delete_server']>;
    ontoggle_permission?: EventHandler<Events['toggle_permission']>;
    onadd_channel?: EventHandler<Events['add_channel']>;
    onupdate_channel?: EventHandler<Events['update_channel']>;
    ondelete_channel?: EventHandler<Events['delete_channel']>;
    onbutton_click?: EventHandler<Events['button_click']>;
  } = $props();

  let filteredSidebarItems = $derived(
    sidebarItems.filter(item => {
      if (isSeparator(item)) {
        return !searchQuery;
      }
      if (!searchQuery) return true;
      const content = pageContents[item.tab] || '';
      return (
        item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        content.toLowerCase().includes(searchQuery.toLowerCase())
      );
    })
  );

  let pageContents = $state<{ [key: string]: string }>({});
  let activeTab = $state('');
  let searchQuery = $state('');
  let isSearching = $derived(searchQuery.length > 0);

  let showDeleteServerConfirm = $state(false);

  const serverAwareComponents = new Set(['Overview', 'Moderation', 'Privacy']);
  const isSeparator = (item: SidebarItem): item is SidebarSeparator => item.type === 'separator';

  const componentMap: { [key: string]: any } = {
    RolesManagement,
    ChannelManagement,
    WebhookManagement,
    MemberList,
    BanList,
    Overview,
    Moderation,
    UserManagement,
    Roles,
    Privacy
  };

  $effect(() => {
    const initialize = async () => {
      if (
        initialActiveTab &&
        sidebarItems.some(i => !isSeparator(i) && i.tab === initialActiveTab)
      ) {
        activeTab = initialActiveTab;
      }
      for (const item of sidebarItems) {
        if (isSeparator(item)) continue;
        await fetchPageContent(item.tab);
      }
    };
    void initialize();

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeSettings();
      }
    };
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  });

  $effect(() => {
    if (!activeTab) {
      const firstTabItem = sidebarItems.find(
        (item): item is SidebarLinkItem => !isSeparator(item)
      );
      if (firstTabItem) {
        activeTab = firstTabItem.tab;
      }
    }
  });

  $effect(() => {
    if (
      initialActiveTab &&
      sidebarItems.some(i => !isSeparator(i) && i.tab === initialActiveTab)
    ) {
      if (activeTab !== initialActiveTab) activeTab = initialActiveTab;
    }
  });

  function closeSettings() {
    onclose?.();
  }

  async function fetchPageContent(tab: string) {
    try {
      pageContents[tab] = tab;
    } catch (error) {
      console.error(`Failed to fetch content for ${tab}:`, error);
      pageContents[tab] = '';
    }
  }

  function handleUpdateServer(serverUpdate: unknown) {
    if (serverUpdate == null) {
      return;
    }
    onupdate_server?.(serverUpdate as any);
  }

  function handleDeleteServer(detail: unknown) {
    if (!ondelete_server) {
      return;
    }

    if (typeof detail === 'string') {
      ondelete_server({ serverId: detail } as any);
      return;
    }

    if (detail && typeof detail === 'object') {
      const record = detail as Record<string, unknown>;
      const serverId =
        typeof record['serverId'] === 'string'
          ? (record['serverId'] as string)
          : typeof record['id'] === 'string'
            ? (record['id'] as string)
            : typeof currentData?.id === 'string'
              ? (currentData.id as string)
              : undefined;

      if (serverId) {
        ondelete_server({ serverId, server: detail } as any);
        return;
      }

      ondelete_server(detail as any);
      return;
    }

    if (typeof currentData?.id === 'string') {
      ondelete_server({ serverId: currentData.id } as any);
      return;
    }

    ondelete_server(detail as any);
  }

  function getComponentProps(componentName: string) {
    const props: Record<string, unknown> = {};
    if (!componentName) {
      return props;
    }

    if (serverAwareComponents.has(componentName)) {
      props.server = currentData;
    }

    if (componentName === 'Overview' || componentName === 'Moderation' || componentName === 'Privacy') {
      props.onupdateServer = handleUpdateServer;
    }

    return props;
  }
</script>

<div class="flex h-full text-white">
  <aside class="w-[36vw] bg-zinc-900 p-4 shadow-lg flex flex-col h-full">
    <div class="flex-grow overflow-y-scroll custom-scrollbar py-[60px] px-2">
      <div class="w-[238px] ml-auto">
        <div class="relative mb-4">
          <input
            type="text"
            placeholder="Search"
            class="w-full bg-card text-white px-3 py-[9px] rounded-md focus:outline-none focus:ring-2 focus:ring-zinc-500 border border-zinc-700"
            bind:value={searchQuery}
          />
          <button
            class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
            onclick={() => { searchQuery = ''; }}
          >
            {#if searchQuery}
              <X class="w-4 h-4" />
            {:else}
              <Search class="w-4 h-4" />
            {/if}
          </button>
        </div>
        <h2 class="text-left text-[12px] font-bold px-[10px] py-[6px] uppercase" class:hidden={isSearching}>{title}</h2>
        <h2 class="text-left text-[12px] font-bold px-[10px] py-[6px] uppercase" class:hidden={!isSearching}>Search Result</h2>
    <ul>
          {#each filteredSidebarItems as item, index (item.type === 'separator' ? `separator-${index}` : item.tab)}
            {#if item.type === 'separator'}
              <div class="h-[1px] my-2 mx-[10px] bg-zinc-700"></div>
            {:else}
              {@const navItem = item as SidebarLinkItem}
              <li>
                <button
                  class="w-full flex items-center gap-2 h-8 px-[10px] py-[6px] rounded-md transition-colors duration-200 mb-[2px] cursor-pointer group
                  {activeTab === navItem.tab ? 'bg-zinc-700 hover:bg-zinc-600' : 'hover:bg-zinc-700'}"
                  onclick={() => (activeTab = navItem.tab)}
                >
                  <svelte:component
                    this={navItem.icon}
                    class={`w-4 h-4 text-muted-foreground group-hover:text-white transition-colors duration-200${activeTab === navItem.tab ? ' text-white' : ''}`}
                  />
                  <span class="truncate" class:text-white={activeTab === navItem.tab}>{navItem.label}</span>
                </button>
              </li>
            {/if}
          {/each}
        </ul>
        {#if !isSearching}
          <div class="h-[1px] my-2 mx-[10px] bg-zinc-700"></div>
          <ul>
            <li>
              <button
                class="w-full flex items-center h-8 px-[10px] py-[6px] rounded-md text-red-400 hover:bg-zinc-700 transition-colors duration-200 mb-[2px] cursor-pointer"
                onclick={() => (showDeleteServerConfirm = true)}
              >
                Delete Server
              </button>
            </li>
          </ul>
        {/if}
        {#if isSearching && filteredSidebarItems.length === 0}
          <div class="flex flex-col items-center justify-center text-muted-foreground mt-8">
            <Smile class="w-12 h-12 mb-2" />
            <p class="text-sm">No Search Results</p>
          </div>
        {/if}
      </div>
    </div>
  </aside>

  <main class="flex-1 w-full overflow-hidden overflow-x-hidden relative">
    <div class="w-[740px] mx-auto p-[60px_40px_80px]">
    <button
      class="absolute top-0 right-0 text-muted-foreground hover:text-white transition-colors duration-200 p-4 z-50"
      onclick={closeSettings}
    >
      <X class="w-6 h-6" />
    </button>
    {#each Object.entries(categoryHeadings) as [category, heading] (category)}
      {#if activeTab === category}
        <h3 class="text-2xl font-semibold mb-6 text-blue-400">{heading}</h3>
        <div class="space-y-8">
          {#each allSettings.filter(setting => setting.category === category) as setting, i (setting.id ?? `${category}-${i}`)}
            <div class="bg-zinc-700 p-5 rounded-lg shadow-md">
              <h4 class="text-xl font-medium mb-2">{setting.title}</h4>
              <p class="text-zinc-300 mb-4">{setting.description}</p>

              {#if setting.type === 'text'}
                <input
                  type="text"
                  class="w-full p-2 rounded bg-card border border-zinc-600 focus:border-blue-500 focus:ring focus:ring-blue-500 focus:ring-opacity-50"
                  value={currentData[setting.property]}
                  onchange={(e) => onupdate_setting?.({ id: setting.id, property: setting.property, value: e.currentTarget.value })}
                />
              {:else if setting.type === 'image'}
                <input
                  type="text"
                  class="w-full p-2 rounded bg-card border border-zinc-600 focus:border-blue-500 focus:ring focus:ring-blue-500 focus:ring-opacity-50"
                  value={currentData[setting.property]}
                  onchange={(e) => onupdate_setting?.({ id: setting.id, property: setting.property, value: e.currentTarget.value })}
                />
                {#if currentData[setting.property]}
                  <img src={currentData[setting.property]} alt="Server Icon" class="mt-4 w-24 h-24 object-cover rounded-full" />
                {/if}
              {:else if setting.type === 'static'}
                <p class="text-muted-foreground font-mono bg-card p-2 rounded">{currentData[setting.property]}</p>
              {:else if setting.type === 'select'}
                <select
                  class="w-full p-2 rounded bg-card border border-zinc-600 focus:border-blue-500 focus:ring focus:ring-blue-500 focus:ring-opacity-50"
                  onchange={(e) => onupdate_setting?.({ id: setting.id, property: setting.property, value: e.currentTarget.value })}
                >
                  {#each setting.options as option (option.value)}
                    <option value={option.value} selected={currentData[setting.property] === option.value}>
                      {option.label}
                    </option>
                  {/each}
                </select>
              {:else if setting.type === 'toggle'}
                <label class="flex items-center cursor-pointer">
                  <div class="relative">
                    <input
                      type="checkbox"
                      class="sr-only"
                      checked={currentData[setting.property]}
                      onchange={(e) => onupdate_setting?.({ id: setting.id, property: setting.property, value: e.currentTarget.checked })}
                    />
                    <div class="block bg-zinc-600 w-14 h-8 rounded-full"></div>
                    <div class="dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition"></div>
                  </div>
                  <div class="ml-3 text-zinc-300 font-medium">
                    {setting.title}
                  </div>
                </label>
              {:else if setting.type === 'custom_component'}
                {#if setting.component === 'RolesManagement'}
                  <RolesManagement
                    roles={currentData.roles ?? []}
                    onadd_role={onadd_role}
                    onupdate_role={onupdate_role}
                    ondelete_role={ondelete_role}
                    ontoggle_permission={ontoggle_permission}
                  />
                {:else if setting.component === 'ChannelManagement'}
                  <ChannelManagement
                    channels={currentData.channels ?? []}
                    onadd_channel={onadd_channel}
                    onupdate_channel={onupdate_channel}
                    ondelete_channel={ondelete_channel}
                  />
                {:else}
                  {#if componentMap[setting.component]}
                    {@const dynamicComponent = componentMap[setting.component]}
                    {@const componentProps = getComponentProps(setting.component)}
                    {#if dynamicComponent}
                      <dynamicComponent
                        {...componentProps}
                        onupdate_setting={onupdate_setting}
                        onbutton_click={onbutton_click}
                      ></dynamicComponent>
                    {/if}
                  {/if}
                {/if}
              {:else if setting.type === 'button'}
                <button
                  class="px-4 py-2 rounded-md {setting.buttonType === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'} text-white font-semibold transition-colors duration-200"
                  onclick={() => onbutton_click?.({ id: setting.id })}
                >
                  {setting.buttonLabel}
                </button>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    {/each}
    <div class="h-[1px] my-2 mx-[10px] bg-zinc-700"></div>
    </div>
  </main>
  {#if showDeleteServerConfirm}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80" role="dialog" aria-modal="true" aria-labelledby="delete-server-dialog-title" onclick={() => (showDeleteServerConfirm = false)}>
      <div class="w-full max-w-sm rounded-lg border border-border bg-card p-6 text-left shadow-xl" onclick={(event) => event.stopPropagation()}>
        <h3 id="delete-server-dialog-title" class="text-lg font-semibold text-red-400">Delete server?</h3>
        <p class="mt-2 text-sm text-muted-foreground">
          This action permanently removes {currentData?.name ?? 'this server'} and all of its data. You cannot undo this.
        </p>
        <div class="mt-6 flex justify-end gap-2">
          <button class="rounded-md bg-muted px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted/80" type="button" onclick={() => (showDeleteServerConfirm = false)}>
            Cancel
          </button>
          <button class="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700" type="button" onclick={() => { showDeleteServerConfirm = false; handleDeleteServer(currentData); }}>
            Delete Server
          </button>
        </div>
      </div>
    </div>
  {/if}

</div>

<style lang="postcss">
  .dot {
    left: 0.25rem;
    transition: transform 0.2s ease-in-out;
  }
  input:checked ~ .dot {
    transform: translateX(100%);
    background-color: theme('colors.blue.500');
  }
  input:checked ~ .block {
    background-color: theme('colors.blue.600');
  }

  .custom-scrollbar::-webkit-scrollbar {
    width: 8px;
  }

  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }

  .custom-scrollbar::-webkit-scrollbar-thumb {
    background-color: transparent;
    border-radius: 4px;
    border: 2px solid transparent;
  }

  .custom-scrollbar:hover::-webkit-scrollbar-thumb {
    background-color: theme('colors.zinc.700');
  }

  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background-color: theme('colors.zinc.600');
  }
</style>



