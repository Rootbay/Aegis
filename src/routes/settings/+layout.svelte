<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { mdiClose, mdiAccount, mdiBell, mdiPalette, mdiKeyboard, mdiTranslate, mdiTune, mdiDevices, mdiShieldAccount, mdiShareVariant, mdiWheelchairAccessibility, mdiMicrophone, mdiChat, mdiLink, mdiMagnify, mdiEmoticonSadOutline } from '@mdi/js';
  
  import Icon from '$lib/components/ui/Icon.svelte';
  import { onMount } from 'svelte';

  let searchQuery = '';
  let pageContents: { [key: string]: string } = {};

  const userSettingsItems = [
    { label: 'Account', icon: mdiAccount, href: '/settings/account' },
    { label: 'Devices', icon: mdiDevices, href: '/settings/devices' },
    { label: 'Data & Privacy', icon: mdiShieldAccount, href: '/settings/data_privacy' },
    { label: 'Content & Social', icon: mdiShareVariant, href: '/settings/content_social' },
    { label: 'Connected Accounts', icon: mdiLink, href: '/settings/connected_accounts' },
  ];

  const appSettingsItems = [
    { label: 'Appearance', icon: mdiPalette, href: '/settings/appearance' },
    { label: 'Accessibility', icon: mdiWheelchairAccessibility, href: '/settings/accessibility' },
    { label: 'Voice & Video', icon: mdiMicrophone, href: '/settings/voice_video' },
    { label: 'Chat', icon: mdiChat, href: '/settings/chat' },
    { label: 'Notifications', icon: mdiBell, href: '/settings/notifications' },
    { label: 'Keybinds', icon: mdiKeyboard, href: '/settings/keybinds' },
    { label: 'Language', icon: mdiTranslate, href: '/settings/language' },
    { label: 'Advanced', icon: mdiTune, href: '/settings/advanced' },
  ];

  const allSettingsItems = [...userSettingsItems, ...appSettingsItems, { label: 'Change Log', href: '/settings/change_log' }];

  async function fetchPageContent(href: string) {
    try {
      const response = await fetch(href);
      const text = await response.text();
      pageContents[href] = text;
    } catch (error) {
      console.error(`Failed to fetch content for ${href}:`, error);
      pageContents[href] = '';
    }
  }

  onMount(async () => {
    for (const item of allSettingsItems) {
      await fetchPageContent(item.href);
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

  $: filteredUserSettingsItems = userSettingsItems.filter(item => {
    if (!searchQuery) return true;
    const content = pageContents[item.href] || '';
    return item.label.toLowerCase().includes(searchQuery.toLowerCase()) || content.toLowerCase().includes(searchQuery.toLowerCase());
  });

  $: filteredAppSettingsItems = appSettingsItems.filter(item => {
    if (!searchQuery) return true;
    const content = pageContents[item.href] || '';
    return item.label.toLowerCase().includes(searchQuery.toLowerCase()) || content.toLowerCase().includes(searchQuery.toLowerCase());
  });

  $: isSearching = searchQuery.length > 0;

  import { lastVisitedServerId } from '$lib/data/stores/navigationStore';

  function closeSettings() {
    let path = '/';
    lastVisitedServerId.subscribe(id => {
      if (id) {
        path = `/channels/${id}`;
      }
    })();
    goto(resolve(path));
  }
</script>

<div class="flex h-full text-white">
  <aside class="w-[36vw] bg-base-100 p-4 shadow-lg flex flex-col h-full">
    <div class="flex-grow overflow-y-scroll custom-scrollbar py-[60px] px-2">
      <div class="w-[238px] ml-auto">
        <div class="relative mb-4">
          <input
            type="text"
            placeholder="Search"
            class="w-full bg-card text-foreground px-3 py-[9px] rounded-md focus:outline-none focus:ring-2 focus:ring-base-400 border border-border"
            bind:value={searchQuery}
          />
          <button
            class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            on:click={() => { searchQuery = ''; }}
          >
            {#if searchQuery}
              <Icon path={mdiClose} clazz="w-4 h-4" />
            {:else}
              <Icon path={mdiMagnify} clazz="w-4 h-4" />
            {/if}
          </button>
        </div>
        <h2 class="text-left text-[12px] font-bold px-[10px] py-[6px] uppercase" class:hidden={isSearching}>User Settings</h2>
        <h2 class="text-left text-[12px] font-bold px-[10px] py-[6px] uppercase" class:hidden={!isSearching}>Search Result</h2>
        <ul>
          {#each filteredUserSettingsItems as item (item.href)}
            <li>
              <button
                class="w-full flex items-center h-8 px-[10px] py-[6px] rounded-md transition-colors duration-200 mb-[2px] cursor-pointer
                {$page.url.pathname.startsWith(item.href) ? 'bg-muted hover:bg-base-400' : 'hover:bg-muted'}"
                on:click={() => goto(resolve(item.href))}
              >
                {item.label}
              </button>
            </li>
          {/each}
        </ul>
        <div class="h-[1px] my-2 mx-[10px] bg-muted" class:hidden={isSearching}></div>

        <h2 class="text-left text-[12px] font-bold px-[10px] py-[6px] uppercase" class:hidden={isSearching}>App Settings</h2>
        <ul>
          {#each filteredAppSettingsItems as item (item.href)}
            <li>
              <button
                class="w-full flex items-center h-8 px-[10px] py-[6px] rounded-md transition-colors duration-200 mb-[2px] cursor-pointer
                {$page.url.pathname.startsWith(item.href) ? 'bg-muted hover:bg-base-400' : 'hover:bg-muted'}"
                on:click={() => goto(resolve(item.href))}
              >
                {item.label}
              </button>
            </li>
          {/each}
        </ul>
        <div class="h-[1px] my-2 mx-[10px] bg-muted" class:hidden={isSearching}></div>

        {#if !isSearching || (filteredUserSettingsItems.length === 0 && filteredAppSettingsItems.length === 0 && (!searchQuery || !('change log'.includes(searchQuery.toLowerCase()) || (pageContents['/settings/change_log'] || '').toLowerCase().includes(searchQuery.toLowerCase()))))}
          <h2 class="text-left text-[12px] font-bold px-[10px] py-[6px] uppercase" class:hidden={isSearching}>What's New?</h2>
        {/if}
        <ul>
          {#if !isSearching || 'change log'.includes(searchQuery.toLowerCase()) || (pageContents['/settings/change_log'] || '').toLowerCase().includes(searchQuery.toLowerCase())}
            <li>
              <button
                class="w-full flex items-center h-8 px-[10px] py-[6px] rounded-md transition-colors duration-200 mb-[2px] cursor-pointer
                {$page.url.pathname.startsWith('/settings/change_log') ? 'bg-muted hover:bg-base-400' : 'hover:bg-muted'}"
                on:click={() => goto(resolve('/settings/change_log'))}
              >
                Change Log
              </button>
            </li>
          {/if}
        </ul>
        <div class="h-[1px] my-2 mx-[10px] bg-muted" class:hidden={isSearching}></div>
        {#if !isSearching}
          <ul>
            <li>
              <button
                class="w-full flex items-center h-8 px-[10px] py-[6px] rounded-md text-destructive hover:bg-muted transition-colors duration-200 mb-[2px] cursor-pointer"
                on:click={() => console.log('Log Out clicked')}
              >
                Log Out
              </button>
            </li>
          </ul>
          <div class="h-[1px] my-2 mx-[10px] bg-muted"></div>
          <ul>
            <li>
              <button
                class="w-full text-left text-[12px] font-normal px-[10px] cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring focus:ring-opacity-50"
                on:click={() => navigator.clipboard.writeText(`Tauri: 2
Svelte: 5.0.0
TypeScript: 5.6.2`)}
                on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigator.clipboard.writeText(`Tauri: 2
Svelte: 5.0.0
TypeScript: 5.6.2`); }}
                aria-label="Copy app info to clipboard"
              >
                <p class="my-0 py-0">Tauri: 2</p>
                <p class="my-0 py-0">Svelte: 5.0.0</p>
                <p class="my-0 py-0">TypeScript: 5.6.2</p>
              </button>
            </li>
          </ul>
        {/if}
        {#if isSearching && filteredUserSettingsItems.length === 0 && filteredAppSettingsItems.length === 0 && !('change log'.includes(searchQuery.toLowerCase()) || (pageContents['/settings/change_log'] || '').toLowerCase().includes(searchQuery.toLowerCase()))}
          <div class="flex flex-col items-center justify-center text-muted-foreground mt-8">
            <Icon path={mdiEmoticonSadOutline} clazz="w-12 h-12 mb-2" />
            <p class="text-sm">No Search Results</p>
          </div>
        {/if}
      </div>
    </div>
</aside>
  <main class="flex-1 w-full overflow-hidden overflow-x-hidden relative">
    <div class="w-[740px] p-[60px_40px_80px]">
      <button
        class="absolute top-0 right-0 text-muted-foreground hover:text-foreground transition-colors duration-200 p-4 z-50"
        on:click={closeSettings}
      >
        <Icon path={mdiClose} clazz="w-6 h-6" />
      </button>
      <slot />
    </div>
  </main>
</div>

<style lang="postcss">
  .custom-scrollbar::-webkit-scrollbar {
    width: 8px;
  }

  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }

  .custom-scrollbar::-webkit-scrollbar-thumb {
    background-color: theme('colors.base.300');
    border-radius: 4px;
  }

  .custom-scrollbar:hover::-webkit-scrollbar-thumb {
    background-color: theme('colors.base.300');
  }

  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background-color: theme('colors.base.400');
  }
</style>