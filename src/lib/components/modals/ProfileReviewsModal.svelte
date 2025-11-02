<svelte:options runes={true} />

<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { Button } from "$lib/components/ui/button";
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from "$lib/components/ui/dialog";
  import { Label } from "$lib/components/ui/label";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { Textarea } from "$lib/components/ui/textarea";
  import { userStore } from "$lib/stores/userStore";
  import { Loader2, Star } from "@lucide/svelte";
  import type {
    Review,
    ReviewSubjectType,
  } from "$lib/features/reviews/models/Review";

  const MAX_REVIEW_LENGTH = 1000;
  const ratingChoices = [1, 2, 3, 4, 5];

  type ReviewDto = {
    id: string;
    subject_type: ReviewSubjectType;
    subject_id: string;
    author_id: string;
    author_username?: string | null;
    author_avatar?: string | null;
    rating: number;
    content?: string | null;
    created_at: string;
  };

  type Props = {
    subjectType: ReviewSubjectType;
    subjectId: string;
    subjectName?: string;
    subjectAvatarUrl?: string | null;
    close: () => void;
  };

  let {
    subjectType,
    subjectId,
    subjectName: subjectNameProp = "",
    subjectAvatarUrl = null,
    close,
  }: Props = $props();

  let reviews = $state<Review[]>([]);
  let loading = $state(false);
  let errorMessage = $state<string | null>(null);
  let submitting = $state(false);
  let formRating = $state(5);
  let formContent = $state("");
  let formError = $state<string | null>(null);
  let successMessage = $state<string | null>(null);
  let loadRequestToken = 0;

  const currentUserId = $derived($userStore.me?.id ?? null);
  const isSelfReview = $derived(
    subjectType === "user" &&
      currentUserId !== null &&
      currentUserId === subjectId,
  );
  const canSubmitReview = $derived(Boolean(currentUserId) && !isSelfReview);

  const trimmedContentLength = $derived(formContent.trim().length);
  const remainingCharacters = $derived(
    MAX_REVIEW_LENGTH - trimmedContentLength,
  );

  const reviewSummary = $derived.by(() => {
    if (reviews.length === 0) {
      return { average: null as number | null, count: 0 };
    }
    const total = reviews.reduce((sum, review) => sum + review.rating, 0);
    const average = Math.round((total / reviews.length) * 10) / 10;
    return { average, count: reviews.length };
  });

  const modalTitle = $derived(() => {
    const name = subjectNameProp?.trim();
    if (name) {
      return `Reviews for ${name}`;
    }
    return subjectType === "user" ? "User reviews" : "Server reviews";
  });

  const modalDescription = $derived(() => {
    const name = subjectNameProp?.trim();
    const targetLabel =
      name || (subjectType === "user" ? "this user" : "this server");
    if (reviews.length === 0) {
      return `Be the first to review ${targetLabel}.`;
    }
    return `See what others are saying about ${targetLabel}.`;
  });

  function toReview(dto: ReviewDto): Review {
    return {
      id: dto.id,
      subjectType: dto.subject_type,
      subjectId: dto.subject_id,
      authorId: dto.author_id,
      authorUsername: dto.author_username ?? null,
      authorAvatar: dto.author_avatar ?? null,
      rating: dto.rating,
      content: dto.content ?? null,
      createdAt: dto.created_at,
    };
  }

  async function loadReviews() {
    if (!subjectId) {
      reviews = [];
      return;
    }
    const token = ++loadRequestToken;
    loading = true;
    errorMessage = null;
    try {
      const command =
        subjectType === "user" ? "list_user_reviews" : "list_server_reviews";
      const args =
        subjectType === "user"
          ? { user_id: subjectId }
          : { server_id: subjectId };
      const response = await invoke<ReviewDto[]>(command, args);
      if (token !== loadRequestToken) {
        return;
      }
      reviews = response.map(toReview);
    } catch (error: any) {
      if (token !== loadRequestToken) {
        return;
      }
      console.error("Failed to load reviews:", error);
      errorMessage = error?.message ?? "Failed to load reviews.";
      reviews = [];
    } finally {
      if (token === loadRequestToken) {
        loading = false;
      }
    }
  }

  function handleContentInput(event: Event) {
    const target = event.currentTarget as HTMLTextAreaElement;
    formContent = target.value;
    formError = null;
    successMessage = null;
  }

  function setRating(value: number) {
    formRating = value;
    formError = null;
    successMessage = null;
  }

  function formatTimestamp(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }

  const isSubmitDisabled = $derived(
    submitting || !canSubmitReview || remainingCharacters < 0,
  );

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!canSubmitReview) {
      formError = "You must be signed in to leave a review.";
      return;
    }
    const rating = Math.min(5, Math.max(1, formRating));
    formRating = rating;

    const trimmedContent = formContent.trim();
    if (trimmedContent.length > MAX_REVIEW_LENGTH) {
      formError = `Reviews must be ${MAX_REVIEW_LENGTH} characters or fewer.`;
      return;
    }

    formError = null;
    submitting = true;
    try {
      await invoke<ReviewDto>("submit_review", {
        subject_type: subjectType,
        subject_id: subjectId,
        rating,
        content: trimmedContent.length > 0 ? trimmedContent : null,
      });
      formContent = "";
      formRating = 5;
      successMessage = "Review submitted.";
      await loadReviews();
    } catch (error: any) {
      console.error("Failed to submit review:", error);
      formError = error?.message ?? "Failed to submit review.";
      successMessage = null;
    } finally {
      submitting = false;
    }
  }

  $effect(() => {
    subjectType;
    subjectId;
    successMessage = null;
    formError = null;
    void loadReviews();
  });
