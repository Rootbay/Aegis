<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import type {
    Server,
    MessageModerationReport,
    UserModerationReport,
  } from "$lib/features/servers/models/Server";

  type UnaryHandler<T> = (value: T) => void; // eslint-disable-line no-unused-vars

  type Props = {
    server: Server;
    onupdateServer?: UnaryHandler<Server>;
  };

  let { server, onupdateServer }: Props = $props();

  let transparentEdits = $state(false);
  let deletedMessageDisplay = $state<"ghost" | "tombstone">("ghost");

  const userReports = $derived(
    () => server?.moderationReports?.userReports ?? [],
  );
  const messageReports = $derived(
    () => server?.moderationReports?.messageReports ?? [],
  );

  const openUserReportCount = $derived(
    () =>
      userReports().filter(
        (report) =>
          report.status !== "resolved" && report.status !== "dismissed",
      ).length,
  );
  const openMessageReportCount = $derived(
    () =>
      messageReports().filter(
        (report) =>
          report.status !== "resolved" && report.status !== "dismissed",
      ).length,
  );

  const recentUserReports = $derived(() =>
    userReports()
      .slice()
      .sort((a, b) =>
        (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
      )
      .slice(0, 5),
  );
  const recentMessageReports = $derived(() =>
    messageReports()
      .slice()
      .sort((a, b) =>
        (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
      )
      .slice(0, 5),
  );

  function saveChanges() {
    const settings = {
      transparentEdits,
      deletedMessageDisplay,
    };
    onupdateServer?.({ ...server, settings });
  }

  function formatReportStatus(status?: string | null): string {
    switch (status) {
      case "resolved":
        return "Resolved";
      case "reviewing":
        return "In review";
      case "dismissed":
        return "Dismissed";
      default:
        return "Open";
    }
  }

  function statusClasses(status?: string | null): string {
    switch (status) {
      case "resolved":
        return "bg-emerald-500/10 text-emerald-300 border-emerald-500/30";
      case "reviewing":
        return "bg-amber-500/10 text-amber-300 border-amber-500/30";
      case "dismissed":
        return "bg-muted/40 text-muted-foreground border-border/60";
      default:
        return "bg-red-500/10 text-red-300 border-red-500/30";
    }
  }

  function formatReportTimestamp(value?: string | null): string {
    if (!value) {
      return "Unknown";
    }
    try {
      return new Date(value).toLocaleString();
    } catch (error) {
      console.warn("Failed to format report timestamp", error);
      return value;
    }
  }

  function renderUserReportSummary(report: UserModerationReport): string {
    if (report.summary?.trim()) {
      return report.summary;
    }
    return `Reported ${report.targetUserName ?? report.targetUserId}`;
  }

  function renderMessageReportSummary(report: MessageModerationReport): string {
    if (report.messageExcerpt?.trim()) {
      return report.messageExcerpt;
    }
    return "No excerpt available";
  }
</script>

<h2 class="text-left text-xs font-bold px-2.5 py-1.5 uppercase">
  Moderation Settings
</h2>
<div class="space-y-6">
  <div class="flex items-center justify-between p-4 bg-card rounded-lg">
    <div>
      <h3 class="font-medium">Transparent Message Edits</h3>
      <p id="transparent-edits-description" class="text-sm text-gray-400">
        Allows server admins to view the edit history of messages.
      </p>
    </div>
    <div class="flex items-center gap-2">
      <Label class="sr-only" for="transparent-edits">
        Transparent Message Edits
      </Label>
      <Switch
        id="transparent-edits"
        aria-describedby="transparent-edits-description"
        bind:checked={transparentEdits}
      />
    </div>
  </div>

  <div>
    <h3 class="font-medium mb-2">Deleted Message Display</h3>
    <div class="bg-card p-4 rounded-lg space-y-2">
      <label class="flex items-center">
        <input
          type="radio"
          bind:group={deletedMessageDisplay}
          value="ghost"
          class="form-radio h-4 w-4 text-indigo-600"
        />
        <span class="ml-3">See nothing (The Ghost)</span>
      </label>
      <label class="flex items-center">
        <input
          type="radio"
          bind:group={deletedMessageDisplay}
          value="tombstone"
          class="form-radio h-4 w-4 text-indigo-600"
        />
        <span class="ml-3">See "message deleted" notice (The Tombstone)</span>
      </label>
    </div>
  </div>

  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-lg border border-border/60 bg-card/60 p-4">
      <p class="text-xs uppercase tracking-wide text-muted-foreground">
        Open user reports
      </p>
      <p class="mt-2 text-3xl font-semibold text-white">
        {openUserReportCount()}
      </p>
      <p class="text-xs text-muted-foreground">
        {userReports().length} total submissions
      </p>
    </div>
    <div class="rounded-lg border border-border/60 bg-card/60 p-4">
      <p class="text-xs uppercase tracking-wide text-muted-foreground">
        Open message reports
      </p>
      <p class="mt-2 text-3xl font-semibold text-white">
        {openMessageReportCount()}
      </p>
      <p class="text-xs text-muted-foreground">
        {messageReports().length} total submissions
      </p>
    </div>
  </div>

  <div class="grid gap-6 lg:grid-cols-2">
    <section class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4">
      <div>
        <h3 class="font-medium text-white">Recent user reports</h3>
        <p class="text-xs text-muted-foreground">
          The five most recent user reports requiring moderator attention.
        </p>
      </div>
      {#if recentUserReports().length > 0}
        <ul class="space-y-3">
          {#each recentUserReports() as report (report.id)}
            <li class="rounded-md border border-border/60 bg-card/30 p-3">
              <div class="flex items-center justify-between gap-2">
                <div class="text-sm font-medium text-white">
                  {report.targetUserName ?? report.targetUserId}
                </div>
                <span
                  class={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusClasses(report.status)}`}
                >
                  {formatReportStatus(report.status)}
                </span>
              </div>
              <p class="mt-1 text-sm text-muted-foreground">
                {renderUserReportSummary(report)}
              </p>
              <p class="mt-2 text-xs text-muted-foreground">
                Reported {formatReportTimestamp(report.createdAt)} · Reason: {report.reason}
              </p>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="text-sm text-muted-foreground">
          No user reports have been submitted yet.
        </p>
      {/if}
    </section>

    <section class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4">
      <div>
        <h3 class="font-medium text-white">Recent message reports</h3>
        <p class="text-xs text-muted-foreground">
          Messages flagged by members are tracked separately for quick review.
        </p>
      </div>
      {#if recentMessageReports().length > 0}
        <ul class="space-y-3">
          {#each recentMessageReports() as report (report.id)}
            <li class="rounded-md border border-border/60 bg-card/30 p-3">
              <div class="flex items-center justify-between gap-2">
                <div class="text-sm font-medium text-white">
                  {report.chatName ?? report.chatId ?? "Unknown location"}
                </div>
                <span
                  class={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusClasses(report.status)}`}
                >
                  {formatReportStatus(report.status)}
                </span>
              </div>
              <p class="mt-1 text-sm text-muted-foreground">
                {renderMessageReportSummary(report)}
              </p>
              <p class="mt-2 text-xs text-muted-foreground">
                Reported {formatReportTimestamp(report.createdAt)} · Reason: {report.reason}
              </p>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="text-sm text-muted-foreground">
          No message reports have been submitted yet.
        </p>
      {/if}
    </section>
  </div>

  <Button class="font-semibold" onclick={saveChanges}>Save Changes</Button>
</div>
