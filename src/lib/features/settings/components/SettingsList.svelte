<script lang="ts">
  import { Label } from "$lib/components/ui/label/index.js";
  import { Button } from "$lib/components/ui/button/index.js";

  export type SettingsItem = {
    label: string;
    href: string;
  };

  type NavigateHandler = (..._args: [string]) => void; // eslint-disable-line no-unused-vars

  let {
    title,
    items = [],
    currentPath,
    onNavigate,
  }: {
    title: string;
    items?: SettingsItem[];
    currentPath: string;
    onNavigate?: NavigateHandler;
  } = $props();
</script>

<div class="space-y-1">
  <Label class="px-2 text-xs font-bold uppercase text-muted-foreground">
    {title}
  </Label>
  <ul>
    {#each items as item (item.href)}
      <li>
        <Button
          variant={currentPath.startsWith(item.href) ? "secondary" : "ghost"}
          class="w-full justify-start"
          onclick={() => onNavigate?.(item.href)}
        >
          {item.label}
        </Button>
      </li>
    {/each}
  </ul>
</div>
