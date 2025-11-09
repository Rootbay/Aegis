<svelte:options runes={true} />

<script lang="ts">
  import { MessageSquareWarning } from "@lucide/svelte";
  import { invoke } from "@tauri-apps/api/core";
  import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
  } from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import {
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
  } from "$lib/components/ui/select/index.js";
  import { toasts } from "$lib/stores/ToastStore";
  import type { ReportMessageModalPayload } from "$lib/features/chat/utils/contextMenu";

  type Props = {
    onclose: () => void;
    payload: ReportMessageModalPayload;
  };

  const reasonOptions = [
    { value: "harassment", label: "Harassment or hate" },
    { value: "spam", label: "Spam or scams" },
    { value: "explicit", label: "Explicit or illegal content" },
    { value: "self_harm", label: "Self-harm or dangerous activity" },
    { value: "other", label: "Other" },
  ] as const;

  let { onclose, payload }: Props = $props();

  let open = $state(true);
  let reason = $state<(typeof reasonOptions)[number]["value"]>("harassment");
  let details = $state("");
  let submitting = $state(false);

  const chatContextDescription = $derived(() => {
    if (!payload?.chatType) return null;
    switch (payload.chatType) {
      case "channel":
        return `Channel: ${payload.chatName ?? "Unnamed channel"}`;
      case "group":
        return `Group DM: ${payload.chatName ?? "Untitled group"}`;
      case "dm":
        return "Direct message";
      default:
        return null;
    }
  });

  const formattedTimestamp = $derived(() => {
    if (!payload?.messageTimestamp) return null;
    try {
      return new Date(payload.messageTimestamp).toLocaleString();
    } catch {
      return payload.messageTimestamp;
    }
  });

  const authorInitial = $derived(() => {
    const name = payload?.authorName?.trim();
    return name && name.length > 0 ? name.charAt(0)?.toUpperCase() ?? "?" : "?";
  });

  async function submitReport(event?: Event) {
    event?.preventDefault();
    if (submitting) return;
    const trimmedDetails = details.trim();
    if (!trimmedDetails) {
      toasts.addToast("Please include details for the moderation team.", "error");
      return;
    }

    submitting = true;

    try {
      await invoke("report_message", {
        message_id: payload.messageId,
        reason,
        description: trimmedDetails,
        chat_id: payload.chatId,
        chat_type: payload.chatType,
        chat_name: payload.chatName,
        message_author_id: payload.authorId,
        message_author_name: payload.authorName,
        message_excerpt: payload.messageExcerpt,
        message_timestamp: payload.messageTimestamp,
        surrounding_message_ids: payload.surroundingMessageIds,
      });

      toasts.addToast(
        "Message report submitted. Our moderators will review it shortly.",
        "success",
      );
      open = false;
    } catch (error) {
      console.error("Failed to submit message report", error);
      toasts.addToast("Failed to submit report. Please try again.", "error");
    } finally {
      submitting = false;
    }
  }

  $effect(() => {
    if (!open) {
      onclose();
    }
  });
</script>

<Dialog bind:open>
  <DialogContent class="sm:max-w-lg">
    <DialogHeader class="text-left">
      <DialogTitle class="flex items-center gap-2">
        <MessageSquareWarning class="h-4 w-4 text-destructive" />
        Report message
      </DialogTitle>
      <DialogDescription>
        Share details about the message so our moderation team can review it.
      </DialogDescription>
    </DialogHeader>

    <form class="space-y-5" onsubmit={submitReport}>
      <div class="flex items-start gap-3 rounded-md border border-border bg-muted/40 p-3">
        <div class="h-12 w-12 rounded-full bg-muted flex items-center justify-center overflow-hidden text-base font-semibold">
          {#if payload.authorAvatar}
            <img
              src={payload.authorAvatar}
              alt={payload.authorName ?? "Message author"}
              class="h-full w-full object-cover"
            />
          {:else}
            {authorInitial}
          {/if}
        </div>
        <div class="space-y-1 text-sm">
          <p class="font-medium text-foreground">
            {payload.authorName ?? "Unknown sender"}
          </p>
          {#if formattedTimestamp}
            <p class="text-xs text-muted-foreground">
              Sent {formattedTimestamp}
            </p>
          {/if}
          {#if chatContextDescription}
            <p class="text-xs text-muted-foreground">{chatContextDescription}</p>
          {/if}
        </div>
      </div>

      <div class="space-y-2">
        <Label class="text-xs uppercase tracking-wide text-muted-foreground">
          Message excerpt
        </Label>
        <div class="rounded-md border border-border bg-muted/30 p-3 text-sm text-foreground">
          {payload.messageExcerpt ?? "No message preview available."}
        </div>
      </div>

      <div class="space-y-2">
        <Label for="message-report-reason">Reason</Label>
        <Select type="single" bind:value={reason}>
          <SelectTrigger class="w-full">
            {#if reasonOptions.find((option) => option.value === reason)}
              {reasonOptions.find((option) => option.value === reason)?.label}
            {:else}
              Select a reason
            {/if}
          </SelectTrigger>
          <SelectContent>
            {#each reasonOptions as option (option.value)}
              <SelectItem value={option.value}>{option.label}</SelectItem>
            {/each}
          </SelectContent>
        </Select>
      </div>

      <div class="space-y-2">
        <Label for="message-report-details">Details</Label>
        <Textarea
          id="message-report-details"
          bind:value={details}
          class="min-h-[120px]"
          placeholder="Describe why this message should be reviewed. Include context if possible."
        />
      </div>

      <DialogFooter class="pt-2">
        <DialogClose>
          <Button type="button" variant="outline">Cancel</Button>
        </DialogClose>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Submitting..." : "Submit report"}
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
