<script lang="ts">
  import { CircleCheck, Copy, Link2, RefreshCcw } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import {
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
  } from "$lib/components/ui/select/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import type { Channel } from "$lib/features/channels/models/Channel";
  import type {
    Server,
    ServerWidgetSettings,
  } from "$lib/features/servers/models/Server";

  interface Props {
    server?: Server | null;
    widgetSettings?: ServerWidgetSettings | null | undefined;
    channels?: Channel[];
    onupdate_setting?: unknown;
  }

  const {
    server = null,
    widgetSettings = null,
    channels = [],
    onupdate_setting = undefined,
  }: Props = $props();

  const currentWidget = $derived.by<ServerWidgetSettings>(() => {
    const firstChannelId =
      Array.isArray(channels) && channels.length > 0
        ? (channels[0]?.id ?? null)
        : null;
    return {
      enabled: widgetSettings?.enabled ?? false,
      channelId:
        widgetSettings?.channelId ??
        server?.default_channel_id ??
        firstChannelId,
      theme: widgetSettings?.theme ?? "dark",
      showMembersOnline: widgetSettings?.showMembersOnline ?? true,
      showInstantInvite: widgetSettings?.showInstantInvite ?? true,
      inviteUrl: widgetSettings?.inviteUrl ?? null,
      previewUrl: widgetSettings?.previewUrl ?? null,
      lastSyncedAt: widgetSettings?.lastSyncedAt ?? null,
    } satisfies ServerWidgetSettings;
  });

  const channelOptions = $derived(
    Array.isArray(channels)
      ? channels
          .filter((channel) => !!channel)
          .map((channel) => ({
            value: channel.id,
            label: channel.name.startsWith("#")
              ? channel.name
              : `#${channel.name}`,
          }))
      : [],
  );

  const canUpdate = $derived(typeof onupdate_setting === "function");

  function emitUpdate(payload: {
    id: string;
    property: string;
    value: unknown;
  }) {
    if (typeof onupdate_setting === "function") {
      Reflect.apply(onupdate_setting as CallableFunction, undefined, [payload]);
    }
  }

  function updateWidget(partial: Partial<ServerWidgetSettings>) {
    const next = { ...currentWidget, ...partial };
    emitUpdate({
      id: "widgetSettings",
      property: "widgetSettings",
      value: next,
    });
  }

  function formatDate(dateString: string | null | undefined): string {
    if (!dateString) return "Never";
    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) return "Never";
    return parsed.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  async function copyInviteUrl() {
    if (!currentWidget.inviteUrl) return;
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        await navigator.clipboard.writeText(currentWidget.inviteUrl);
      }
    } catch (error) {
      console.warn("Failed to copy invite url", error);
    }
  }

  function refreshPreview() {
    updateWidget({ lastSyncedAt: new Date().toISOString() });
  }
</script>

<div class="space-y-6">
  <div class="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
    <div
      class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
    >
      <div>
        <h4 class="text-base font-semibold text-white">Server Widget</h4>
        <p class="text-sm text-muted-foreground">
          Enable a shareable widget so visitors can preview activity and join
          instantly.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs uppercase tracking-wide text-muted-foreground">
          {currentWidget.enabled ? "Enabled" : "Disabled"}
        </span>
        <Switch
          checked={currentWidget.enabled}
          disabled={!canUpdate}
          onCheckedChange={(checked) => updateWidget({ enabled: checked })}
        />
      </div>
    </div>
  </div>

  <div class="grid gap-4 md:grid-cols-2">
    <div class="space-y-2">
      <label
        class="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        Widget Channel
      </label>
      {#if channelOptions.length > 0}
        <Select
          type="single"
          value={currentWidget.channelId ?? undefined}
          disabled={!canUpdate}
          onValueChange={(value: string) => updateWidget({ channelId: value })}
        >
          <SelectTrigger class="w-full">
            <span data-slot="select-value" class="flex-1 text-left">
              {channelOptions.find(
                (option) => option.value === currentWidget.channelId,
              )?.label || "Choose a channel"}
            </span>
          </SelectTrigger>
          <SelectContent>
            {#each channelOptions as option (option.value)}
              <SelectItem value={option.value}>{option.label}</SelectItem>
            {/each}
          </SelectContent>
        </Select>
      {:else}
        <div
          class="rounded-md border border-dashed border-zinc-700 bg-zinc-900/40 p-3 text-sm text-muted-foreground"
        >
          No text channels available.
        </div>
      {/if}
    </div>

    <div class="space-y-2">
      <label
        class="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        Appearance
      </label>
      <Select
        type="single"
        value={currentWidget.theme ?? "dark"}
        disabled={!canUpdate}
        onValueChange={(value: string) => updateWidget({ theme: value })}
      >
        <SelectTrigger class="w-full">
          <span data-slot="select-value" class="flex-1 text-left capitalize">
            {currentWidget.theme ?? "dark"}
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="dark">Dark</SelectItem>
          <SelectItem value="light">Light</SelectItem>
        </SelectContent>
      </Select>
    </div>
  </div>

  <div class="grid gap-4 md:grid-cols-2">
    <div
      class="flex items-start justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 p-4"
    >
      <div>
        <p class="text-sm font-medium text-white">Show online member count</p>
        <p class="text-xs text-muted-foreground">
          Display how many members are active when the widget loads.
        </p>
      </div>
      <Switch
        checked={currentWidget.showMembersOnline ?? true}
        disabled={!canUpdate}
        onCheckedChange={(checked) =>
          updateWidget({ showMembersOnline: checked })}
      />
    </div>

    <div
      class="flex items-start justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 p-4"
    >
      <div>
        <p class="text-sm font-medium text-white">Show instant invite button</p>
        <p class="text-xs text-muted-foreground">
          Allow viewers to join using the latest invite link.
        </p>
      </div>
      <Switch
        checked={currentWidget.showInstantInvite ?? true}
        disabled={!canUpdate}
        onCheckedChange={(checked) =>
          updateWidget({ showInstantInvite: checked })}
      />
    </div>
  </div>

  <div class="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
    <div
      class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
    >
      <div class="space-y-1">
        <p class="text-sm font-medium text-white">Invite link</p>
        <p class="text-xs text-muted-foreground">
          Share this link to let visitors join directly from your widget.
        </p>
        <div class="text-xs text-muted-foreground">
          <Link2 class="mr-1 inline h-3.5 w-3.5 align-middle" />
          {currentWidget.inviteUrl ?? "No invite configured"}
        </div>
      </div>
      <div class="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="secondary"
          disabled={!currentWidget.inviteUrl}
          onclick={copyInviteUrl}
        >
          <Copy class="mr-2 h-4 w-4" /> Copy link
        </Button>
        <Button variant="ghost" disabled={!canUpdate} onclick={refreshPreview}>
          <RefreshCcw class="mr-2 h-4 w-4" /> Refresh Preview
        </Button>
      </div>
    </div>
    <p class="mt-3 text-xs text-muted-foreground">
      <CircleCheck
        class="mr-1 inline h-3.5 w-3.5 align-middle text-emerald-400"
      />
      Last synced {formatDate(currentWidget.lastSyncedAt)}
    </p>
  </div>

  {#if !currentWidget.enabled}
    <div
      class="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/60 p-4 text-sm text-muted-foreground"
    >
      Enable the widget to embed an interactive preview on your website or
      community hub.
    </div>
  {/if}
</div>
