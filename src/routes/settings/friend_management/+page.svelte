<script lang="ts">
  import { get } from "svelte/store";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import {
    settings,
    setAllowFriendInvites,
    setAutoApproveKnownContacts,
    setShareOnlineStatus,
  } from "$lib/features/settings/stores/settings";

  let allowInvites = $state(get(settings).allowFriendInvites);
  let autoApproveKnown = $state(get(settings).autoApproveKnownContacts);
  let shareStatus = $state(get(settings).shareOnlineStatus);

  $effect(() => {
    const unsubscribe = settings.subscribe((value) => {
      allowInvites = value.allowFriendInvites;
      autoApproveKnown = value.autoApproveKnownContacts;
      shareStatus = value.shareOnlineStatus;
    });
    return () => unsubscribe();
  });

  $effect(() => {
    const current = get(settings);
    if (current.allowFriendInvites !== allowInvites) {
      setAllowFriendInvites(allowInvites);
    }
    if (current.autoApproveKnownContacts !== autoApproveKnown) {
      setAutoApproveKnownContacts(autoApproveKnown);
    }
    if (current.shareOnlineStatus !== shareStatus) {
      setShareOnlineStatus(shareStatus);
    }
  });
</script>

<div class="space-y-6">
  <div>
    <h1 class="text-2xl font-semibold text-zinc-50">Friend management</h1>
    <p class="text-sm text-muted-foreground">
      Decide who can add you and when to automatically accept invitations from
      verified contacts.
    </p>
  </div>

  <section
    class="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
  >
    <div class="flex items-center justify-between gap-4">
      <div>
        <Label class="text-sm font-medium text-zinc-200">
          Allow friend invites
        </Label>
        <p class="text-xs text-muted-foreground">
          When disabled, others cannot send you new friend requests.
        </p>
      </div>
      <Switch
        class="shrink-0"
        bind:checked={allowInvites}
        aria-label="Toggle friend invites"
      />
    </div>

    <div class="flex items-center justify-between gap-4">
      <div>
        <Label class="text-sm font-medium text-zinc-200">
          Auto-approve known contacts
        </Label>
        <p class="text-xs text-muted-foreground">
          Automatically accept requests from people you have chatted with in the
          last 30 days.
        </p>
      </div>
      <Switch
        class="shrink-0"
        bind:checked={autoApproveKnown}
        aria-label="Toggle auto approval"
      />
    </div>

    <div class="flex items-center justify-between gap-4">
      <div>
        <Label class="text-sm font-medium text-zinc-200">
          Share online presence
        </Label>
        <p class="text-xs text-muted-foreground">
          Display your online/offline state to friends to improve coordination.
        </p>
      </div>
      <Switch
        class="shrink-0"
        bind:checked={shareStatus}
        aria-label="Toggle presence sharing"
      />
    </div>
  </section>
</div>
