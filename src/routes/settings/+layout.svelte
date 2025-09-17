<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { X, Search, Smile } from '@lucide/svelte';
  import { lastVisitedServerId } from '$lib/data/stores/navigationStore';
  import { get } from 'svelte/store';

  type NavigationFn = (value: string | URL) => void; // eslint-disable-line no-unused-vars

  const gotoUnsafe: NavigationFn = goto as unknown as NavigationFn;

  type SettingsSection = 'user' | 'app' | 'info';

  type SettingsItem = {
    label: string;
    href: string;
    section: SettingsSection;
    keywords: string[];
  };

  let searchQuery = $state('');
  let { children } = $props();

  const settingsItems: SettingsItem[] = [
    { label: 'Account', href: '/settings/account', section: 'user', keywords: ['profile', 'email', 'password', 'security', 'billing'] },
    { label: 'Devices', href: '/settings/devices', section: 'user', keywords: ['devices', 'sessions', 'mobile', 'desktop'] },
    { label: 'Data & Privacy', href: '/settings/data_privacy', section: 'user', keywords: ['data', 'privacy', 'export', 'sharing'] },
    { label: 'Content & Social', href: '/settings/content_social', section: 'user', keywords: ['content', 'friends', 'sharing', 'social'] },
    { label: 'Connected Accounts', href: '/settings/connected_accounts', section: 'user', keywords: ['connections', 'integrations', 'accounts'] },
    { label: 'Appearance', href: '/settings/appearance', section: 'app', keywords: ['theme', 'color', 'layout', 'font'] },
    { label: 'Accessibility', href: '/settings/accessibility', section: 'app', keywords: ['contrast', 'screen reader', 'captions'] },
    { label: 'Voice & Video', href: '/settings/voice_video', section: 'app', keywords: ['microphone', 'camera', 'voice', 'video'] },
    { label: 'Chat', href: '/settings/chat', section: 'app', keywords: ['messages', 'typing', 'threads'] },
    { label: 'Notifications', href: '/settings/notifications', section: 'app', keywords: ['alerts', 'push', 'email'] },
    { label: 'Keybinds', href: '/settings/keybinds', section: 'app', keywords: ['shortcuts', 'keyboard', 'hotkeys'] },
    { label: 'Language', href: '/settings/language', section: 'app', keywords: ['locale', 'translation', 'regional'] },
    { label: 'Advanced', href: '/settings/advanced', section: 'app', keywords: ['developer', 'experiments', 'reset'] },
    { label: 'Change Log', href: '/settings/change_log', section: 'info', keywords: ['release', 'updates', 'news', 'version history'] }
  ];

  const normalizedQuery = $derived(searchQuery.trim().toLowerCase());
  const isSearching = $derived(normalizedQuery.length > 0);
  const userSettingsItems = settingsItems.filter(item => item.section === 'user');
  const appSettingsItems = settingsItems.filter(item => item.section === 'app');
  const infoSettingsItems = settingsItems.filter(item => item.section === 'info');
  const filteredUserSettingsItems = $derived(userSettingsItems.filter(item => matchesQuery(item, normalizedQuery)));
  const filteredAppSettingsItems = $derived(appSettingsItems.filter(item => matchesQuery(item, normalizedQuery)));
  const filteredInfoSettingsItems = $derived(infoSettingsItems.filter(item => matchesQuery(item, normalizedQuery)));
  const filteredSearchResults = $derived(settingsItems.filter(item => matchesQuery(item, normalizedQuery)));
  const hasSearchResults = $derived(filteredSearchResults.length > 0);

  const sectionLabels: Record<SettingsSection, string> = {
    user: 'User Settings',
    app: 'App Settings',
    info: "What's New?"
  };

  const matchesQuery = (item: SettingsItem, query: string) => {
    if (!query) return true;
    if (item.label.toLowerCase().includes(query)) return true;
    return item.keywords.some(keyword => keyword.includes(query));
  };

  $effect(() => {
    if (!browser) return;

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

  function navigateTo(href: string) {
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    gotoUnsafe(href);
  }

  function closeSettings() {
    const lastVisited = get(lastVisitedServerId);
    navigateTo(lastVisited ? `/channels/${lastVisited}` : '/');
  }

  async function copyAppInfo() {
    if (!browser || !navigator.clipboard) return;
    const info = ['Tauri: 2', 'Svelte: 5.0.0', 'TypeScript: 5.6.2'].join('\n');
    try {
      await navigator.clipboard.writeText(info);
    } catch (error) {
      console.error('Failed to copy app info', error);
    }
  }
</script>

<div class="flex h-full min-h-0 text-white">
  <aside class="flex min-h-0 w-[36vw] flex-col bg-base-100 p-4 shadow-lg">
    <div class="custom-scrollbar flex-1 overflow-y-auto py-[60px] px-2">
      <div class="ml-auto w-[238px] space-y-4">
        <div class="relative">
          <input
            type="text"
            placeholder="Search"
            class="w-full rounded-md border border-border bg-card px-3 py-[9px] text-foreground focus:outline-none focus:ring-2 focus:ring-base-400"
            bind:value={searchQuery}
          />
          <button
            class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors duration-200 hover:text-foreground"
            onclick={() => {
              searchQuery = '';
            }}
            aria-label={searchQuery ? 'Clear search' : 'Search settings'}
            type="button"
          >
            {#if searchQuery}
              <X class="h-4 w-4" />
            {:else}
              <Search class="h-4 w-4" />
            {/if}
          </button>
        </div>

        {#if isSearching}
          <div class="space-y-3">
            <h2 class="px-[10px] text-left text-[12px] font-bold uppercase text-muted-foreground">Search Results</h2>
            {#if hasSearchResults}
              <ul class="space-y-[2px]">
                {#each filteredSearchResults as item (item.href)}
                  <li>
                    <button
                      class="flex h-9 w-full cursor-pointer items-center justify-between rounded-md px-[10px] py-[6px] text-left text-sm transition-colors duration-200 {$page.url.pathname.startsWith(item.href) ? 'bg-muted hover:bg-base-400' : 'hover:bg-muted'}"
                      onclick={() => navigateTo(item.href)}
                      type="button"
                    >
                      <span class="truncate">{item.label}</span>
                      <span class="ml-3 text-[10px] uppercase text-muted-foreground">{sectionLabels[item.section]}</span>
                    </button>
                  </li>
                {/each}
              </ul>
            {:else}
              <div class="flex flex-col items-center justify-center pt-10 text-muted-foreground">
                <Smile class="mb-3 h-10 w-10" />
                <p class="text-sm">No search results</p>
              </div>
            {/if}
          </div>
        {:else}
          <div class="space-y-3">
            <div>
              <h2 class="px-[10px] text-left text-[12px] font-bold uppercase text-muted-foreground">User Settings</h2>
              <ul>
                {#each filteredUserSettingsItems as item (item.href)}
                  <li>
                    <button
                      class="flex h-9 w-full cursor-pointer items-center rounded-md px-[10px] py-[6px] text-left transition-colors duration-200 {$page.url.pathname.startsWith(item.href) ? 'bg-muted hover:bg-base-400' : 'hover:bg-muted'}"
                      onclick={() => navigateTo(item.href)}
                      type="button"
                    >
                      {item.label}
                    </button>
                  </li>
                {/each}
              </ul>
            </div>

            <div class="mx-[10px] h-px bg-muted"></div>

            <div>
              <h2 class="px-[10px] text-left text-[12px] font-bold uppercase text-muted-foreground">App Settings</h2>
              <ul>
                {#each filteredAppSettingsItems as item (item.href)}
                  <li>
                    <button
                      class="flex h-9 w-full cursor-pointer items-center rounded-md px-[10px] py-[6px] text-left transition-colors duration-200 {$page.url.pathname.startsWith(item.href) ? 'bg-muted hover:bg-base-400' : 'hover:bg-muted'}"
                      onclick={() => navigateTo(item.href)}
                      type="button"
                    >
                      {item.label}
                    </button>
                  </li>
                {/each}
              </ul>
            </div>

            <div class="mx-[10px] h-px bg-muted"></div>

            <div>
              <h2 class="px-[10px] text-left text-[12px] font-bold uppercase text-muted-foreground">What's New?</h2>
              <ul>
                {#each filteredInfoSettingsItems as item (item.href)}
                  <li>
                    <button
                      class="flex h-9 w-full cursor-pointer items-center rounded-md px-[10px] py-[6px] text-left transition-colors duration-200 {$page.url.pathname.startsWith(item.href) ? 'bg-muted hover:bg-base-400' : 'hover:bg-muted'}"
                      onclick={() => navigateTo(item.href)}
                      type="button"
                    >
                      {item.label}
                    </button>
                  </li>
                {/each}
              </ul>
            </div>

            <div class="mx-[10px] h-px bg-muted"></div>

            <button
              class="flex h-9 w-full cursor-pointer items-center rounded-md px-[10px] py-[6px] text-left text-destructive transition-colors duration-200 hover:bg-muted"
              onclick={() => console.log('Log Out clicked')}
              type="button"
            >
              Log Out
            </button>

            <div class="mx-[10px] h-px bg-muted"></div>

            <button
              class="w-full cursor-pointer px-[10px] text-left text-[12px] font-normal focus:outline-none focus:ring-2 focus:ring-ring focus:ring-opacity-50"
              onclick={copyAppInfo}
              onkeydown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  copyAppInfo();
                }
              }}
              aria-label="Copy app info to clipboard"
              type="button"
            >
              <p class="my-0 py-0">Tauri: 2</p>
              <p class="my-0 py-0">Svelte: 5.0.0</p>
              <p class="my-0 py-0">TypeScript: 5.6.2</p>
            </button>
          </div>
        {/if}
      </div>
    </div>
  </aside>
  <main class="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
    <div class="relative mx-auto w-full max-w-[740px] p-[60px_40px_80px]">
      <button
        class="absolute right-0 top-0 z-50 p-4 text-muted-foreground transition-colors duration-200 hover:text-foreground"
        onclick={closeSettings}
        aria-label="Close settings"
        type="button"
      >
        <X class="h-6 w-6" />
      </button>
      {@render children()}
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
