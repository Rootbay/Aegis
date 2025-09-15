<script lang="ts">
	import { theme } from '$lib/stores/theme';
</script>

<h1>Appearance Settings</h1>

<div class="space-y-4">
	<div>
		<label for="theme" class="block text-sm font-medium">Theme</label>
		<select id="theme" class="select select-bordered w-full max-w-xs" bind:value={$theme}>
			<option>light</option>
			<option>dark</option>
		</select>
	</div>
	<div>
		<label for="fontSize" class="block text-sm font-medium">Font Size</label>
		<input type="range" id="fontSize" min="12" max="20" class="range" />
	</div>
</div>
