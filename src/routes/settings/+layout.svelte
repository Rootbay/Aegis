<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { X, Search, Smile } from "@lucide/svelte";
  import { lastVisitedServerId } from "$lib/stores/navigationStore";
  import { get } from "svelte/store";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import SettingsList from "$lib/features/settings/components/SettingsList.svelte";
  import SearchResultsList from "$lib/features/settings/components/SearchResultsList.svelte";
  import { authStore } from "$lib/features/auth/stores/authStore";

  type SettingsSection = "user" | "app" | "info";

  type SettingsItem = {
    label: string;
    href: string;
    section: SettingsSection;
    keywords: string[];
  };

  let searchQuery = $state("");
  let { children } = $props();

  const settingsItems: SettingsItem[] = [
    {
      label: "Account",
      href: "/settings/account",
      section: "user",
      keywords: ["profile", "email", "password", "security", "billing"],
    },
    {
      label: "Devices",
      href: "/settings/devices",
      section: "user",
      keywords: ["devices", "sessions", "mobile", "desktop"],
    },
    {
      label: "Data & Privacy",
      href: "/settings/data_privacy",
      section: "user",
      keywords: ["data", "privacy", "export", "sharing"],
    },
    {
      label: "Content & Social",
      href: "/settings/content_social",
      section: "user",
      keywords: ["content", "friends", "sharing", "social"],
    },
    {
      label: "Connected Accounts",
      href: "/settings/connected_accounts",
      section: "user",
      keywords: ["connections", "integrations", "accounts"],
    },
    {
      label: "Appearance",
      href: "/settings/appearance",
      section: "app",
      keywords: ["theme", "color", "layout", "font"],
    },
    {
      label: "Accessibility",
      href: "/settings/accessibility",
      section: "app",
      keywords: ["contrast", "screen reader", "captions"],
    },
    {
      label: "Voice & Video",
      href: "/settings/voice_video",
      section: "app",
      keywords: ["microphone", "camera", "voice", "video"],
    },
    {
      label: "Chat",
      href: "/settings/chat",
      section: "app",
      keywords: ["messages", "typing", "threads"],
    },
    {
      label: "Notifications",
      href: "/settings/notifications",
      section: "app",
      keywords: ["alerts", "push", "email"],
    },
    {
      label: "Network",
      href: "/settings/network",
      section: "app",
      keywords: ["mesh", "connectivity", "relays", "network"],
    },
    {
      label: "Keybinds",
      href: "/settings/keybinds",
      section: "app",
      keywords: ["shortcuts", "keyboard", "hotkeys"],
    },
    {
      label: "Language",
      href: "/settings/language",
      section: "app",
      keywords: ["locale", "translation", "regional"],
    },
    {
      label: "Advanced",
      href: "/settings/advanced",
      section: "app",
      keywords: ["developer", "experiments", "reset"],
    },
    {
      label: "Change Log",
      href: "/settings/change_log",
      section: "info",
      keywords: ["release", "updates", "news", "version history"],
    },
  ];

  const normalizedQuery = $derived(searchQuery.trim().toLowerCase());
  const isSearching = $derived(normalizedQuery.length > 0);
  const userSettingsItems = settingsItems.filter(
    (item) => item.section === "user",
  );
  const appSettingsItems = settingsItems.filter(
    (item) => item.section === "app",
  );
  const infoSettingsItems = settingsItems.filter(
    (item) => item.section === "info",
  );
  const filteredUserSettingsItems = $derived(
    userSettingsItems.filter((item) => matchesQuery(item, normalizedQuery)),
  );
  const filteredAppSettingsItems = $derived(
    appSettingsItems.filter((item) => matchesQuery(item, normalizedQuery)),
  );
  const filteredInfoSettingsItems = $derived(
    infoSettingsItems.filter((item) => matchesQuery(item, normalizedQuery)),
  );
  const filteredSearchResults = $derived(
    settingsItems.filter((item) => matchesQuery(item, normalizedQuery)),
  );
  const hasSearchResults = $derived(filteredSearchResults.length > 0);

  const sectionLabels: Record<SettingsSection, string> = {
    user: "User Settings",
    app: "App Settings",
    info: "What's New?",
  };

  type NavigationFn = (..._args: [string | URL]) => void; // eslint-disable-line no-unused-vars

  const gotoUnsafe: NavigationFn = goto as unknown as NavigationFn;

  const matchesQuery = (item: SettingsItem, query: string) => {
    if (!query) return true;
    if (item.label.toLowerCase().includes(query)) return true;
    return item.keywords.some((keyword) => keyword.includes(query));
  };

  $effect(() => {
    if (!browser) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeSettings();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  });

  function navigateTo(href: string) {
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    gotoUnsafe(href);
  }

  function closeSettings() {
    const lastVisited = get(lastVisitedServerId);
    navigateTo(lastVisited ? `/channels/${lastVisited}` : "/");
  }

  function handleLogout() {
    authStore.logout();
    navigateTo("/");
  }

  async function copyAppInfo() {
    if (!browser || !navigator.clipboard) return;
    const info = ["Tauri: 2", "Svelte: 5.0.0", "TypeScript: 5.6.2"].join("\n");
    try {
      await navigator.clipboard.writeText(info);
    } catch (error) {
      console.error("Failed to copy app info", error);
    }
  }
