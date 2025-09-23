<script lang="ts">
  import type { Server } from "$lib/features/servers/models/Server";

  import Overview from "../server-settings/Overview.svelte";
  import Moderation from "../server-settings/Moderation.svelte";
  import Privacy from "../server-settings/Privacy.svelte";
  import Roles from "../server-settings/Roles.svelte";
  import UserManagement from "../server-settings/UserManagement.svelte";

  type UnaryHandler<T> = (_value: T) => void; // eslint-disable-line no-unused-vars

  type ServerSettingsModalProps = {
    show?: boolean;
    server: Server | null;
    onClose: () => void;
    onupdateServer?: UnaryHandler<Server>;
  };

  let {
    show = $bindable(false),
    server,
    onClose,
    onupdateServer,
  }: ServerSettingsModalProps = $props();

  let activeTab = $state<
    | "overview"
    | "moderation"
    | "privacy"
    | "roles"
    | "user_management"
    | "delete"
  >("overview");

  function close() {
    show = false;
    onClose();
  }
</script>

{#if show && server}
  <div
    class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[10002]"
  >
    <div
      class="bg-zinc-900 text-white rounded-lg shadow-2xl w-full max-w-4xl h-[80vh] flex"
    >
      <aside class="w-64 bg-card p-4 rounded-l-lg flex flex-col">
        <h2 class="text-lg font-bold mb-6">{server.name} Settings</h2>
        <div class="flex-grow overflow-y-auto custom-scrollbar pr-2">
          <nav class="space-y-2">
            <button
              class="w-full text-left px-3 py-2 rounded {activeTab ===
              'overview'
                ? 'bg-indigo-600'
                : 'hover:bg-zinc-700'}"
              onclick={() => (activeTab = "overview")}>Overview</button
            >
            <button
              class="w-full text-left px-3 py-2 rounded {activeTab ===
              'moderation'
                ? 'bg-indigo-600'
                : 'hover:bg-zinc-700'}"
              onclick={() => (activeTab = "moderation")}>Moderation</button
            >
            <button
              class="w-full text-left px-3 py-2 rounded {activeTab === 'privacy'
                ? 'bg-indigo-600'
                : 'hover:bg-zinc-700'}"
              onclick={() => (activeTab = "privacy")}>Privacy</button
            >
            <button
              class="w-full text-left px-3 py-2 rounded {activeTab === 'roles'
                ? 'bg-indigo-600'
                : 'hover:bg-zinc-700'}"
              onclick={() => (activeTab = "roles")}>Roles</button
            >
            <button
              class="w-full text-left px-3 py-2 rounded {activeTab ===
              'user_management'
                ? 'bg-indigo-600'
                : 'hover:bg-zinc-700'}"
              onclick={() => (activeTab = "user_management")}
              >User Management</button
            >
            <div class="border-t border-zinc-700 my-2"></div>
            <button
              class="w-full text-left px-3 py-2 rounded text-red-400 hover:bg-red-600 hover:text-white {activeTab ===
              'delete'
                ? 'bg-red-600 text-white'
                : ''}"
              onclick={() => (activeTab = "delete")}>Delete Server</button
            >
          </nav>
        </div>
        <div class="mt-auto">
          <button
            class="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded"
            onclick={close}
          >
            Close
          </button>
        </div>
      </aside>

      <main class="flex-1 p-8 overflow-y-auto">
        {#if activeTab === "overview"}
          <Overview server={server!} {onupdateServer} />
        {:else if activeTab === "moderation"}
          <Moderation server={server!} {onupdateServer} />
        {:else if activeTab === "privacy"}
          <Privacy server={server!} {onupdateServer} />
        {:else if activeTab === "roles"}
          <Roles />
        {:else if activeTab === "user_management"}
          <UserManagement />
        {/if}
      </main>
    </div>
  </div>
{/if}

<style lang="postcss">
  .custom-scrollbar::-webkit-scrollbar {
    width: 8px;
  }

  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }

  .custom-scrollbar::-webkit-scrollbar-thumb {
    background-color: transparent;
    border-radius: 4px;
    border: 2px solid transparent;
  }

  .custom-scrollbar:hover::-webkit-scrollbar-thumb {
    background-color: theme("colors.zinc.700");
  }

  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background-color: theme("colors.zinc.600");
  }
</style>
