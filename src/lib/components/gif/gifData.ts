export type GifEntry = {
  id: string;
  title: string;
  url: string;
};

export type GifCategory = {
  id: string;
  label: string;
  gifs: GifEntry[];
};

const buildGifEntries = (entries: Array<[string, string, string]>) =>
  entries.map(([idSuffix, title, url]) => ({
    id: `gif-${idSuffix}`,
    title,
    url,
  }));

export const GIF_CATEGORIES: GifCategory[] = [
  {
    id: "favorites",
    label: "Favorites",
    gifs: [],
  },
  {
    id: "trending",
    label: "Trending GIFs",
    gifs: buildGifEntries([
      ["trending-excited", "Excited Celebration", "https://media.giphy.com/media/l0HlNaQ6gWfllcjDO/giphy.gif"],
      ["trending-woot", "Woot Woot!", "https://media.giphy.com/media/111ebonMs90YLu/giphy.gif"],
      ["trending-thumbs", "Thumbs Up", "https://media.giphy.com/media/3o7TKsQzxRrLs9Xc0M/giphy.gif"],
    ]),
  },
  {
    id: "confused",
    label: "Confused",
    gifs: buildGifEntries([
      ["confused-huh", "Huh?", "https://media.giphy.com/media/3og0IMJcSiYpQ2r5D6/giphy.gif"],
      ["confused-what", "What???", "https://media.giphy.com/media/3o7TKr9S7FhPqvR2Ji/giphy.gif"],
      ["confused-look", "Looking Around", "https://media.giphy.com/media/26BRv0ThflsHCqDrG/giphy.gif"],
    ]),
  },
  {
    id: "chill",
    label: "Chill Out",
    gifs: buildGifEntries([
      ["chill-beach", "Beach Vibes", "https://media.giphy.com/media/l4JyOCNEfXvVYEqB2/giphy.gif"],
      ["chill-moon", "Under the Moon", "https://media.giphy.com/media/3owyp8eUo2cG0T3F9e/giphy.gif"],
      ["chill-snacks", "Snack Time", "https://media.giphy.com/media/LS5ZrJW2wExn3z9Hn9/giphy.gif"],
    ]),
  },
  {
    id: "love",
    label: "Love",
    gifs: buildGifEntries([
      ["love-hug", "Big Hugs", "https://media.giphy.com/media/l0MYEqEzwMWFCg8rm/giphy.gif"],
      ["love-heart", "Heart Warmth", "https://media.giphy.com/media/3o6Zt8zb1a0ZPZPsTq/giphy.gif"],
      ["love-dance", "Happy Dance", "https://media.giphy.com/media/xUA7bdpLxQhsSQdyog/giphy.gif"],
    ]),
  },
  {
    id: "happy",
    label: "Happy",
    gifs: buildGifEntries([
      ["happy-jump", "Jumping for Joy", "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif"],
      ["happy-pump", "Pump It Up", "https://media.giphy.com/media/3o6gbbuLW76jkt8vIc/giphy.gif"],
      ["happy-dance", "Just Dance", "https://media.giphy.com/media/3oriO0OEd9QIDdllqo/giphy.gif"],
    ]),
  },
];

export const GIF_MAP = new Map(
  GIF_CATEGORIES.flatMap((category) =>
    category.gifs.map((gif) => [gif.id, gif]),
  ),
);
