import { ContextMenu as ContextMenuPrimitive } from "bits-ui";
import Content from "./context-menu-content.svelte";
import Item from "./context-menu-item.svelte";
import Trigger from "./context-menu-trigger.svelte";
import Separator from "./context-menu-separator.svelte";
import Label from "./context-menu-label.svelte";

const Root = ContextMenuPrimitive.Root;

export {
	Content,
	Item,
	Root as ContextMenu,
	Content as ContextMenuContent,
	Item as ContextMenuItem,
	Trigger as ContextMenuTrigger,
	Separator as ContextMenuSeparator,
	Label as ContextMenuLabel,
	Root,
	Separator,
	Label,
	Trigger,
};
