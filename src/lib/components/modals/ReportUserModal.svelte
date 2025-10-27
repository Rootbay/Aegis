<svelte:options runes={true} />

<script lang="ts">
  import { Flag } from "@lucide/svelte";
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
  import type { ReportUserModalPayload } from "$lib/features/chat/utils/contextMenu";

  type Props = {
    onclose: () => void;
    payload: ReportUserModalPayload;
  };

  const reasonOptions = [
    { value: "harassment", label: "Harassment or hate" },
    { value: "spam", label: "Spam or scams" },
    { value: "inappropriate", label: "Inappropriate content" },
    { value: "impersonation", label: "Impersonation" },
    { value: "other", label: "Other" },
  ] as const;

  let { onclose, payload }: Props = $props();

  let open = $state(true);
  let reason = $state<(typeof reasonOptions)[number]["value"]>("harassment");
  let description = $state("");
  let submitting = $state(false);

  const chatContextDescription = $derived(() => {
    if (!payload?.sourceChatType) return null;
    switch (payload.sourceChatType) {
      case "channel":
        return `Channel: ${payload.sourceChatName ?? "Unnamed channel"}`;
      case "group":
        return `Group DM: ${payload.sourceChatName ?? "Untitled group"}`;
      case "dm":
        return "Direct message";
      default:
        return null;
    }
  });

  async function submitReport() {
    if (submitting) return;
    submitting = true;
    const trimmedDescription = description.trim();
    const payloadToSend = {
      target_user_id: payload.targetUser.id,
      reason,
      description: trimmedDescription,
      source_chat_id: payload.sourceChatId,
      source_chat_type: payload.sourceChatType,
    } satisfies Parameters<typeof invoke>[1];

    try {
      await invoke("submit_user_report", payloadToSend);
      toasts.addToast(
        "Report submitted. Thank you for helping keep the community safe.",
        "success",
      );
      open = false;
    } catch (error: unknown) {
      console.error("Failed to send report to backend.", error);
      toasts.addToast(
        "Failed to submit report. Please try again.",
        "error",
      );
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
  <DialogContent class="sm:max-w-md">
    <DialogHeader class="text-left">
      <DialogTitle class="flex items-center gap-2">
        <Flag size={16} class="text-destructive" />
        Report {payload.targetUser.name}
      </DialogTitle>
      <DialogDescription>
        Share what happened so our moderation team can review the issue.
      </DialogDescription>
    </DialogHeader>

    <form class="space-y-4">
      <div
        class="flex items-center gap-3 rounded-md border border-border bg-muted/40 p-3"
      >
        <img
          src={payload.targetUser.avatar}
          alt={payload.targetUser.name}
          class="h-12 w-12 rounded-full object-cover"
        />
        <div class="space-y-0.5 text-sm">
          <p class="font-medium text-foreground">{payload.targetUser.name}</p>
          {#if chatContextDescription}
            <p class="text-muted-foreground">{chatContextDescription}</p>
          {/if}
        </div>
      </div>

      <div class="space-y-2">
        <Label for="report-reason">Reason</Label>
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
        <Label for="report-details">Details</Label>
        <Textarea
          id="report-details"
          bind:value={description}
          placeholder="Include any specific messages, timestamps, or context that will help our team."
          class="min-h-[120px]"
        />
      </div>

      <DialogFooter class="pt-2">
        <DialogClose asChild>
          <Button type="button" variant="outline">Cancel</Button>
        </DialogClose>
        <Button type="button" disabled={submitting} onclick={submitReport}>
          {submitting ? "Submitting..." : "Submit report"}
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
