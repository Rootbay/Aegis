<svelte:options runes={true} />

<script lang="ts">
  import { Users, MapPin, UserMinus } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import {
    SidebarContent,
    SidebarGroup,
    SidebarGroupLabel,
    SidebarGroupContent,
    SidebarMenu,
    SidebarMenuItem,
    SidebarMenuButton,
  } from "$lib/components/ui/sidebar";
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from "$lib/components/ui/avatar";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { resolvePresenceStatusLabel } from "$lib/features/presence/statusPresets";
  import type { MemberGroup, MemberWithRoles } from "./groupMembers";
  import type { OpenUserCardModalHandler } from "./types";
  import type { Snippet } from "svelte";

  let {
    members = [],
    groupedMembers = [],
    canInviteMembers = false,
    hasInviteCandidates = false,
    onInviteMembers = () => {},
    canRemoveMember = () => false,
    onRemoveMember = () => {},
    isRemovingMember = () => false,
    openUserCardModal,
    isServerContext = false,
    resolvedServerId = null,
    variant = "desktop",
    userCard,
  } = $props<{
    members?: MemberWithRoles[];
    groupedMembers?: MemberGroup[];
    canInviteMembers?: boolean;
    hasInviteCandidates?: boolean;
    onInviteMembers?: () => void;
    canRemoveMember?: (member: MemberWithRoles) => boolean;
    onRemoveMember?: (member: MemberWithRoles) => void;
    isRemovingMember?: (memberId: string) => boolean;
    openUserCardModal?: OpenUserCardModalHandler;
    isServerContext?: boolean;
    resolvedServerId?: string | null;
    variant?: "desktop" | "mobile";
    userCard?: Snippet<[MemberWithRoles, boolean, string | null, () => void]>;
  }>();

  function openMemberUserCard(
    event: MouseEvent,
    member: MemberWithRoles,
  ) {
    const triggerRect = (
      event.currentTarget as HTMLElement | null
    )?.getBoundingClientRect?.();
    openUserCardModal?.(
      member,
      event.clientX,
      event.clientY,
      Boolean(resolvedServerId),
      {
        preferredSide: "left",
        triggerLeft: triggerRect?.left ?? event.clientX,
      },
    );
  }
</script>

<SidebarContent
  data-mobile={variant === "mobile" ? "" : undefined}
  class="flex"
  data-testid={variant === "desktop" ? "desktop-member-sidebar-content" : "mobile-member-panel-content"}
>
  <div class="flex w-full flex-col">
    {#if canInviteMembers}
      <div class="px-3 pt-4">
        <Button
          class="w-full"
          size="sm"
          variant="outline"
          onclick={onInviteMembers}
          disabled={!hasInviteCandidates}
        >
          <Users class="mr-2 h-3.5 w-3.5" aria-hidden="true" /> Invite members
        </Button>
      </div>
    {/if}

    <ScrollArea class="flex-1">
      {#if members.length === 0}
        <div
          class="flex flex-col items-center gap-3 px-6 py-8 text-center text-sm text-muted-foreground"
        >
          <Users class="size-5" aria-hidden="true" />
          <p>No members in this chat.</p>
        </div>
      {:else}
        <div class="space-y-5 px-2 py-4">
          {#each groupedMembers as group (group.id)}
            <SidebarGroup class="space-y-2">
              <SidebarGroupLabel>
                <div class="flex min-w-0 items-center gap-2">
                  {#if group.color}
                    <span
                      class="h-2 w-2 shrink-0 rounded-full border border-border"
                      style={`background-color: ${group.color}`}
                      aria-hidden="true"
                    ></span>
                  {/if}
                  <span class="truncate text-foreground">{group.label}</span>
                </div>
                <span class="text-xs font-semibold text-muted-foreground"
                  >{group.members.length}</span
                >
              </SidebarGroupLabel>
              <SidebarGroupContent class="space-y-1">
                <SidebarMenu class="space-y-1">
                  {#each group.members as member (member.id)}
                    <SidebarMenuItem data-testid="member-list-item">
                      <div class="flex items-center gap-1">
                        <Popover.Root>
                          <Popover.Trigger class="flex-1">
                            <SidebarMenuButton
                              class="flex w-full items-center gap-3"
                              onclick={(event) => openMemberUserCard(event, member)}
                              ondblclick={(event) =>
                                openMemberUserCard(event, member)
                              }
                            >
                              {@const label = resolvePresenceStatusLabel(member.statusMessage)}

                              <div class="relative">
                                <Avatar class="size-8">
                                  <AvatarImage src={member.avatar} alt={member.name} />
                                  <AvatarFallback>
                                    {(member.name || "?").slice(0, 2).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                {#if member.online}
                                  <span
                                    class="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background bg-emerald-500"
                                  ></span>
                                {/if}
                              </div>

                              <div class="min-w-0">
                                <p class="truncate text-sm font-medium text-foreground">
                                  {member.name}
                                </p>

                                {#if label}
                                  <p
                                    class="truncate text-xs text-muted-foreground"
                                    title={label}
                                  >
                                    {label}
                                  </p>
                                {/if}

                                {#if member.location}
                                  <p
                                    class="flex items-center gap-1 text-xs text-muted-foreground"
                                    title={member.location}
                                  >
                                    <MapPin class="h-3 w-3" />
                                    <span class="truncate">{member.location}</span>
                                  </p>
                                {/if}
                              </div>
                            </SidebarMenuButton>
                          </Popover.Trigger>
                          <Popover.Content
                            side="left"
                            align="start"
                            class="w-auto border-none p-0"
                          >
                            {#if userCard}
                              {@render userCard(member, isServerContext, resolvedServerId, close)}
                            {/if}
                          </Popover.Content>
                        </Popover.Root>
                        {#if typeof member.id === "string" && canRemoveMember(member)}
                          <Button
                            variant="ghost"
                            size="icon"
                            class="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                            aria-label={`Remove ${member.name ?? "member"} from group`}
                            onclick={() => onRemoveMember(member)}
                            disabled={isRemovingMember(member.id)}
                          >
                            <UserMinus class="h-4 w-4" aria-hidden="true" />
                          </Button>
                        {/if}
                      </div>
                    </SidebarMenuItem>
                  {/each}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          {/each}
        </div>
      {/if}
    </ScrollArea>
  </div>
</SidebarContent>

<style>
  :global([data-mobile]) {
    @apply max-h-[min(70vh,30rem)];
  }
</style>
