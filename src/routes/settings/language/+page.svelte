<script lang="ts">
  import { get } from "svelte/store";
  import { Check } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import {
    settings,
    setPreferredLanguage,
  } from "$lib/features/settings/stores/settings";

  type LanguageOption = { label: string; value: string };

  const languages: LanguageOption[] = [
    { label: "English", value: "en-US" },
    { label: "Español", value: "es-ES" },
    { label: "Français", value: "fr-FR" },
    { label: "Deutsch", value: "de-DE" },
    { label: "Italiano", value: "it-IT" },
    { label: "Português", value: "pt-BR" },
    { label: "日本語", value: "ja-JP" },
    { label: "中文 (简体)", value: "zh-CN" },
  ];

  let selectedLanguage = $state(get(settings).preferredLanguage);

  $effect(() => {
    const unsubscribe = settings.subscribe((value) => {
      selectedLanguage = value.preferredLanguage;
    });
    return () => unsubscribe();
  });

  function selectLanguage(option: LanguageOption) {
    if (option.value === get(settings).preferredLanguage) return;
    setPreferredLanguage(option.value);
  }

  const selectedLabel = $derived(
    () => languages.find((option) => option.value === selectedLanguage)?.label,
  );
</script>

<div class="space-y-6">
  <div>
    <h1 class="text-2xl font-semibold text-zinc-50">Language</h1>
    <p class="text-sm text-muted-foreground">
      Update UI copy, system messages, and voice prompts to match your locale.
    </p>
  </div>

  <div>
    <h3 class="text-xs font-semibold text-muted-foreground uppercase mb-2">
      Select your preferred language
    </h3>
    <ul
      class="divide-y divide-zinc-800 overflow-hidden rounded-md border border-zinc-800 bg-card"
    >
      {#each languages as lang (lang.value)}
        <li>
          <Button
            variant="ghost"
            class={`w-full justify-between px-4 py-3 text-sm transition-colors duration-200 ${
              selectedLanguage === lang.value
                ? "bg-primary/20 text-primary font-medium hover:bg-primary/30"
                : "text-foreground hover:bg-muted"
            }`}
            onclick={() => selectLanguage(lang)}
          >
            <span>{lang.label}</span>
            {#if selectedLanguage === lang.value}
              <Check class="h-4 w-4" />
            {/if}
          </Button>
        </li>
      {/each}
    </ul>
  </div>

  <p class="text-xs text-muted-foreground">
    Current selection: {selectedLabel ?? "System default"}. Some translations
    may still be in progress across community-provided locales.
  </p>
</div>
