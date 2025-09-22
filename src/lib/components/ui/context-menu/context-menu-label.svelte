<script lang="ts">
	import { cn } from "$lib/utils.js";
	import { ContextMenu as ContextMenuPrimitive } from "bits-ui";

	let {
		class: className,
		inset,
		...restProps
	}: ContextMenuPrimitive.GroupHeadingProps & { inset?: boolean } = $props();
</script>

<ContextMenuPrimitive.GroupHeading
	data-slot="context-menu-label"
	data-inset={inset}
	class={cn("px-2 py-1.5 text-xs font-semibold text-muted-foreground", inset && "pl-8", className)}
	{...restProps}
/>
