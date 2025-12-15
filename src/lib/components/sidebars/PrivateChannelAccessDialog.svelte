<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Badge } from "$lib/components/ui/badge";
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from "$lib/components/ui/dialog/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Check } from "@lucide/svelte";
  import type { Server } from "$lib/features/servers/models/Server";
  import type { Role } from "$lib/features/servers/models/Role";

  let {
    open = false,
    searchTerm = $bindable(""),
    submitDisabled = false,
    submitLabel = "Create Channel",
    onSearchKeydown = (event: KeyboardEvent) => {},
    selectedRoleIds = [],
    selectedMemberIds = [],
    rolesById = new Map<string, Role>(),
    membersById = new Map<string, Server["members"][number]>(),
    filteredRoles = [],
    filteredMembers = [],
    toggleRoleSelection = (roleId: string) => {},
    toggleMemberSelection = (memberId: string) => {},
    close = () => {},
    onSubmit = () => {},
  } = $props<{
    open?: boolean;
    searchTerm?: string;
    submitDisabled?: boolean;
    submitLabel?: string;
    onSearchKeydown?: (event: KeyboardEvent) => void;
    selectedRoleIds?: string[];
    selectedMemberIds?: string[];
    rolesById?: Map<string, Role>;
    membersById?: Map<string, Server["members"][number]>;
    filteredRoles?: Role[];
    filteredMembers?: Server["members"][number][];
    toggleRoleSelection?: (roleId: string) => void;
    toggleMemberSelection?: (memberId: string) => void;
    close?: () => void;
    onSubmit?: () => void;
  }>();

  const selectedRoleSet = $derived(new Set(selectedRoleIds));
  const selectedMemberSet = $derived(new Set(selectedMemberIds));
</script>

<Dialog
  open={open}
  onOpenChange={(value: boolean) => {
    if (!value) {
      close();
    }
  }}
>
  <DialogContent data-testid="private-channel-access-dialog">
    <DialogHeader>
      <DialogTitle>Add members or roles</DialogTitle>
      <DialogDescription>
        Search for members by typing @ followed by their name, or type a role to add it to
        the list below.
      </DialogDescription>
    </DialogHeader>
    <div class="space-y-4">
      <Input
        placeholder="Type @member or role name"
        bind:value={searchTerm}
        onkeydown={onSearchKeydown}
        class="w-full"
      />
      {#if selectedRoleIds.length > 0 || selectedMemberIds.length > 0}
        <div class="flex flex-wrap gap-2">
          {#each selectedRoleIds as roleId (roleId)}
            {@const role = rolesById.get(roleId)}
            {#if role}
              <Badge variant="secondary">{role.name}</Badge>
            {/if}
          {/each}
          {#each selectedMemberIds as memberId (memberId)}
            {@const member = membersById.get(memberId)}
            {#if member}
              <Badge variant="secondary">{member.name}</Badge>
            {/if}
          {/each}
        </div>
      {/if}
      <div class="space-y-4">
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold uppercase text-muted-foreground">Roles</span>
            <span class="text-xs text-muted-foreground">
              {filteredRoles.length} available
            </span>
          </div>
          <div class="grid gap-2 max-h-56 overflow-y-auto pb-1">
            {#if filteredRoles.length === 0}
              <p class="text-xs text-muted-foreground">No roles found.</p>
            {:else}
              {#each filteredRoles as role (role.id)}
                <button
                  type="button"
                  class={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition ${
                    selectedRoleSet.has(role.id)
                      ? "border-primary/80 bg-primary/10 text-primary"
                      : "border-border bg-background text-foreground hover:border-primary/60 hover:bg-muted/40"
                  }`}
                  onclick={() => toggleRoleSelection(role.id)}
                >
                  <span class="truncate">{role.name}</span>
                  {#if selectedRoleSet.has(role.id)}
                    <Check size={14} />
                  {/if}
                </button>
              {/each}
            {/if}
          </div>
        </div>
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold uppercase text-muted-foreground">Members</span>
            <span class="text-xs text-muted-foreground">
              {filteredMembers.length} available
            </span>
          </div>
          <div class="grid gap-2 max-h-56 overflow-y-auto pb-1">
            {#if filteredMembers.length === 0}
              <p class="text-xs text-muted-foreground">No members found.</p>
            {:else}
              {#each filteredMembers as member (member.id)}
                <button
                  type="button"
                  class={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition ${
                    selectedMemberSet.has(member.id)
                      ? "border-primary/80 bg-primary/10 text-primary"
                      : "border-border bg-background text-foreground hover:border-primary/60 hover:bg-muted/40"
                  }`}
                  onclick={() => toggleMemberSelection(member.id)}
                >
                  <span class="truncate">{member.name}</span>
                  {#if selectedMemberSet.has(member.id)}
                    <Check size={14} />
                  {/if}
                </button>
              {/each}
            {/if}
          </div>
        </div>
      </div>
    </div>
    <DialogFooter>
      <Button variant="ghost" onclick={close}>Back</Button>
      <Button onclick={onSubmit} disabled={submitDisabled}>
        {submitLabel}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
