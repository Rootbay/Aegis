<script>
  const keybinds = [{ action: "Close Modal", key: "Esc" }];
</script>

<div class="p-4">
  <h1 class="text-2xl font-bold mb-4">Keybinds</h1>
  <div class="space-y-2">
    {#each keybinds as keybind (keybind.action)}
      <div class="flex justify-between items-center p-2 bg-card rounded-lg">
        <span>{keybind.action}</span>
        <span class="px-2 py-1 bg-muted rounded-md text-sm">{keybind.key}</span>
      </div>
    {/each}
  </div>
</div>
