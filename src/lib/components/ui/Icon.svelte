<svelte:options runes={true} />

<script lang="ts">
  import type { ComponentType } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';

  const { name, size = '6', clazz = '' } = $props<{
    name: string;
    size?: string | number;
    clazz?: string;
  }>();

  type LucideModule = { default: ComponentType };
  const iconModules = import.meta.glob<LucideModule>(
    '../../../../node_modules/@lucide/svelte/dist/icons/*.js'
  );

  const iconLoaders = new SvelteMap<string, () => Promise<LucideModule>>();

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

  let icon = $state<ComponentType | null>(null);
  let currentRequest = '';
  let lastMissing: string | null = null;

  const normalizeInput = (value: string) => toKebab(value.trim().replace(/\s+/g, '-'));

  $effect(() => {
    const trimmed = name?.trim();
    if (!trimmed) {
      icon = null;
      currentRequest = '';
      return;
    }

    const normalized = normalizeInput(trimmed);
    currentRequest = normalized;

    const loader = iconLoaders.get(normalized);
    if (!loader) {
      icon = null;
      if (lastMissing !== normalized) {
        console.warn(`Icon "${trimmed}" not found in Lucide set.`);
        lastMissing = normalized;
      }
      return;
    }

    lastMissing = null;

    loader()
      .then((module) => {
        if (currentRequest !== normalized) return;
        icon = module.default ?? null;
      })
      .catch((error) => {
        if (currentRequest !== normalized) return;
        icon = null;
        console.error(`Failed to load Lucide icon "${trimmed}".`, error);
      });
  });
</script>

<div class="inline-block" style:width="{+size / 4}rem" style:height="{+size / 4}rem">
  {#if icon}
    {@const IconComponent = icon}
    <IconComponent size={size} class={clazz} />
  {/if}
</div>

