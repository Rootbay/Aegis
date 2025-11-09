import { fireEvent, render } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

import EmojiPicker from "$lib/components/emoji/EmojiPicker.svelte";
import type { EmojiCategory } from "$lib/components/emoji/emojiData";

describe("EmojiPicker with provided categories", () => {
  it("renders server emoji entries and emits the provided value", async () => {
    const categories: EmojiCategory[] = [
      {
        id: "server-emoji",
        label: "Server Emoji",
        emojis: [
          {
            type: "custom",
            id: "emoji-1",
            name: "wave",
            url: "https://cdn.example.com/wave.png",
            value: "<emoji:emoji-1>",
            label: ":wave:",
            animated: true,
          },
        ],
      },
    ];

    const { component, getByAltText, getByRole } = render(EmojiPicker, {
      props: {
        emojiCategories: categories,
      },
    });

    const selectHandler = vi.fn();
    component.$on("select", selectHandler);

    const trigger = getByRole("button", { name: "React with :wave:" });
    const image = getByAltText(":wave:");

    expect(image).toHaveAttribute("src", "https://cdn.example.com/wave.png");

    await fireEvent.click(trigger);

    expect(selectHandler).toHaveBeenCalledTimes(1);
    expect(selectHandler.mock.calls[0][0]?.detail).toEqual({
      emoji: "<emoji:emoji-1>",
    });
  });
});
