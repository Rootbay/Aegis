<script lang="ts">
  import { get } from "svelte/store";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import {
    settings,
    setFilterMatureContentEnabled,
    setAllowTaggingByFriends,
    setAutoShareActivityStatus,
    setSurfaceFriendSuggestions,
  } from "$lib/features/settings/stores/settings";

  let filterMatureContent = $state(get(settings).filterMatureContent);
  let allowTagging = $state(get(settings).allowTaggingByFriends);
  let shareActivity = $state(get(settings).autoShareActivityStatus);
  let surfaceSuggestions = $state(get(settings).surfaceFriendSuggestions);

  $effect(() => {
    const unsubscribe = settings.subscribe((value) => {
      filterMatureContent = value.filterMatureContent;
      allowTagging = value.allowTaggingByFriends;
      shareActivity = value.autoShareActivityStatus;
      surfaceSuggestions = value.surfaceFriendSuggestions;
    });

    return () => unsubscribe();
  });

  $effect(() => {
    const current = get(settings);
    if (current.filterMatureContent !== filterMatureContent) {
      setFilterMatureContentEnabled(filterMatureContent);
    }
    if (current.allowTaggingByFriends !== allowTagging) {
      setAllowTaggingByFriends(allowTagging);
    }
    if (current.autoShareActivityStatus !== shareActivity) {
      setAutoShareActivityStatus(shareActivity);
    }
    if (current.surfaceFriendSuggestions !== surfaceSuggestions) {
      setSurfaceFriendSuggestions(surfaceSuggestions);
    }
  });
</script>

<div class="space-y-6">
  <div>
    <h1 class="text-2xl font-semibold text-zinc-50">Content & social</h1>
    <p class="text-sm text-muted-foreground">
      Control how others discover you and which content appears in shared
      spaces.
    </p>
  </div>

  <section
    class="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
  >
    <div class="flex items-center justify-between gap-4">
      <div>
        <Label class="text-sm font-medium text-zinc-200">
          Filter mature imagery
        </Label>
        <p class="text-xs text-muted-foreground">
          Blur attachments flagged as explicit until you choose to reveal them.
        </p>
      </div>
      <Switch
        class="shrink-0"
        bind:checked={filterMatureContent}
        aria-label="Toggle mature content filter"
      />
    </div>

    <div class="flex items-center justify-between gap-4">
      <div>
        <Label class="text-sm font-medium text-zinc-200">
          Allow friends to tag me
        </Label>
        <p class="text-xs text-muted-foreground">
          Control whether friends can mention you in community spotlights.
        </p>
      </div>
      <Switch
        class="shrink-0"
        bind:checked={allowTagging}
        aria-label="Toggle friend tagging"
      />
    </div>

    <div class="flex items-center justify-between gap-4">
      <div>
        <Label class="text-sm font-medium text-zinc-200">
          Share activity status
        </Label>
        <p class="text-xs text-muted-foreground">
          Broadcast what you are listening to or playing with trusted contacts.
        </p>
      </div>
      <Switch
        class="shrink-0"
        bind:checked={shareActivity}
        aria-label="Toggle activity sharing"
      />
    </div>

    <div class="flex items-center justify-between gap-4">
      <div>
        <Label class="text-sm font-medium text-zinc-200">
          Suggest nearby communities
        </Label>
        <p class="text-xs text-muted-foreground">
          Surface curated servers that match your interests and location.
        </p>
      </div>
      <Switch
        class="shrink-0"
        bind:checked={surfaceSuggestions}
        aria-label="Toggle friend suggestions"
      />
    </div>
  </section>
</div>
