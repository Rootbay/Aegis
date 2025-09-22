<script lang="ts">
  import Button from "$lib/components/ui/button/button.svelte";
  import Label from "$lib/components/ui/label/label.svelte";

  export type SearchResultItem = {
    label: string;
    href: string;
    section: string;
  };

  type NavigateHandler = (..._args: [string]) => void; // eslint-disable-line no-unused-vars

  let { title, items = [], currentPath, sectionLabels, onNavigate }: {
    title: string;
    items?: SearchResultItem[];
    currentPath: string;
    sectionLabels: Record<string, string>;
    onNavigate?: NavigateHandler;
  } = $props();
</script>

<div class="space-y-1">
  <Label class="px-2 text-xs font-bold uppercase text-muted-foreground">
    {title}
  </Label>
  <ul class="space-y-[2px]">
    {#each items as item (item.href)}
      <li>
        <Button
          variant={currentPath.startsWith(item.href) ? "secondary" : "ghost"}
          class="w-full justify-between"
          onclick={() => onNavigate?.(item.href)}
        >
          <span class="truncate">{item.label}</span>
          <span class="ml-3 text-[10px] uppercase text-muted-foreground">
            {sectionLabels[item.section]}
          </span>
        </Button>
      </li>
    {/each}
  </ul>
</div>
