import { extractLinks, getLinkPreviewMetadata } from "$lib/features/chat/utils/linkPreviews";
import type { MessageEmbed } from "$lib/features/chat/models/Message";

export type MessageUnfurlContext = {
  content?: string | null;
  existingEmbeds?: MessageEmbed[] | null;
};

function cloneEmbed(embed: MessageEmbed): MessageEmbed {
  const provider = embed.provider
    ? {
        name: embed.provider.name ?? undefined,
        url: embed.provider.url ?? undefined,
        iconUrl: embed.provider.iconUrl ?? undefined,
      }
    : undefined;

  return {
    ...embed,
    provider,
  };
}

function hasMeaningfulEmbedContent(embed: MessageEmbed | null | undefined): embed is MessageEmbed {
  if (!embed) return false;

  const { title, description, url, thumbnailUrl, imageUrl, siteName, provider } = embed;
  if (
    (typeof title === "string" && title.trim().length > 0) ||
    (typeof description === "string" && description.trim().length > 0) ||
    (typeof url === "string" && url.trim().length > 0) ||
    (typeof thumbnailUrl === "string" && thumbnailUrl.trim().length > 0) ||
    (typeof imageUrl === "string" && imageUrl.trim().length > 0) ||
    (typeof siteName === "string" && siteName.trim().length > 0)
  ) {
    return true;
  }

  if (provider) {
    if (
      (typeof provider.name === "string" && provider.name.trim().length > 0) ||
      (typeof provider.iconUrl === "string" && provider.iconUrl.trim().length > 0) ||
      (typeof provider.url === "string" && provider.url.trim().length > 0)
    ) {
      return true;
    }
  }

  return false;
}

export async function resolveMessageEmbeds({
  content,
  existingEmbeds,
}: MessageUnfurlContext): Promise<MessageEmbed[]> {
  const resolved: MessageEmbed[] = [];
  const normalizedExisting = (existingEmbeds ?? []).filter(hasMeaningfulEmbedContent);

  for (const embed of normalizedExisting) {
    resolved.push(cloneEmbed(embed));
  }

  const seenUrls = new Set<string>(
    normalizedExisting
      .map((embed) => embed.url)
      .filter((value): value is string => typeof value === "string" && value.length > 0),
  );

  const links = extractLinks(typeof content === "string" ? content : undefined);
  if (links.length === 0) {
    return resolved;
  }

  const unfurled = await Promise.all(
    links
      .filter((link) => !seenUrls.has(link))
      .map(async (link) => {
        try {
          const metadata = await getLinkPreviewMetadata(link);
          if (!metadata) {
            return null;
          }

          const embed: MessageEmbed = {
            type: "link",
            url: metadata.url ?? link,
            title: metadata.title ?? undefined,
            description: metadata.description ?? undefined,
            thumbnailUrl: metadata.imageUrl ?? undefined,
            siteName: metadata.siteName ?? undefined,
            provider:
              metadata.siteName || metadata.iconUrl
                ? {
                    name: metadata.siteName ?? undefined,
                    iconUrl: metadata.iconUrl ?? undefined,
                    url: metadata.url ?? link,
                  }
                : undefined,
          };

          seenUrls.add(embed.url ?? link);
          return embed;
        } catch (error) {
          console.warn("[messageUnfurlService] Failed to resolve link metadata", {
            link,
            error,
          });
          return null;
        }
      }),
  );

  for (const embed of unfurled) {
    if (embed) {
      resolved.push(embed);
    }
  }

  return resolved;
}
