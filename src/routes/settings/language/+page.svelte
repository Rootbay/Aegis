<script lang="ts">
  import { Check } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button/index.js";

  let selectedLanguage = $state("English");
  const languages = [
    "English",
    "Spanish",
    "French",
    "German",
    "Italian",
    "Portuguese",
    "Japanese",
    "Chinese",
  ];
</script>

<h2 class="text-2xl font-bold mb-6">Language</h2>
<div class="space-y-6">
  <div>
    <h3 class="text-xs font-semibold text-muted-foreground uppercase mb-2">
      Select your preferred language
    </h3>
    <ul
      class="divide-y divide-zinc-800 bg-card rounded-md overflow-hidden border border-zinc-800"
    >
      {#each languages as lang (lang)}
        <li>
          <Button
            variant="ghost"
            class={`w-full justify-between px-4 py-3 text-sm transition-colors duration-200 ${
              selectedLanguage === lang
                ? "bg-primary/20 text-primary font-medium hover:bg-primary/30"
                : "text-foreground hover:bg-muted"
            }`}
            onclick={() => (selectedLanguage = lang)}
          >
            <span>{lang}</span>
            {#if selectedLanguage === lang}
              <Check class="w-4 h-4" />
            {/if}
          </Button>
        </li>
      {/each}
    </ul>
  </div>

  <p class="text-xs text-muted-foreground">
    Changing your language will update how menus, buttons, and other UI text
    appear across the app.
  </p>
</div>
