<script lang="ts">
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";

  let ephemeralMessageDuration = $state("24");
</script>

<h1 class="text-2xl font-semibold text-zinc-50">Data & Storage</h1>

<div class="space-y-4 max-w-sm">
  <div class="space-y-2">
    <Label
      for="ephemeral-messages"
      class="text-sm font-medium text-zinc-200"
    >
      Ephemeral message duration (hours)
    </Label>
    <Input
      id="ephemeral-messages"
      type="number"
      min={0}
      bind:value={ephemeralMessageDuration}
    />
  </div>
</div>
