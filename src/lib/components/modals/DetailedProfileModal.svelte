<svelte:options runes={true} />

<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import UserOptionsMenu from "$lib/components/context-menus/UserOptionsMenu.svelte";
  import ImageLightbox from "$lib/components/media/ImageLightbox.svelte";
  import { userStore } from "$lib/stores/userStore";
  import { friendStore } from "$lib/features/friends/stores/friendStore";
  import { mutedFriendsStore } from "$lib/features/friends/stores/mutedFriendsStore";
  import { ignoredUsersStore } from "$lib/features/friends/stores/ignoredUsersStore";
  import { userNotesStore } from "$lib/features/friends/stores/userNotesStore";
  import { serverStore } from "$lib/features/servers/stores/serverStore";
  import { chatStore } from "$lib/features/chat/stores/chatStore";
  import { toasts } from "$lib/stores/ToastStore";
  import type { Server } from "$lib/features/servers/models/Server";
  import type { User } from "$lib/features/auth/models/User";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { getContext, onDestroy } from "svelte";
  import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
  } from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Textarea } from "$lib/components/ui/textarea";
  import {
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
  } from "$lib/components/ui/tabs";
  import {
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
  } from "$lib/components/ui/select";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { Badge } from "$lib/components/ui/badge";
  import {
    X,
    Star,
    CircleCheck,
    Plus,
    SendHorizontal,
    Trash,
    Ellipsis,
    MapPin,
  } from "@lucide/svelte";
  import { CREATE_GROUP_CONTEXT_KEY } from "$lib/contextKeys";
  import type { CreateGroupContext } from "$lib/contextTypes";
  import {
    buildGroupModalOptions,
    buildReportUserPayload,
  } from "$lib/features/chat/utils/contextMenu";
  import { resolvePresenceStatusLabel } from "$lib/features/presence/statusPresets";

  type MutualGroup = {
    serverId: string;
    serverName: string;
    channelId: string;
    channelName: string;
  };
  type UserOptionsEvent = { action: string };

  type SendServerInviteResult = {
    server_id: string;
    user_id: string;
    already_member: boolean;
  };

  type Props = {
    profileUser: User;
    mutualFriends: User[];
    mutualServers: Server[];
    mutualGroups: MutualGroup[];
    close: () => void;
    isFriend?: boolean;
    isMyProfile?: boolean;
  };

  let {
    profileUser,
    mutualFriends: mutualFriendsProp = [],
    mutualServers: mutualServersProp = [],
    mutualGroups: mutualGroupsProp = [],
    close,
    isFriend = false,
    isMyProfile: isMyProfileProp,
  }: Props = $props();

  let mutualFriends = $state<User[]>(mutualFriendsProp);
  let mutualServers = $state<Server[]>(mutualServersProp);
  let mutualGroups = $state<MutualGroup[]>(mutualGroupsProp);

  const isMyProfile = $derived(
    isMyProfileProp ?? profileUser?.id === $userStore.me?.id,
  );

  $effect(() => {
    mutualFriends = mutualFriendsProp ?? [];
    mutualServers = mutualServersProp ?? [];
    mutualGroups = mutualGroupsProp ?? [];
  });

  let selectedTab = $state<"friends" | "servers" | "groups">("friends");

  let showLightbox = $state(false);
  let lightboxImageUrl = $state("");
  let copyFeedback = $state("");
  let copyTimeout: ReturnType<typeof setTimeout> | undefined;
  let notePersistTimeout: ReturnType<typeof setTimeout> | undefined;
  let noteFeedbackTimeout: ReturnType<typeof setTimeout> | undefined;

  let notes = $state<Record<string, string>>({});
  let noteDraft = $state("");
  let noteFeedback = $state("");
  let notesReady = $state(false);

  const NOTE_SAVE_THROTTLE_MS = 500;
  const SAVE_FEEDBACK_DURATION_MS = 2000;
  const profileStatusLabel = $derived(resolvePresenceStatusLabel(profileUser.statusMessage));

  $effect(() => {
    if (!notesReady) {
      return;
    }

    const id = profileUser?.id;
    if (!id) {
      noteDraft = "";
      return;
    }

    const persisted = notes[id] ?? "";
    if (persisted !== noteDraft) {
      noteDraft = persisted;
    }
  });

  $effect(() => {
    if (!notesReady) {
      return;
    }

    const id = profileUser?.id;
    if (!id) {
      return;
    }

    if ((notes[id] ?? "") === noteDraft) {
      return;
    }

    if (notePersistTimeout) {
      clearTimeout(notePersistTimeout);
      notePersistTimeout = undefined;
    }

    const draftToPersist = noteDraft;
    notePersistTimeout = setTimeout(() => {
      notePersistTimeout = undefined;
      userNotesStore.setNote(id, draftToPersist);

      if (draftToPersist.trim().length === 0) {
        noteFeedback = "";
        if (noteFeedbackTimeout) {
          clearTimeout(noteFeedbackTimeout);
          noteFeedbackTimeout = undefined;
        }
        return;
      }

      noteFeedback = "Saved";
      if (noteFeedbackTimeout) {
        clearTimeout(noteFeedbackTimeout);
      }
      noteFeedbackTimeout = setTimeout(() => {
        noteFeedback = "";
        noteFeedbackTimeout = undefined;
      }, SAVE_FEEDBACK_DURATION_MS);
    }, NOTE_SAVE_THROTTLE_MS);
  });

  let showUserOptionsMenu = $state(false);
  let userOptionsMenuX = $state(0);
  let userOptionsMenuY = $state(0);

  let loadingMutualServers = $state(false);
  let loadingMutualFriends = $state(false);
  let loadingMutualGroups = $state(false);

  let showInvitePicker = $state(isFriend);
  let selectedServerId = $state<string | undefined>(undefined);
  let servers = $derived<Server[]>($serverStore.servers ?? []);
  let sendingInvite = $state(false);

  let ignoredUsers = $state<Set<string>>(new Set());
  const isIgnored = $derived.by(() => {
    const id = profileUser?.id;
    if (!id) {
      return false;
    }
    return ignoredUsers.has(id);
  });

  const unsubscribeIgnoredUsers = ignoredUsersStore.subscribe((ids) => {
    ignoredUsers = ids;
  });

  $effect(() => {
    if (!profileUser?.id) {
      return;
    }
    const nextIgnored = isIgnored;
    if (profileUser.isIgnored !== nextIgnored) {
      profileUser = { ...profileUser, isIgnored: nextIgnored };
    }
  });

  const createGroupContext = getContext<CreateGroupContext | undefined>(
    CREATE_GROUP_CONTEXT_KEY,
  );
  const openCreateGroupModal = createGroupContext?.openCreateGroupModal;
  const openReportUserModal = createGroupContext?.openReportUserModal;
  const openProfileReviewsModal = createGroupContext?.openProfileReviewsModal;
  const getCurrentChat = () => createGroupContext?.currentChat ?? null;

  const unsubscribeNotes = userNotesStore.subscribe((value) => {
    notes = value;
    notesReady = true;
  });

  onDestroy(() => {
    unsubscribeNotes();
    unsubscribeIgnoredUsers();
    if (notePersistTimeout) {
      clearTimeout(notePersistTimeout);
      notePersistTimeout = undefined;
    }
    if (noteFeedbackTimeout) {
      clearTimeout(noteFeedbackTimeout);
      noteFeedbackTimeout = undefined;
    }
  });

  function viewProfileReviews() {
    if (!profileUser?.id) {
      return;
    }
    if (!openProfileReviewsModal) {
      console.warn("Review modal handler is unavailable");
      return;
    }
    openProfileReviewsModal({
      subjectType: "user",
      subjectId: profileUser.id,
      subjectName: profileUser.name,
      subjectAvatarUrl: profileUser.avatar,
    });
  }

  async function computeMutualServers() {
    if (!profileUser?.id) {
      mutualServers = [];
      return;
    }
    loadingMutualServers = true;
    try {
      const servers = $serverStore.servers || [];
      for (const s of servers) {
        if (!s.members || s.members.length === 0) {
          await serverStore.fetchServerDetails(s.id);
        }
      }
      mutualServers = ($serverStore.servers || []).filter((s) =>
        (s.members || []).some((m) => m.id === profileUser.id),
      );
    } catch (e) {
      console.error("Failed to compute mutual servers:", e);
    } finally {
      loadingMutualServers = false;
    }
  }

  async function computeMutualGroups() {
    if (!profileUser?.id) {
      mutualGroups = [];
      return;
    }
    loadingMutualGroups = true;
    try {
      const servers = $serverStore.servers || [];
      for (const s of servers) {
        if (
          !s.channels ||
          s.channels.length === 0 ||
          !s.members ||
          s.members.length === 0
        ) {
          await serverStore.fetchServerDetails(s.id);
        }
      }
      const sharedServers = ($serverStore.servers || []).filter((s) =>
        (s.members || []).some((m) => m.id === profileUser.id),
      );
      const groups: MutualGroup[] = [];
      for (const s of sharedServers) {
        for (const ch of s.channels || []) {
          if (ch.private) {
            groups.push({
              serverId: s.id,
              serverName: s.name,
              channelId: ch.id,
              channelName: ch.name,
            });
          }
        }
      }
      mutualGroups = groups;
    } catch (e) {
      console.error("Failed to compute mutual groups:", e);
      mutualGroups = [];
    } finally {
      loadingMutualGroups = false;
    }
  }

  async function computeMutualFriends() {
    const meId = $userStore.me?.id;
    const otherId = profileUser?.id;
    mutualFriends = [];
    if (!meId || !otherId) return;
    loadingMutualFriends = true;
    try {
      const myFriendships: any[] = await invoke("get_friendships", {
        current_user_id: meId,
      });
      const otherFriendIds = await invoke<string[]>(
        "get_friendships_for_user",
        {
          current_user_id: meId,
          target_user_id: otherId,
        },
      );
      const myFriendIds = new Set(
        (myFriendships || []).map((f: any) =>
          f.user_a_id === meId ? f.user_b_id : f.user_a_id,
        ),
      );
      const mutualIds: string[] = (otherFriendIds || []).filter((id) =>
        myFriendIds.has(id),
      );
      const users = await Promise.all(
        mutualIds.map((id) => userStore.getUser(id)),
      );
      mutualFriends = users.filter(Boolean) as User[];
    } catch (e) {
      console.error("Failed to compute mutual friends:", e);
      mutualFriends = [];
    } finally {
      loadingMutualFriends = false;
    }
  }

  $effect(() => {
    if (profileUser?.id) {
      computeMutualServers();
      computeMutualFriends();
      computeMutualGroups();
    }
  });

  $effect(() => {
    void $serverStore.servers;
    if (profileUser?.id) {
      computeMutualServers();
      computeMutualGroups();
    }
  });

  $effect(() => {
    if (showInvitePicker && !selectedServerId && servers.length > 0) {
      selectedServerId = servers[0].id;
    }
  });

  function openLightbox(imageUrl: string) {
    lightboxImageUrl = imageUrl;
    showLightbox = true;
  }

  async function editProfile() {
    try {
      await goto(resolve("/settings/account"));
      close();
    } catch (e) {
      console.error("Failed to navigate to profile settings:", e);
      toasts.addToast("Failed to open profile settings.", "error");
    }
  }

  async function addFriend() {
    if (!profileUser?.id || !$userStore.me?.id) return;
    try {
      await invoke("send_friend_request", {
        current_user_id: $userStore.me.id,
        target_user_id: profileUser.id,
      });
      toasts.addToast("Friend request sent!", "success");
    } catch (error: any) {
      console.error("Failed to send friend request:", error);
      toasts.addToast(
        error?.message || "Failed to send friend request.",
        "error",
      );
    }
  }

  async function removeFriend() {
    try {
      const meId = $userStore.me?.id;
      if (!meId || !profileUser?.id) return;
      const friendships: any[] = await invoke("get_friendships", {
        current_user_id: meId,
      });
      const fs = friendships.find(
        (f: any) =>
          (f.user_a_id === meId && f.user_b_id === profileUser.id) ||
          (f.user_b_id === meId && f.user_a_id === profileUser.id),
      );
      if (!fs) {
        toasts.addToast("Friendship not found.", "error");
        return;
      }
      await invoke("remove_friendship", { friendship_id: fs.id });
      friendStore.removeFriend(profileUser.id);
      toasts.addToast("Friend removed.", "success");
      await friendStore.initialize();
    } catch (error: any) {
      console.error("Failed to remove friend:", error);
      toasts.addToast(error?.message || "Failed to remove friend.", "error");
    }
  }

  async function sendMessage() {
    try {
      if (!profileUser?.id) return;
      if (isIgnored) {
        toasts.addToast("You have ignored this user.", "info");
        return;
      }
      await chatStore.setActiveChat(profileUser.id, "dm");
      close();
    } catch (e) {
      console.error("Failed to open DM:", e);
      toasts.addToast("Failed to open direct messages.", "error");
    }
  }

  function handleMoreOptions(event: MouseEvent) {
    event.preventDefault();
    userOptionsMenuX = event.clientX;
    userOptionsMenuY = event.clientY;
    showUserOptionsMenu = true;
  }

  async function handleUserOptionAction(
    payload: CustomEvent<UserOptionsEvent> | UserOptionsEvent,
  ) {
    const detail = "detail" in payload ? payload.detail : payload;
    const action = detail?.action as string | undefined;
    if (!action) {
      console.warn("Missing user option action payload", payload);
      return;
    }
    try {
      switch (action) {
        case "copy_user_id":
          if (profileUser?.id && navigator.clipboard) {
            await navigator.clipboard.writeText(profileUser.id);
            toasts.addToast("User ID copied.", "success");
          }
          break;
        case "block": {
          const meId = $userStore.me?.id;
          if (meId && profileUser?.id) {
            await invoke("block_user", {
              current_user_id: meId,
              target_user_id: profileUser.id,
            });
            toasts.addToast("User blocked.", "success");
            mutedFriendsStore.unmute(profileUser.id);
            await friendStore.initialize();
          }
          break;
        }
        case "mute_user": {
          const meId = $userStore.me?.id;
          if (!meId || !profileUser?.id) {
            toasts.addToast("You must be signed in to mute users.", "error");
            break;
          }
          const currentlyMuted = mutedFriendsStore.isMuted(profileUser.id);
          await invoke("mute_user", {
            current_user_id: meId,
            target_user_id: profileUser.id,
            muted: !currentlyMuted,
            spam_score: null,
          });
          if (currentlyMuted) {
            mutedFriendsStore.unmute(profileUser.id);
            toasts.addToast("User unmuted.", "success");
          } else {
            mutedFriendsStore.mute(profileUser.id);
            toasts.addToast("User muted.", "success");
          }
          break;
        }
        case "ignore": {
          const meId = $userStore.me?.id;
          if (!meId || !profileUser?.id) {
            toasts.addToast(
              "You must be signed in to update ignore status.",
              "error",
            );
            break;
          }

          const currentlyIgnored = ignoredUsersStore.isIgnored(profileUser.id);

          await invoke("ignore_user", {
            current_user_id: meId,
            target_user_id: profileUser.id,
            ignored: !currentlyIgnored,
          });

          if (currentlyIgnored) {
            ignoredUsersStore.unignore(profileUser.id);
            profileUser = { ...profileUser, isIgnored: false };
            toasts.addToast("User unignored.", "success");
          } else {
            ignoredUsersStore.ignore(profileUser.id);
            profileUser = { ...profileUser, isIgnored: true };
            toasts.addToast("User ignored.", "success");
          }
          break;
        }
        case "invite_to_server":
          openInvitePicker();
          break;
        case "view_reviews":
          viewProfileReviews();
          break;
        case "add_to_group":
          if (openCreateGroupModal && profileUser) {
            openCreateGroupModal(buildGroupModalOptions(profileUser));
          } else {
            toasts.addToast(
              "Group creation is unavailable right now.",
              "error",
            );
          }
          break;
        case "report":
          if (openReportUserModal && profileUser) {
            openReportUserModal(
              buildReportUserPayload(getCurrentChat(), profileUser),
            );
          } else {
            toasts.addToast(
              "Unable to open the report flow at this time.",
              "error",
            );
          }
          break;
        default:
          console.log("Unhandled action:", action);
      }
    } catch (e: any) {
      console.error("User option failed:", action, e);
      toasts.addToast(e?.message || "Action failed.", "error");
    } finally {
      showUserOptionsMenu = false;
    }
  }

  async function copyUserId() {
    if (!profileUser?.id) return;
    if (!navigator?.clipboard) {
      toasts.addToast("Clipboard not available in this environment.", "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(profileUser.id);
      copyFeedback = "Copied!";
      if (copyTimeout) {
        clearTimeout(copyTimeout);
      }
      copyTimeout = setTimeout(() => {
        copyFeedback = "";
        copyTimeout = undefined;
      }, 2000);
    } catch (error) {
      console.error("Failed to copy user ID:", error);
      toasts.addToast("Failed to copy user ID.", "error");
    }
  }

  function openInvitePicker() {
    const firstServer = $serverStore.servers?.[0];
    selectedServerId = firstServer?.id;
    showInvitePicker = true;
  }

  async function sendServerInvite() {
    if (!selectedServerId || !profileUser?.id) return;
    sendingInvite = true;
    try {
      const result = await invoke<SendServerInviteResult>(
        "send_server_invite",
        {
          server_id: selectedServerId,
          user_id: profileUser.id,
        },
      );
      if (!result.already_member) {
        await serverStore.fetchServerDetails(result.server_id);
      }
      const message = result.already_member
        ? "User is already a member of the server."
        : "Invite sent.";
      const tone = result.already_member ? "info" : "success";
      toasts.addToast(message, tone);
    } catch (e: any) {
      console.error("Failed to send server invite:", e);
      toasts.addToast(e?.message || "Failed to send server invite.", "error");
    } finally {
      sendingInvite = false;
      showInvitePicker = false;
      selectedServerId = undefined;
    }
  }

  async function handleInvite() {
    if (sendingInvite) return;
    await sendServerInvite();
  }

  onDestroy(() => {
    if (copyTimeout) {
      clearTimeout(copyTimeout);
      copyTimeout = undefined;
    }
  });
</script>

<Dialog open onOpenChange={close}>
  <DialogContent class="max-w-5xl p-0 overflow-hidden">
    <div class="flex">
      <div class="w-[380px] bg-card flex flex-col">
        <div
          class="relative h-36 bg-muted bg-cover bg-center cursor-pointer"
          style={`background-image:url(${profileUser.bannerUrl || ""})`}
          role="button"
          tabindex={profileUser.bannerUrl ? 0 : -1}
          onclick={(event) => {
            if (
              event.target instanceof HTMLElement &&
              event.target.closest("button")
            ) {
              return;
            }
            if (profileUser.bannerUrl) {
              openLightbox(profileUser.bannerUrl);
            }
          }}
          onkeydown={(event) => {
            if (!profileUser.bannerUrl) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openLightbox(profileUser.bannerUrl);
            }
          }}
          aria-label="View banner image"
        >
          <Button
            variant="ghost"
            size="icon"
            class="absolute top-2 right-2 rounded-full"
            onclick={close}
            aria-label="Close"><X class="h-4 w-4" /></Button
          >

          <div
            class="absolute top-20 left-6 border-4 border-background rounded-full bg-card"
          >
            <button
              type="button"
              class="p-0 m-0 border-none bg-transparent cursor-pointer rounded-full focus:outline-none focus:ring-2 focus:ring-primary"
              onclick={() =>
                profileUser.avatar && openLightbox(profileUser.avatar)}
              aria-label={`View ${profileUser.name || "user"}'s avatar`}
            >
              <img
                src={profileUser.avatar}
                alt={profileUser.name || "User avatar"}
                class="w-20 h-20 rounded-full object-cover"
              />
            </button>
            <div
              class="absolute bottom-0 right-0 w-5 h-5 rounded-full border-2 border-white
              {profileUser.online ? 'bg-green-500' : 'bg-zinc-500'}"
            ></div>
          </div>
        </div>

        <div class="px-6 py-8">
          <h2 class="text-xl font-bold">{profileUser.name}</h2>
          <div
            class="flex items-center gap-2 text-sm text-muted-foreground mb-2"
          >
            <span>{profileUser.tag || `@${profileUser.name}`}</span>
            <Button
              variant="ghost"
              size="sm"
              class="h-6 px-2"
              onclick={copyUserId}
            >
              Copy ID
            </Button>
            {#if copyFeedback}
              <span class="text-xs text-emerald-500">{copyFeedback}</span>
            {/if}
          </div>

          <div class="flex items-center gap-2 mb-4">
            <div class="flex items-center gap-1 text-yellow-400">
              <Star class="h-4 w-4" />
              <CircleCheck class="h-4 w-4 text-green-500" />
            </div>
            <Button variant="outline" size="sm" onclick={viewProfileReviews}>
              <Star class="mr-2 h-4 w-4" /> View reviews
            </Button>
          </div>

          <div class="flex gap-2 mb-4">
            {#if isMyProfile}
              <Button onclick={editProfile}
                ><Plus class="mr-2 h-4 w-4" /> Edit Profile</Button
              >
            {:else if isFriend}
              <Button onclick={sendMessage} disabled={isIgnored}
                ><SendHorizontal class="mr-2 h-4 w-4" /> Message</Button
              >
              <Button variant="destructive" size="icon" onclick={removeFriend}
                ><Trash class="h-4 w-4" /></Button
              >
            {:else}
              <Button onclick={addFriend} disabled={isIgnored}
                ><Plus class="mr-2 h-4 w-4" /> Add Friend</Button
              >
              <Button onclick={sendMessage} disabled={isIgnored}
                ><SendHorizontal class="mr-2 h-4 w-4" /> Message</Button
              >
            {/if}
            <Button
              variant="ghost"
              size="icon"
              aria-label="More options"
              onclick={handleMoreOptions}><Ellipsis class="h-4 w-4" /></Button
            >
          </div>

          <div class="flex flex-wrap gap-2 mb-4">
            {#if isIgnored}
              <Badge variant="destructive">Ignored</Badge>
            {/if}
            <Badge variant="secondary">Member since 2021</Badge>
            <Badge variant="outline">Premium</Badge>
          </div>

          <p class="text-sm text-muted-foreground whitespace-pre-wrap">
            {profileUser.bio ?? ""}
          </p>

          {#if profileStatusLabel}
            <p class="text-sm text-muted-foreground mt-2">{profileStatusLabel}</p>
          {/if}

          {#if profileUser.location}
            <p
              class="text-sm text-muted-foreground mt-2 flex items-center gap-2"
            >
              <MapPin class="h-4 w-4" />
              <span>{profileUser.location}</span>
            </p>
          {/if}

          <div class="mt-6">
            <div class="flex items-center justify-between mb-2">
              <h3 class="text-xs uppercase font-semibold text-muted-foreground">
                Note
              </h3>
              {#if noteFeedback}
                <span class="text-xs text-muted-foreground">{noteFeedback}</span
                >
              {/if}
            </div>
            <Textarea
              placeholder="Add a private note about this user..."
              rows={3}
              bind:value={noteDraft}
            />
          </div>
        </div>
      </div>

      <div class="flex-1 p-6">
        <Tabs
          value={selectedTab}
          onValueChange={(v) => (selectedTab = v as any)}
        >
          <TabsList>
            <TabsTrigger value="friends">Mutual Friends</TabsTrigger>
            <TabsTrigger value="servers">Mutual Servers</TabsTrigger>
            <TabsTrigger value="groups">Mutual Groups</TabsTrigger>
          </TabsList>

          <TabsContent value="friends">
            {#if loadingMutualFriends}
              <p class="text-sm text-muted-foreground">
                Loading mutual friends...
              </p>
            {:else if mutualFriends.length === 0}
              <p class="text-sm text-muted-foreground">No mutual friends.</p>
            {:else}
              <ScrollArea class="h-64">
                <ul class="space-y-2">
                  {#each mutualFriends as f (f.id)}
                    <li class="flex items-center gap-2">
                      <img
                        src={f.avatar}
                        class="w-6 h-6 rounded-full"
                        alt={f.name}
                      />
                      <span class="text-sm">{f.name}</span>
                      <Badge variant="outline">Friend</Badge>
                    </li>
                  {/each}
                </ul>
              </ScrollArea>
            {/if}
          </TabsContent>

          <TabsContent value="servers">
            {#if loadingMutualServers}
              <p class="text-sm text-muted-foreground">
                Loading mutual servers...
              </p>
            {:else if mutualServers.length === 0}
              <p class="text-sm text-muted-foreground">No mutual servers.</p>
            {:else}
              <ScrollArea class="h-64">
                <ul class="space-y-2">
                  {#each mutualServers as s (s.id)}
                    <li class="flex items-center gap-2">
                      <span class="inline-block w-2 h-2 rounded-full bg-primary"
                      ></span>
                      <span class="text-sm">{s.name}</span>
                      <Badge variant="secondary">Server</Badge>
                    </li>
                  {/each}
                </ul>
              </ScrollArea>
            {/if}
          </TabsContent>

          <TabsContent value="groups">
            {#if loadingMutualGroups}
              <p class="text-sm text-muted-foreground">
                Loading mutual groups...
              </p>
            {:else if mutualGroups.length === 0}
              <p class="text-sm text-muted-foreground">No mutual groups.</p>
            {:else}
              <ScrollArea class="h-64">
                <ul class="space-y-2">
                  {#each mutualGroups as g (g.channelId)}
                    <li class="flex items-center gap-2">
                      <span
                        class="inline-block w-2 h-2 rounded-full bg-zinc-500"
                      ></span>
                      <span class="text-sm">
                        {g.serverName} - #{g.channelName}
                      </span>
                      <Badge variant="outline">Group</Badge>
                    </li>
                  {/each}
                </ul>
              </ScrollArea>
            {/if}
          </TabsContent>
        </Tabs>
        <div class="mt-6">
          {#if showInvitePicker}
            <DialogHeader>
              <DialogTitle>Invite to Server</DialogTitle>
              <DialogDescription>
                Select a server to invite {profileUser.name}.
              </DialogDescription>
            </DialogHeader>

            {#if servers.length === 0}
              <p class="text-sm text-muted-foreground">
                You have no servers to invite from.
              </p>
            {:else}
              <Select
                type="single"
                bind:value={selectedServerId}
                disabled={sendingInvite}
              >
                <SelectTrigger>Select a server</SelectTrigger>
                <SelectContent>
                  {#each servers as s (s.id)}
                    <SelectItem value={s.id}>{s.name}</SelectItem>
                  {/each}
                </SelectContent>
              </Select>
            {/if}

            <DialogFooter class="mt-4">
              <Button
                variant="ghost"
                onclick={() => {
                  showInvitePicker = false;
                  selectedServerId = undefined;
                }}
                disabled={sendingInvite}
              >
                Cancel
              </Button>
              <Button
                onclick={handleInvite}
                disabled={!selectedServerId || sendingInvite}
              >
                {sendingInvite ? "Sending..." : "Send Invite"}
              </Button>
            </DialogFooter>
          {:else}
            <div
              class="flex items-start justify-between rounded-lg border border-border p-4 bg-muted/40"
            >
              <div class="pr-4">
                <h3 class="text-sm font-semibold">Invite to Server</h3>
                <p class="text-sm text-muted-foreground">
                  Send {profileUser.name} an invite to one of your servers.
                </p>
              </div>
              <Button
                onclick={openInvitePicker}
                disabled={servers.length === 0}
              >
                Invite
              </Button>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </DialogContent>
</Dialog>
{#if showLightbox}
  <ImageLightbox
    imageUrl={lightboxImageUrl}
    show={showLightbox}
    onClose={() => {
      showLightbox = false;
      lightboxImageUrl = "";
    }}
  />
{/if}

{#if showUserOptionsMenu}
  <UserOptionsMenu
    x={userOptionsMenuX}
    y={userOptionsMenuY}
    show={showUserOptionsMenu}
    ignored={isIgnored}
    onclose={() => (showUserOptionsMenu = false)}
    onaction={handleUserOptionAction}
  />
{/if}
