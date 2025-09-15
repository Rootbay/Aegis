<script lang="ts">
  import type { ComponentType } from 'svelte';

  export let name: string;
  export let size: string | number = '6';
  export let clazz: string = '';

  type LucideModule = { default: ComponentType };
  const iconModules = import.meta.glob<LucideModule>(
    '../../../../node_modules/@lucide/svelte/dist/icons/*.js'
  );

  const iconLoaders = new Map<string, () => Promise<LucideModule>>();

  const toKebab = (value: string) =>
    value
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
      .replace(/_/g, '-')
      .replace(/-+/g, '-')
      .toLowerCase();

  for (const [path, loader] of Object.entries(iconModules)) {
    const filename = path.split('/').pop()?.replace(/\.(svelte|js)$/i, '');
    if (!filename) continue;
    iconLoaders.set(toKebab(filename), loader);
  }

  let icon: ComponentType | null = null;
  let currentRequest = '';
  let lastMissing: string | null = null;

  const normalizeInput = (value: string) => toKebab(value.trim().replace(/\s+/g, '-'));

  async function loadIcon(requested: string) {
    const normalized = normalizeInput(requested);
    currentRequest = normalized;

    const loader = iconLoaders.get(normalized);
    if (!loader) {
      icon = null;
      if (lastMissing !== normalized) {
        console.warn(`Icon "${requested}" not found in Lucide set.`);
        lastMissing = normalized;
      }
      return;
    }

    lastMissing = null;
    try {
      const module = await loader();
      if (currentRequest !== normalized) return;
      icon = module.default ?? null;
    } catch (error) {
      if (currentRequest !== normalized) return;
      icon = null;
      console.error(`Failed to load Lucide icon "${requested}".`, error);
    }
  }

  $: if (name?.trim()) {
    loadIcon(name);
  } else {
    icon = null;
  }
</script>

<div class="inline-block" style:width="{+size / 4}rem" style:height="{+size / 4}rem">
  {#if icon}
    <svelte:component this={icon} size={size} class={clazz} />
  {/if}
</div>
