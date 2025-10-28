<svelte:options runes={true} />

<script lang="ts">
  import { Share2, Users, X } from "@lucide/svelte";
  import { get, onDestroy, onMount } from "svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
  } from "$lib/components/ui/dialog";
  import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
  import {
    collaborationStore,
    generateCollaborationDocumentId,
  } from "../collabDocumentStore";
  import type {
    CollaborationParticipant,
    CollaborationSessionKind,
    CollaborationSessionView,
  } from "../collabDocumentStore";
  import { friendStore } from "$lib/features/friends/stores/friendStore";
  import { userStore } from "$lib/stores/userStore";
  import { toasts } from "$lib/stores/ToastStore";

  type Props = {
    documentId?: string;
    kind?: CollaborationSessionKind;
    initialContent?: string;
    onclose: () => void;
  };

  let {
    documentId = generateCollaborationDocumentId("doc"),
    kind = "document",
    initialContent = "",
    onclose,
  }: Props = $props();

  let open = $state(true);
  let session: CollaborationSessionView | null = null;
  let content = $state("");
  let isConnected = $state(false);
  let participantDisplay = $state<
    Array<{ id: string; name: string; avatar: string }>
  >([]);
  let latestParticipants: CollaborationParticipant[] = [];

  let unsubscribers: Array<() => void> = [];
  let teardownRegistered = false;

  const FALLBACK_AVATAR = (id: string) =>
    `https://api.dicebear.com/8.x/bottts-neutral/svg?seed=${id}`;

  function annotateParticipants(list: CollaborationParticipant[]) {
    if (!session) return;
    const { friends } = get(friendStore);
    const me = get(userStore).me;

    const nextDisplay: Array<{ id: string; name: string; avatar: string }> = [];

    for (const participant of list) {
      const friendMatch = friends.find(
        (friend) => friend.id === participant.id,
      );
      if (friendMatch) {
        session.annotateParticipant({
          id: friendMatch.id,
          displayName: friendMatch.name,
          avatarUrl: friendMatch.avatar,
          lastActiveAt: participant.lastActiveAt,
        });
        nextDisplay.push({
          id: friendMatch.id,
          name: friendMatch.name,
          avatar: friendMatch.avatar,
        });
        continue;
      }

      if (me && participant.id === me.id) {
        session.annotateParticipant({
          id: me.id,
          displayName: me.name,
          avatarUrl: me.avatar,
          lastActiveAt: participant.lastActiveAt,
        });
        nextDisplay.push({ id: me.id, name: me.name, avatar: me.avatar });
        continue;
      }

      const fallbackName =
        participant.displayName ?? `Guest ${participant.id.slice(0, 6)}`;
      const fallbackAvatar =
        participant.avatarUrl ?? FALLBACK_AVATAR(participant.id);
      nextDisplay.push({
        id: participant.id,
        name: fallbackName,
        avatar: fallbackAvatar,
      });
    }

    participantDisplay = nextDisplay;
  }

  function registerSession() {
    teardownRegistered = false;
    session = collaborationStore.openSession(documentId, {
      initialContent,
      kind,
    });

    unsubscribers.push(
      session.content.subscribe((value) => {
        content = value;
      }),
    );

    unsubscribers.push(
      session.isConnected.subscribe((value) => {
        isConnected = value;
      }),
    );

    unsubscribers.push(
      session.participants.subscribe((list) => {
        latestParticipants = list;
        annotateParticipants(list);
      }),
    );

    unsubscribers.push(
      friendStore.subscribe(() => {
        if (session) {
          annotateParticipants(latestParticipants);
        }
      }),
    );

    unsubscribers.push(
      userStore.subscribe(() => {
        if (session) {
          annotateParticipants(latestParticipants);
        }
      }),
    );
  }

  function teardownSession() {
    if (teardownRegistered) return;
    teardownRegistered = true;
    for (const unsubscribe of unsubscribers) {
      try {
        unsubscribe();
      } catch (error) {
        console.error("Failed to unsubscribe from session", error);
      }
    }
    unsubscribers = [];
    collaborationStore.closeSession(documentId);
    session = null;
    latestParticipants = [];
  }

  onMount(() => {
    registerSession();

    return () => {
      teardownSession();
    };
  });

  onDestroy(() => {
    teardownSession();
  });

  $effect(() => {
    if (!open) {
      teardownSession();
      onclose();
    }
  });

  async function handleShare() {
    const sharePayload = `aegis-collab://${kind}/${documentId}`;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(sharePayload);
        toasts.addToast("Document link copied to clipboard.", "success");
      } else {
        throw new Error("Clipboard API unavailable");
      }
    } catch (error) {
      console.error("Failed to copy collaboration link", error);
      toasts.addToast("Copy the document ID manually.", "warning");
    }
  }

  function handleInput(event: Event) {
    if (!session) return;
    const target = event.currentTarget as HTMLTextAreaElement | null;
    if (!target) return;
    session.updateContent(target.value);
  }
</script>

<Dialog bind:open>
  <DialogContent class="max-w-4xl gap-6">
    <DialogHeader class="text-left space-y-2">
      <DialogTitle
        class="flex items-center gap-2 text-xl font-semibold text-foreground"
      >
        <Users size={18} class="text-muted-foreground" />
        Collaborative Document
      </DialogTitle>
      <DialogDescription class="text-xs text-muted-foreground">
        Document ID: <span class="font-mono">{documentId}</span>
      </DialogDescription>
      <p class="text-sm text-muted-foreground">
        {isConnected ? "Live updates enabled." : "Connecting to peers..."}
      </p>
    </DialogHeader>

    <div class="flex flex-col gap-6 md:flex-row">
      <div class="flex-1 space-y-3">
        <Textarea
          bind:value={content}
          class="h-80 resize-none text-base leading-6"
          placeholder="Start typing to collaborate in real time..."
          oninput={handleInput}
        />
        <div class="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onclick={handleShare}>
            <Share2 size={16} class="mr-2" /> Share
          </Button>
          <Button variant="outline" size="sm" onclick={() => (open = false)}>
            <X size={16} class="mr-2" /> Close
          </Button>
        </div>
      </div>
      <aside class="w-full md:w-64">
        <h3
          class="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground"
        >
          <Users size={16} /> Participants
        </h3>
        <ScrollArea class="max-h-80 pr-1">
          <div class="space-y-2">
            {#if participantDisplay.length === 0}
              <p class="text-xs text-muted-foreground">
                No active collaborators yet.
              </p>
            {:else}
              {#each participantDisplay as participant (participant.id)}
                <div
                  class="flex items-center gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2"
                >
                  <img
                    src={participant.avatar}
                    alt={participant.name}
                    class="h-8 w-8 rounded-full object-cover"
                  />
                  <div class="flex flex-col">
                    <span class="text-sm font-medium text-foreground"
                      >{participant.name}</span
                    >
                    <span class="text-xs text-muted-foreground font-mono">
                      {participant.id}
                    </span>
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        </ScrollArea>
      </aside>
    </div>
  </DialogContent>
</Dialog>