</script>

<div class="flex h-full min-h-0 text-white">
  <aside class="flex min-h-0 w-[36vw] flex-col bg-base-100 p-4 shadow-lg">
    <div
      class="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-muted py-[60px] px-2"
    >
      <div class="ml-auto w-[238px] space-y-4">
        <div class="relative">
          <Input placeholder="Search" bind:value={searchQuery} class="pr-10" />
          <Button
            variant="ghost"
            size="icon"
            class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onclick={() => (searchQuery = "")}
            aria-label={searchQuery ? "Clear search" : "Search settings"}
          >
            {#if searchQuery}
              <X class="size-4" />
            {:else}
              <Search class="size-4" />
            {/if}
          </Button>
        </div>

        {#if isSearching}
          <div class="space-y-3">
            <Label
              class="px-2 text-xs font-bold uppercase text-muted-foreground"
            >
              Search Results
            </Label>
            {#if hasSearchResults}
              <SearchResultsList
                title="Search Results"
                items={filteredSearchResults}
                currentPath={$page.url.pathname}
                {sectionLabels}
                onNavigate={(href) => navigateTo(href)}
              />
            {:else}
              <div
                class="flex flex-col items-center justify-center pt-10 text-muted-foreground"
              >
                <Smile class="mb-3 h-10 w-10" />
                <p class="text-sm">No search results</p>
              </div>
            {/if}
          </div>
        {:else}
          <div class="space-y-3">
            <SettingsList
              title="User Settings"
              items={filteredUserSettingsItems}
              currentPath={$page.url.pathname}
              onNavigate={(href) => navigateTo(href)}
            />
            <Separator class="my-2" />
            <SettingsList
              title="App Settings"
              items={filteredAppSettingsItems}
              currentPath={$page.url.pathname}
              onNavigate={(href) => navigateTo(href)}
            />
            <Separator class="my-2" />
            <SettingsList
              title="What's New?"
              items={filteredInfoSettingsItems}
              currentPath={$page.url.pathname}
              onNavigate={(href) => navigateTo(href)}
            />
            <Separator class="my-2" />
            <Button
              variant="destructive"
              class="w-full justify-start"
              onclick={handleLogout}
            >
              Log Out
            </Button>
            <Separator class="my-2" />
            <Button
              variant="ghost"
              class="w-full flex-col items-start font-mono text-xs"
              onclick={copyAppInfo}
            >
              Tauri: 2
              <br />
              Svelte: 5.0.0
              <br />
              TypeScript: 5.6.2
            </Button>
          </div>
        {/if}
      </div>
    </div>
  </aside>
  <main class="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
    <div class="relative mx-auto w-full max-w-[740px] p-[60px_40px_80px]">
      <Button
        variant="ghost"
        size="icon"
        class="absolute right-0 top-0 z-50 text-muted-foreground hover:text-foreground"
        onclick={closeSettings}
        aria-label="Close settings"
      >
        <X class="size-6" />
      </Button>
      {@render children()}
    </div>
  </main>
</div>
