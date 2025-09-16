<script lang="ts">
  let activeTab = $state<'my_profile' | 'Standing' | 'placeholder2'>('my_profile');
  let displayName = $state('');
  let statusMessage = $state('');
  let userId = $state('user_12345'); // placeholder
</script>

<h1 class="text-xl font-bold mb-4">Account Settings</h1>

<div class="tabs tabs-boxed mb-4">
  <button class="tab relative cursor-pointer mr-4 transition-all duration-200 hover:text-sky-400 hover:scale-105" class:tab-active={activeTab === 'my_profile'} onclick={() => (activeTab = 'my_profile')}>My Profile</button>
  <button class="tab relative cursor-pointer mr-4 transition-all duration-200 hover:text-sky-400 hover:scale-105" class:tab-active={activeTab === 'Standing'} onclick={() => (activeTab = 'Standing')}>Standing</button>
  <button class="tab relative cursor-pointer mr-4 transition-all duration-200 hover:text-sky-400 hover:scale-105" class:tab-active={activeTab === 'placeholder2'} onclick={() => (activeTab = 'placeholder2')}>Placeholder 2</button>
</div>
<div class="h-0.5 bg-muted -mt-4 mb-4"></div>

{#if activeTab === 'my_profile'}
  <div class="space-y-4">
    <div class="p-4 bg-card rounded-md shadow flex items-center space-x-4">
      <div class="w-12 h-12 bg-primary rounded-full flex items-center justify-center text-foreground text-xl font-bold">
        {displayName.charAt(0).toUpperCase() || 'U'}
      </div>
      <div>
        <h3 class="text-lg font-semibold">{displayName || 'Your Display Name'}</h3>
        <p class="text-sm text-muted-foreground">{statusMessage || 'Your status message'}</p>
      </div>
    </div>
    <div>
      <label for="displayName" class="block text-sm font-medium">Display Name</label>
      <input type="text" id="displayName" class="input input-bordered w-full max-w-xs" bind:value={displayName} />
    </div>
    <div>
      <label for="statusMessage" class="block text-sm font-medium">Status Message</label>
      <input type="text" id="statusMessage" class="input input-bordered w-full max-w-xs" bind:value={statusMessage} />
    </div>
    <div>
      <label for="userId" class="block text-sm font-medium">User ID</label>
      <input type="text" id="userId" class="input input-bordered w-full max-w-xs" value={userId} disabled />
    </div>
    <div class="flex justify-end space-x-2">
      <button class="btn btn-error">Delete Account</button>
    </div>
  </div>
{:else if activeTab === 'placeholder1'}
  <h2 class="text-lg font-semibold">Standing Content</h2>
  <p>This is placeholder content for tab 1.</p>
{:else if activeTab === 'placeholder2'}
  <h2 class="text-lg font-semibold">Placeholder 2 Content</h2>
  <p>This is placeholder content for tab 2.</p>
{/if}
