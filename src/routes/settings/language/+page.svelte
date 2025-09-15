<script lang="ts">
  let selectedLanguage: string = 'English';
  const languages = ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Japanese', 'Chinese'];
</script>

<h2 class="text-xl font-bold mb-4">Language Settings</h2>

<div class="space-y-4">
  <h3 class="text-lg font-semibold">Select your preferred language:</h3>
  <ul class="bg-card rounded-lg p-2">
    {#each languages as lang (lang)}
      <li>
        <button
          class="w-full text-left px-3 py-2 rounded-md transition-colors duration-200
          {selectedLanguage === lang ? 'bg-primary text-foreground' : 'hover:bg-muted'}"
          onclick={() => (selectedLanguage = lang)}
        >
          {lang}
        </button>
      </li>
    {/each}
  </ul>
  
</div>
