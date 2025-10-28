import { describe, expect, it } from "vitest";

import { mergeAttachments } from "../../src/lib/features/chat/utils/attachments";

const createFile = (name: string, size: number, lastModified: number) =>
  new File(["content"], name, {
    type: "text/plain",
    lastModified,
    endings: "transparent",
  });

describe("mergeAttachments", () => {
  it("adds unique files and counts duplicates by name, size, and lastModified", () => {
    const existing = [createFile("a.txt", 10, 111)];

    const duplicate = createFile("a.txt", 10, 111);
    const unique = createFile("b.txt", 20, 222);
    const incomingDuplicates = [
      duplicate,
      unique,
      createFile("b.txt", 20, 222),
    ];

    const result = mergeAttachments(existing, incomingDuplicates);

    expect(result.files).toHaveLength(2);
    expect(result.files[0].name).toBe("a.txt");
    expect(result.files[1].name).toBe("b.txt");
    expect(result.duplicates).toBe(2);
  });

  it("returns the same array reference when only duplicates are provided", () => {
    const original = [createFile("c.txt", 30, 333)];
    const result = mergeAttachments(original, [createFile("c.txt", 30, 333)]);

    expect(result.files).toBe(original);
    expect(result.duplicates).toBe(1);
  });
});