</script>

<Dialog open onOpenChange={close}>
  <DialogContent class="max-w-2xl gap-6">
    <DialogHeader>
      <DialogTitle>{modalTitle}</DialogTitle>
      <DialogDescription>{modalDescription}</DialogDescription>
    </DialogHeader>

    <div class="flex flex-col gap-6">
      <div class="flex items-center gap-4">
        {#if subjectAvatarUrl}
          <img
            src={subjectAvatarUrl}
            alt={`${subjectNameProp || "Subject"} avatar`}
            class="h-14 w-14 rounded-full object-cover"
          />
        {/if}
        <div class="flex flex-col gap-1">
          <p class="text-lg font-semibold leading-tight">
            {subjectNameProp?.trim() ||
              (subjectType === "user" ? "Unnamed user" : "Unnamed server")}
          </p>
          <div
            class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
          >
            <span class="capitalize">{subjectType} reviews</span>
            {#if reviewSummary.count}
              <span class="flex items-center gap-1 text-foreground">
                <span class="font-medium">{reviewSummary.average}</span>
                <div class="flex items-center gap-0.5">
                  {#each ratingChoices as value (value)}
                    <Star
                      class={`h-4 w-4 ${
                        reviewSummary.average && reviewSummary.average >= value
                          ? "text-yellow-400"
                          : "text-muted-foreground"
                      }`}
                      fill={reviewSummary.average &&
                      reviewSummary.average >= value
                        ? "currentColor"
                        : "none"}
                    />
                  {/each}
                </div>
                <span class="text-xs text-muted-foreground">
                  ({reviewSummary.count} review{reviewSummary.count === 1
                    ? ""
                    : "s"})
                </span>
              </span>
            {:else}
              <span class="text-xs">No reviews yet</span>
            {/if}
          </div>
        </div>
      </div>

      {#if loading}
        <div class="flex h-40 items-center justify-center">
          <Loader2 class="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      {:else}
        {#if errorMessage}
          <div
            class="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {errorMessage}
          </div>
        {/if}
        <ScrollArea class="max-h-72 pr-3">
          {#if reviews.length === 0}
            <div
              class="flex flex-col items-center justify-center gap-2 py-8 text-center text-sm text-muted-foreground"
            >
              <p>No reviews yet.</p>
              {#if canSubmitReview}
                <p>Share your experience to help the community.</p>
              {/if}
            </div>
          {:else}
            <div class="flex flex-col gap-4 py-1">
              {#each reviews as review (review.id)}
                <article
                  class="rounded-lg border border-border/60 bg-muted/30 p-4"
                >
                  <div class="flex items-start justify-between gap-4">
                    <div>
                      <p class="text-sm font-medium text-foreground">
                        {review.authorUsername ?? "Anonymous"}
                      </p>
                      <p class="text-xs text-muted-foreground">
                        {formatTimestamp(review.createdAt)}
                      </p>
                    </div>
                    <div
                      class="flex items-center gap-1"
                      aria-label={`Rated ${review.rating} out of five`}
                    >
                      {#each ratingChoices as value (value)}
                        <Star
                          class={`h-4 w-4 ${
                            review.rating >= value
                              ? "text-yellow-400"
                              : "text-muted-foreground"
                          }`}
                          fill={review.rating >= value
                            ? "currentColor"
                            : "none"}
                        />
                      {/each}
                    </div>
                  </div>
                  {#if review.content}
                    <p class="mt-3 whitespace-pre-line text-sm text-foreground">
                      {review.content}
                    </p>
                  {/if}
                </article>
              {/each}
            </div>
          {/if}
        </ScrollArea>
      {/if}

      {#if canSubmitReview}
        <form class="space-y-4" onsubmit={handleSubmit}>
          <div class="flex flex-col gap-2">
            <span class="text-sm font-medium">Your rating</span>
            <div class="flex items-center gap-2">
              <div class="flex items-center gap-1">
                {#each ratingChoices as value (value)}
                  <button
                    type="button"
                    class={`rounded-md border border-border/60 bg-background p-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                      formRating === value
                        ? "border-primary"
                        : "hover:border-primary"
                    }`}
                    onclick={() => setRating(value)}
                  >
                    <Star
                      class={`h-5 w-5 ${
                        formRating >= value
                          ? "text-yellow-400"
                          : "text-muted-foreground"
                      }`}
                      fill={formRating >= value ? "currentColor" : "none"}
                    />
                    <span class="sr-only">{value} star rating</span>
                  </button>
                {/each}
              </div>
              <span class="text-sm text-muted-foreground">{formRating} / 5</span
              >
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <Label for="review-content">Your review</Label>
            <Textarea
              id="review-content"
              rows={4}
              placeholder={`Share your experience (max ${MAX_REVIEW_LENGTH} characters)`}
              value={formContent}
              oninput={handleContentInput}
            />
            <div
              class="flex items-center justify-between text-xs text-muted-foreground"
            >
              <span>{trimmedContentLength} / {MAX_REVIEW_LENGTH}</span>
              {#if remainingCharacters < 0}
                <span class="text-destructive">
                  {-remainingCharacters} character{remainingCharacters === -1
                    ? ""
                    : "s"} over the limit
                </span>
              {/if}
            </div>
          </div>

          {#if formError}
            <p class="text-sm text-destructive">{formError}</p>
          {/if}
          {#if successMessage}
            <p class="text-sm text-emerald-500">{successMessage}</p>
          {/if}

          <DialogFooter class="gap-2">
            <Button type="button" variant="ghost" onclick={close}>Close</Button>
            <Button type="submit" disabled={isSubmitDisabled}>
              {#if submitting}
                <Loader2 class="mr-2 h-4 w-4 animate-spin" />
              {/if}
              Submit review
            </Button>
          </DialogFooter>
        </form>
      {:else}
        <div class="space-y-4">
          <div
            class="rounded-md border border-muted-foreground/20 bg-muted/30 px-3 py-3 text-sm text-muted-foreground"
          >
            {#if !currentUserId}
              Sign in to share your thoughts.
            {:else if isSelfReview}
              You can't leave a review for yourself.
            {:else}
              Reviews are not available for this subject right now.
            {/if}
          </div>
          <DialogFooter class="gap-2">
            <Button type="button" variant="ghost" onclick={close}>Close</Button>
          </DialogFooter>
        </div>
      {/if}
    </div>
  </DialogContent>
</Dialog>
