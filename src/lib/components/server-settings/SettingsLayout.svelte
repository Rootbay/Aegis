<script lang="ts">
  import { X, Smile, Search } from "@lucide/svelte";
  import type { Component } from "svelte";
  import RolesManagement from "$lib/features/servers/components/RolesManagement.svelte";
  import ChannelManagement from "$lib/features/channels/components/ChannelManagement.svelte";
  import WebhookManagement from "$lib/features/servers/components/WebhookManagement.svelte";
  import MemberList from "$lib/components/lists/MemberList.svelte";
  import BanList from "$lib/components/lists/BanList.svelte";
  import Overview from "$lib/components/server-settings/Overview.svelte";
  import Moderation from "$lib/components/server-settings/Moderation.svelte";
  import UserManagement from "$lib/components/server-settings/UserManagement.svelte";
  import Roles from "$lib/components/server-settings/Roles.svelte";
  import Privacy from "$lib/components/server-settings/Privacy.svelte";
  import ServerEventsPanel from "$lib/components/server-settings/ServerEventsPanel.svelte";
  import {
    AlertDialog,
    AlertDialogHeader,
    AlertDialogContent,
    AlertDialogCancel,
    AlertDialogAction,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
  } from "$lib/components/ui/alert-dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
  import {
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
  } from "$lib/components/ui/select/index.js";
  import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
  } from "$lib/components/ui/card/index.js";
  import {
    Avatar,
    AvatarImage,
    AvatarFallback,
  } from "$lib/components/ui/avatar/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";

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
    type: "separator";
  };

  type SidebarItem = SidebarLinkItem | SidebarSeparator;
  type EventHandler<T> = T extends void
    ? (() => void) | undefined
    : ((detail: T) => void) | undefined; // eslint-disable-line no-unused-vars

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
    onbutton_click,
  }: {
    title: string;
    sidebarItems: SidebarItem[];
    allSettings: any[];
    categoryHeadings: { [key: string]: string };
    currentData: any;
    initialActiveTab?: string;
    onclose?: EventHandler<Events["close"]>;
    onupdate_setting?: EventHandler<Events["update_setting"]>;
    onadd_role?: EventHandler<Events["add_role"]>;
    onupdate_role?: EventHandler<Events["update_role"]>;
    ondelete_role?: EventHandler<Events["delete_role"]>;
    onupdate_server?: EventHandler<Events["update_server"]>;
    ondelete_server?: EventHandler<Events["delete_server"]>;
    ontoggle_permission?: EventHandler<Events["toggle_permission"]>;
    onadd_channel?: EventHandler<Events["add_channel"]>;
    onupdate_channel?: EventHandler<Events["update_channel"]>;
    ondelete_channel?: EventHandler<Events["delete_channel"]>;
    onbutton_click?: EventHandler<Events["button_click"]>;
  } = $props();

  let filteredSidebarItems = $derived(
    sidebarItems.filter((item) => {
      if (isSeparator(item)) {
        return !searchQuery;
      }
      if (!searchQuery) return true;
      const content = pageContents[item.tab] || "";
      return (
        item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        content.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }),
  );

  let pageContents = $state<{ [key: string]: string }>({});
  let activeTab = $state("");
  let searchQuery = $state("");
  let isSearching = $derived(searchQuery.length > 0);

  let showDeleteServerConfirm = $state(false);

  const serverAwareComponents = new Set([
    "Overview",
    "Moderation",
    "Privacy",
    "ServerEventsPanel",
    "WebhookManagement",
  ]);
  const isSeparator = (item: SidebarItem): item is SidebarSeparator =>
    item.type === "separator";

  function getOptionLabel(
    options: Array<{ value: string; label: string }>,
    value: unknown,
  ): string {
    if (!Array.isArray(options)) {
      return "";
    }
    const match = options.find((option) => option.value === value);
    return match?.label ?? "";
  }

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
    Privacy,
    ServerEventsPanel,
  };

  $effect(() => {
    const initialize = async () => {
      if (
        initialActiveTab &&
        sidebarItems.some((i) => !isSeparator(i) && i.tab === initialActiveTab)
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
      if (event.key === "Escape") {
        closeSettings();
      }
    };
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  });

  $effect(() => {
    if (!activeTab) {
      const firstTabItem = sidebarItems.find(
        (item): item is SidebarLinkItem => !isSeparator(item),
      );
      if (firstTabItem) {
        activeTab = firstTabItem.tab;
      }
    }
  });

  $effect(() => {
    if (
      initialActiveTab &&
      sidebarItems.some((i) => !isSeparator(i) && i.tab === initialActiveTab)
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
      pageContents[tab] = "";
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

    if (typeof detail === "string") {
      ondelete_server({ serverId: detail } as any);
      return;
    }

    if (detail && typeof detail === "object") {
      const record = detail as Record<string, unknown>;
      const serverId =
        typeof record["serverId"] === "string"
          ? (record["serverId"] as string)
          : typeof record["id"] === "string"
            ? (record["id"] as string)
            : typeof currentData?.id === "string"
              ? (currentData.id as string)
              : undefined;

      if (serverId) {
        ondelete_server({ serverId, server: detail } as any);
        return;
      }

      ondelete_server(detail as any);
      return;
    }

    if (typeof currentData?.id === "string") {
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

    if (componentName === "MemberList" && currentData) {
      props.members = Array.isArray(currentData.members)
        ? currentData.members
        : [];
      props.serverId = currentData.id;
    }

    if (componentName === "BanList" && currentData) {
      props.serverId = currentData.id;
    }

    if (
      componentName === "Overview" ||
      componentName === "Moderation" ||
      componentName === "Privacy"
    ) {
      props.onupdateServer = handleUpdateServer;
    }

    return props;
  }
</script>

<div class="flex h-full text-white">
  <aside class="w-[36vw] bg-zinc-900 p-4 shadow-lg flex flex-col h-full">
    <ScrollArea class="flex-grow py-[60px] px-2">
      <div class="w-[238px] ml-auto">
        <div class="relative mb-4">
          <Input placeholder="Search" bind:value={searchQuery} class="pr-9" />
          <Button
            variant="ghost"
            size="icon"
            class="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
            onclick={() => (searchQuery = "")}
          >
            {#if searchQuery}
              <X class="w-4 h-4" />
            {:else}
              <Search class="w-4 h-4" />
            {/if}
          </Button>
        </div>
        <h2
          class="text-left text-[12px] font-bold px-[10px] py-[6px] uppercase"
          class:hidden={isSearching}
        >
          {title}
        </h2>
        <h2
          class="text-left text-[12px] font-bold px-[10px] py-[6px] uppercase"
          class:hidden={!isSearching}
        >
          Search Result
        </h2>
        <ul>
          {#each filteredSidebarItems as item, index (isSeparator(item) ? `sep-${index}` : item.tab)}
            {#if isSeparator(item)}
              <Separator class="my-2 mx-[10px]" />
            {:else}
              {@const navItem = item}
              {@const Icon = navItem.icon}
              <li>
                <Button
                  variant="ghost"
                  class={`w-full justify-start h-8 px-[10px] gap-2 ${activeTab === navItem.tab ? "bg-zinc-700 text-white hover:bg-zinc-600" : ""}`}
                  onclick={() => (activeTab = navItem.tab)}
                >
                  <Icon class="w-4 h-4" />
                  <span class="truncate">{navItem.label}</span>
                </Button>
              </li>
            {/if}
          {/each}
        </ul>
        {#if !isSearching}
          <Separator class="my-2 mx-[10px]" />
          <ul>
            <li>
              <Button
                variant="ghost"
                class="w-full flex items-center h-8 px-[10px] py-[6px] text-red-400 hover:bg-zinc-700 transition-colors duration-200 mb-[2px]"
                onclick={() => (showDeleteServerConfirm = true)}
              >
                Delete Server
              </Button>
            </li>
          </ul>
        {/if}
        {#if isSearching && filteredSidebarItems.length === 0}
          <div
            class="flex flex-col items-center justify-center text-muted-foreground mt-8"
          >
            <Smile class="w-12 h-12 mb-2" />
            <p class="text-sm">No Search Results</p>
          </div>
        {/if}
      </div>
    </ScrollArea>
  </aside>

  <main class="flex-1 w-full overflow-hidden overflow-x-hidden relative">
    <div class="w-[740px] mx-auto p-[60px_40px_80px]">
      <Button
        variant="ghost"
        size="icon"
        class="absolute top-0 right-0 text-muted-foreground hover:text-white transition-colors duration-200 p-4 z-50"
        onclick={closeSettings}
      >
        <X class="w-6 h-6" />
      </Button>
      {#each Object.entries(categoryHeadings) as [category, heading] (category)}
        {#if activeTab === category}
          <h3 class="text-2xl font-semibold mb-6 text-blue-400">{heading}</h3>
          <div class="space-y-8">
            {#each allSettings.filter((setting) => setting.category === category) as setting, i (setting.id ?? `${category}-${i}`)}
              <Card>
                <CardHeader>
                  <CardTitle>{setting.title}</CardTitle>
                  <CardDescription>{setting.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  {#if setting.type === "text" || setting.type === "image"}
                    <Input
                      type="text"
                      value={currentData[setting.property]}
                      onchange={(e) =>
                        onupdate_setting?.({
                          id: setting.id,
                          property: setting.property,
                          value: (e.currentTarget as HTMLInputElement).value,
                        })}
                    />
                    {#if setting.type === "image" && currentData[setting.property]}
                      <img
                        src={currentData[setting.property]}
                        alt="Server Icon"
                        class="mt-4 w-24 h-24 object-cover rounded-full"
                      />
                    {/if}
                    {#if currentData[setting.property]}
                      <Avatar class="mt-4 h-24 w-24">
                        <AvatarImage
                          src={currentData[setting.property]}
                          alt="Server Icon"
                        />
                        <AvatarFallback
                          >{(currentData.name ?? "SV")
                            .slice(0, 2)
                            .toUpperCase()}</AvatarFallback
                        >
                      </Avatar>
                    {/if}
                  {:else if setting.type === "static"}
                    <p
                      class="text-muted-foreground font-mono bg-card p-2 rounded"
                    >
                      {currentData[setting.property]}
                    </p>
                  {:else if setting.type === "select"}
                    <Select
                      type="single"
                      value={currentData[setting.property]}
                      onValueChange={(value: string) =>
                        onupdate_setting?.({
                          id: setting.id,
                          property: setting.property,
                          value,
                        })}
                    >
                      <SelectTrigger class="w-full">
                        <span data-slot="select-value" class="flex-1 text-left">
                          {getOptionLabel(
                            setting.options,
                            currentData[setting.property],
                          ) || "Select an option"}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {#each setting.options as option (option.value)}
                          <SelectItem value={option.value}
                            >{option.label}</SelectItem
                          >
                        {/each}
                      </SelectContent>
                    </Select>
                  {:else if setting.type === "toggle"}
                    <Switch
                      checked={currentData[setting.property]}
                      onCheckedChange={(val) =>
                        onupdate_setting?.({
                          id: setting.id,
                          property: setting.property,
                          value: val,
                        })}
                    />
                    <span class="ml-3 text-zinc-300 font-medium"
                      >{setting.title}</span
                    >
                  {:else if setting.type === "custom_component"}
                    {#if setting.component === "RolesManagement"}
                      <RolesManagement
                        roles={currentData.roles ?? []}
                        {onadd_role}
                        {onupdate_role}
                        {ondelete_role}
                        {ontoggle_permission}
                      />
                    {:else if setting.component === "ChannelManagement"}
                      <ChannelManagement
                        channels={currentData.channels ?? []}
                        {onadd_channel}
                        {onupdate_channel}
                        {ondelete_channel}
                      />
                    {:else if componentMap[setting.component]}
                      {@const dynamicComponent =
                        componentMap[setting.component]}
                      {@const componentProps = getComponentProps(
                        setting.component,
                      )}
                      {#if dynamicComponent}
                        <dynamicComponent
                          {...componentProps}
                          {onupdate_setting}
                          {onbutton_click}
                        ></dynamicComponent>
                      {/if}
                    {/if}
                  {:else if setting.type === "button"}
                    <Button
                      variant={setting.buttonType === "danger"
                        ? "destructive"
                        : "default"}
                      onclick={() => onbutton_click?.({ id: setting.id })}
                    >
                      {setting.buttonLabel}
                    </Button>
                  {/if}
                </CardContent>
              </Card>
            {/each}
          </div>
        {/if}
      {/each}
      <Separator class="my-2 mx-[10px]" />
    </div>
  </main>
  <AlertDialog bind:open={showDeleteServerConfirm}>
    <AlertDialogContent class="max-w-sm">
      <AlertDialogHeader>
        <AlertDialogTitle class="text-red-400">Delete server?</AlertDialogTitle>
        <AlertDialogDescription>
          This action permanently removes {currentData?.name ?? "this server"} and
          all of its data. You cannot undo this.
        </AlertDialogDescription>
      </AlertDialogHeader>

      <AlertDialogFooter>
        <AlertDialogCancel
          onclick={() => (showDeleteServerConfirm = false)}
          class="rounded-md"
        >
          Cancel
        </AlertDialogCancel>

        <AlertDialogAction
          onclick={() => {
            showDeleteServerConfirm = false;
            handleDeleteServer(currentData);
          }}
          class="rounded-md bg-red-600 text-white hover:bg-red-700"
        >
          Delete Server
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</div>

<style lang="postcss">
  .dot {
    left: 0.25rem;
    transition: transform 0.2s ease-in-out;
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
    background-color: theme("colors.zinc.700");
  }

  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background-color: theme("colors.zinc.600");
  }
</style>
