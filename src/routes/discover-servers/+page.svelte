<script lang="ts">
  import NavigationHeader from "$lib/components/NavigationHeader.svelte";
  import DiscoverServersPanel from "$lib/components/lists/DiscoverServersPanel.svelte";

  const noop = () => {};
</script>

<div class="min-h-screen flex flex-col bg-card/50">
  <NavigationHeader chat={null} onOpenDetailedProfile={noop} />

  <main class="flex flex-col items-center overflow-y-auto w-full">
    <div class="w-full flex justify-center px-4 py-6">
      <div class="w-full max-w-7xl space-y-10">
        <div class="space-y-2 text-left">
          <div
            class="relative overflow-hidden rounded-3xl bg-linear-to-br from-slate-950 via-indigo-900 to-sky-900/80 p-6 sm:p-8"
            role="presentation"
          >
            <div class="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.15),rgba(15,23,42,0.65))]"></div>
            <div class="relative h-[300px] flex flex-col justify-center gap-4 text-white">
              <div class="space-y-2 max-w-3xl">
                <p class="text-xs font-semibold uppercase tracking-[0.5em] text-blue-200/80">
                  Discover Servers
                </p>
                <h1 class="text-3xl font-semibold sm:text-4xl">
                  Dive into communities curated by interests, events, and experiences.
                </h1>
                <p class="text-sm text-white/80">
                  Filter by topic, search for specific tags, and preview your favorite servers before joining.
                  Keep scrolling to unlock more recommendations.
                </p>
              </div>
              <div class="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.3em] text-white/70">
                <span>Live discussions · Creator-hosted events</span>
                <span class="hidden sm:inline">Community spotlights · Trending now</span>
              </div>
            </div>
          </div>
        </div>
        <DiscoverServersPanel />
      </div>
    </div>
  </main>
</div>
