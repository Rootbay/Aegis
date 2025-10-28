<svelte:options runes={true} />

<script lang="ts">
  import { Paintbrush, Share2, Users, X } from "@lucide/svelte";
  import { get, onDestroy, onMount } from "svelte";
  import { Button } from "$lib/components/ui/button/index.js";
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
    CollaborationSessionView,
  } from "../collabDocumentStore";
  import { friendStore } from "$lib/features/friends/stores/friendStore";
  import { userStore } from "$lib/stores/userStore";
  import { toasts } from "$lib/stores/ToastStore";

  type StrokePoint = { x: number; y: number };
  type Stroke = { id: string; points: StrokePoint[]; color: string };

  type Props = {
    documentId?: string;
    onclose: () => void;
  };

  let {
    documentId = generateCollaborationDocumentId("whiteboard"),
    onclose,
  }: Props = $props();

  let open = $state(true);
  let session: CollaborationSessionView | null = null;
  let isConnected = $state(false);
  let participantDisplay = $state<
    Array<{ id: string; name: string; avatar: string }>
  >([]);

  let canvas: HTMLCanvasElement | null = null;
  let strokes: Stroke[] = [];
  let activeStroke: Stroke | null = null;
  let latestSerialized = "";
  let unsubscribers: Array<() => void> = [];
  let teardownRegistered = false;
  let latestParticipants: CollaborationParticipant[] = [];

  const FALLBACK_AVATAR = (id: string) =>
    `https://api.dicebear.com/8.x/bottts-neutral/svg?seed=${id}`;

  function randomId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return Math.random().toString(36).slice(2, 10);
  }

  function createStroke(color: string): Stroke {
    return { id: randomId(), points: [], color };
  }

  function annotateParticipants(list: CollaborationParticipant[]) {
    if (!session) return;
    const { friends } = get(friendStore);
    const me = get(userStore).me;

    const display: Array<{ id: string; name: string; avatar: string }> = [];

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
        display.push({
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
        display.push({ id: me.id, name: me.name, avatar: me.avatar });
        continue;
      }

      const fallbackName =
        participant.displayName ?? `Guest ${participant.id.slice(0, 6)}`;
      const fallbackAvatar =
        participant.avatarUrl ?? FALLBACK_AVATAR(participant.id);
      display.push({
        id: participant.id,
        name: fallbackName,
        avatar: fallbackAvatar,
      });
    }

    participantDisplay = display;
  }

  function registerSession() {
    teardownRegistered = false;
    session = collaborationStore.openSession(documentId, {
      kind: "whiteboard",
      initialContent: "",
    });

    unsubscribers.push(
      session.isConnected.subscribe((value) => {
        isConnected = value;
      }),
    );

    unsubscribers.push(
      session.content.subscribe((value) => {
        if (value === latestSerialized) {
          return;
        }
        latestSerialized = value;
        try {
          const parsed = value ? (JSON.parse(value) as Stroke[]) : [];
          if (Array.isArray(parsed)) {
            strokes = parsed;
            drawCanvas();
          }
        } catch (error) {
          console.error("Failed to parse whiteboard state", error);
        }
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
        annotateParticipants(latestParticipants);
      }),
    );

    unsubscribers.push(
      userStore.subscribe(() => {
        annotateParticipants(latestParticipants);
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
        console.error("Failed to unsubscribe from whiteboard session", error);
      }
    }
    unsubscribers = [];
    collaborationStore.closeSession(documentId);
    session = null;
    latestSerialized = "";
    strokes = [];
    latestParticipants = [];
  }

  function setCanvasSize() {
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    drawCanvas();
  }

  function drawCanvas() {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 4;

    const renderStroke = (stroke: Stroke, alpha = 1) => {
      if (stroke.points.length === 0) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = stroke.color;
      ctx.beginPath();
      const [first, ...rest] = stroke.points;
      ctx.moveTo(first.x * canvas.width, first.y * canvas.height);
      for (const point of rest) {
        ctx.lineTo(point.x * canvas.width, point.y * canvas.height);
      }
      ctx.stroke();
      ctx.restore();
    };

    for (const stroke of strokes) {
      renderStroke(stroke);
    }

    if (activeStroke) {
      renderStroke(activeStroke, 0.6);
    }
  }

  function getRelativePoint(event: PointerEvent): StrokePoint {
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    return {
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
    };
  }

  function pointerDown(event: PointerEvent) {
    if (!session) return;
    event.preventDefault();
    canvas?.setPointerCapture(event.pointerId);
    const me = get(userStore).me;
    const color = me ? stringToColor(me.id) : stringToColor(documentId);
    activeStroke = createStroke(color);
    activeStroke.points.push(getRelativePoint(event));
    drawCanvas();
  }

  function pointerMove(event: PointerEvent) {
    if (!activeStroke) return;
    event.preventDefault();
    activeStroke.points.push(getRelativePoint(event));
    drawCanvas();
  }

  function pointerUp(event: PointerEvent) {
    if (!session || !activeStroke) return;
    event.preventDefault();
    canvas?.releasePointerCapture(event.pointerId);
    activeStroke.points.push(getRelativePoint(event));
    strokes = [...strokes, activeStroke];
    activeStroke = null;
    persistStrokes();
    drawCanvas();
  }

  function persistStrokes() {
    if (!session) return;
    latestSerialized = JSON.stringify(strokes);
    session.updateContent(latestSerialized);
  }

  function clearBoard() {
    strokes = [];
    persistStrokes();
    drawCanvas();
  }

  function stringToColor(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i += 1) {
      hash = input.charCodeAt(i) + ((hash << 5) - hash);
      hash &= hash;
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 78%, 62%)`;
  }

  async function handleShare() {
    const sharePayload = `aegis-collab://whiteboard/${documentId}`;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(sharePayload);
        toasts.addToast("Whiteboard link copied to clipboard.", "success");
      } else {
        throw new Error("Clipboard API unavailable");
      }
    } catch (error) {
      console.error("Failed to copy whiteboard link", error);
      toasts.addToast("Copy the whiteboard ID manually.", "warning");
    }
  }

  onMount(() => {
    registerSession();
    setCanvasSize();
    const resizeObserver = new ResizeObserver(() => setCanvasSize());
    if (canvas?.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }

    return () => {
      resizeObserver.disconnect();
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
</script>

<Dialog bind:open>
  <DialogContent class="max-w-5xl gap-6">
    <DialogHeader class="text-left space-y-2">
      <DialogTitle
        class="flex items-center gap-2 text-xl font-semibold text-foreground"
      >
        <Paintbrush size={18} class="text-muted-foreground" /> Collaborative Whiteboard
      </DialogTitle>
      <DialogDescription class="text-xs text-muted-foreground">
        Board ID: <span class="font-mono">{documentId}</span>
      </DialogDescription>
      <p class="text-sm text-muted-foreground">
        {isConnected
          ? "Sketch with teammates in real time."
          : "Connecting to peers..."}
      </p>
    </DialogHeader>

    <div class="flex flex-col gap-6 md:flex-row">
      <div class="flex-1 space-y-4">
        <div
          class="relative aspect-video w-full overflow-hidden rounded-lg border border-border/80 bg-muted/40"
        >
          <canvas
            bind:this={canvas}
            class="h-full w-full touch-none"
            onpointerdown={pointerDown}
            onpointermove={pointerMove}
            onpointerup={pointerUp}
            onpointercancel={pointerUp}
          ></canvas>
        </div>
        <div class="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onclick={clearBoard}>
            Clear Board
          </Button>
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
