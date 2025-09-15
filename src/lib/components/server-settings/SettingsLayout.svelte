<script lang="ts">
  import { mdiClose, mdiMagnify, mdiEmoticonSadOutline } from '@mdi/js';
  import Icon from '$lib/components/ui/Icon.svelte';
  import { onMount } from 'svelte';
  import RolesManagement from '$lib/components/RolesManagement.svelte';
  import ChannelManagement from '$lib/components/ChannelManagement.svelte';
  import WebhookManagement from '$lib/components/WebhookManagement.svelte';
  import MemberList from '$lib/components/lists/MemberList.svelte';
  import BanList from '$lib/components/lists/BanList.svelte';
  import Overview from '$lib/components/server-settings/Overview.svelte';
  import Moderation from '$lib/components/server-settings/Moderation.svelte';
  import DeleteServer from '$lib/components/server-settings/DeleteServer.svelte';
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

  export let title: string;
  export let sidebarItems: { label: string; icon: string; tab: string }[];
  export let allSettings: any[];
  export let categoryHeadings: { [key: string]: string };
  export let currentData: any;
  export let initialActiveTab: string | undefined;
  export let dispatch: <EventKey extends keyof Events>(type: EventKey, detail?: Events[EventKey]) => void;

  let searchQuery = '';
  let pageContents: { [key: string]: string } = {};

  $: isSearching = searchQuery.length > 0;

  $: filteredSidebarItems = sidebarItems.filter(item => {
    if (!searchQuery) return true;
    const content = pageContents[item.tab] || '';
    return item.label.toLowerCase().includes(searchQuery.toLowerCase()) || content.toLowerCase().includes(searchQuery.toLowerCase());
  });

  let activeTab: string = sidebarItems[0].tab;

  function closeSettings() {
    dispatch('close');
  }

  async function fetchPageContent(tab: string) {
    try {
      pageContents[tab] = tab;
    } catch (error) {
      console.error(`Failed to fetch content for ${tab}:`, error);
      pageContents[tab] = '';
    }
  }

  onMount(async () => {
    if (initialActiveTab && sidebarItems.some((i) => i.tab === initialActiveTab)) {
      activeTab = initialActiveTab;
    }
    for (const item of sidebarItems) {
      await fetchPageContent(item.tab);
    }

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

  $: if (initialActiveTab && sidebarItems.some((i) => i.tab === initialActiveTab)) {
    if (activeTab !== initialActiveTab) activeTab = initialActiveTab;
  }

  

  const componentMap: { [key: string]: any } = {
    RolesManagement,
    ChannelManagement,
    WebhookManagement,
    MemberList,
    BanList,
    Overview,
    Moderation,
    DeleteServer,
    UserManagement,
    Roles,
    Privacy
  };
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
            on:click={() => { searchQuery = ''; }}
          >
            {#if searchQuery}
              <Icon path={mdiClose} class="w-4 h-4" />
            {:else}
              <Icon path={mdiMagnify} class="w-4 h-4" />
            {/if}
          </button>
        </div>
        <h2 class="text-left text-[12px] font-bold px-[10px] py-[6px] uppercase" class:hidden={isSearching}>{title}</h2>
        <h2 class="text-left text-[12px] font-bold px-[10px] py-[6px] uppercase" class:hidden={!isSearching}>Search Result</h2>
    <ul>
          {#each filteredSidebarItems as item (item.tab)}
            {#if item.type === 'separator'}
              <div class="h-[1px] my-2 mx-[10px] bg-zinc-700"></div>
            {:else}
              <li>
                <button
                  class="w-full flex items-center h-8 px-[10px] py-[6px] rounded-md transition-colors duration-200 mb-[2px] cursor-pointer
                  {activeTab === item.tab ? 'bg-zinc-700 hover:bg-zinc-600' : 'hover:bg-zinc-700'}"
                  on:click={() => (activeTab = item.tab)}
                >
                  {item.label}
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
                on:click={() => (activeTab = 'delete_server')}
              >
                Delete Server
              </button>
            </li>
          </ul>
        {/if}
        {#if isSearching && filteredSidebarItems.length === 0}
          <div class="flex flex-col items-center justify-center text-muted-foreground mt-8">
            <Icon path={mdiEmoticonSadOutline} class="w-12 h-12 mb-2" />
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
      on:click={closeSettings}
    >
      <Icon path={mdiClose} class="w-6 h-6" />
    </button>
    {#each Object.entries(categoryHeadings) as [category, heading] (category)}
      {#if activeTab === category}
        <h3 class="text-2xl font-semibold mb-6 text-blue-400">{heading}</h3>
        <div class="space-y-8">
          {#each allSettings.filter(setting => setting.category === category) as setting (setting.id)}
            <div class="bg-zinc-700 p-5 rounded-lg shadow-md">
              <h4 class="text-xl font-medium mb-2">{setting.title}</h4>
              <p class="text-zinc-300 mb-4">{setting.description}</p>

              {#if setting.type === 'text'}
                <input
                  type="text"
                  class="w-full p-2 rounded bg-card border border-zinc-600 focus:border-blue-500 focus:ring focus:ring-blue-500 focus:ring-opacity-50"
                  value={currentData[setting.property]}
                  on:change={(e) => dispatch('update_setting', { id: setting.id, property: setting.property, value: e.currentTarget.value })}
                />
              {:else if setting.type === 'image'}
                <input
                  type="text"
                  class="w-full p-2 rounded bg-card border border-zinc-600 focus:border-blue-500 focus:ring focus:ring-blue-500 focus:ring-opacity-50"
                  value={currentData[setting.property]}
                  on:change={(e) => dispatch('update_setting', { id: setting.id, property: setting.property, value: e.currentTarget.value })}
                />
                {#if currentData[setting.property]}
                  <img src={currentData[setting.property]} alt="Server Icon" class="mt-4 w-24 h-24 object-cover rounded-full" />
                {/if}
              {:else if setting.type === 'static'}
                <p class="text-muted-foreground font-mono bg-card p-2 rounded">{currentData[setting.property]}</p>
              {:else if setting.type === 'select'}
                <select
                  class="w-full p-2 rounded bg-card border border-zinc-600 focus:border-blue-500 focus:ring focus:ring-blue-500 focus:ring-opacity-50"
                  on:change={(e) => dispatch('update_setting', { id: setting.id, property: setting.property, value: e.currentTarget.value })}
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
                      on:change={(e) => dispatch('update_setting', { id: setting.id, property: setting.property, value: e.currentTarget.checked })}
                    />
                    <div class="block bg-zinc-600 w-14 h-8 rounded-full"></div>
                    <div class="dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition"></div>
                  </div>
                  <div class="ml-3 text-zinc-300 font-medium">
                    {setting.title}
                  </div>
                </label>
              {:else if setting.type === 'custom_component'}
                <svelte:component
                  this={componentMap[setting.component]}
                  {currentData}
                  on:update_setting={(e) => dispatch('update_setting', e.detail)}
                  on:add_role={(e) => dispatch('add_role', e.detail)}
                  on:update_role={(e) => dispatch('update_role', e.detail)}
                  on:delete_role={(e) => dispatch('delete_role', e.detail)}
                  on:update_server={(e) => dispatch('update_server', e.detail)}
                  on:delete_server={(e) => dispatch('delete_server', e.detail)}
                  on:toggle_permission={(e) => dispatch('toggle_permission', e.detail)}
                  on:add_channel={(e) => dispatch('add_channel', e.detail)}
                  on:update_channel={(e) => dispatch('update_channel', e.detail)}
                  on:delete_channel={(e) => dispatch('delete_channel', e.detail)}
                  on:button_click={(e) => dispatch('button_click', e.detail)}
                />
              {:else if setting.type === 'button'}
                <button
                  class="px-4 py-2 rounded-md {setting.buttonType === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'} text-white font-semibold transition-colors duration-200"
                  on:click={() => dispatch('button_click', { id: setting.id })}
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

    {#if activeTab === 'delete_server'}
      <h3 class="text-2xl font-semibold mb-6 text-red-400">{categoryHeadings.delete_server}</h3>
      <div class="bg-zinc-700 p-5 rounded-lg shadow-md">
        <p class="text-zinc-300 mb-4">
          This action will permanently delete your server and all its data. This cannot be undone.
        </p>
        <button
          class="px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors duration-200"
          on:click={() => dispatch('button_click', { id: 'deleteServer' })}
        >
          Delete Server
        </button>
      </div>
    {/if}
    </div>
  </main>
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
