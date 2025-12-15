import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { compile } from "svelte/compiler";
import { tick } from "svelte";
import { afterEach, describe, expect, it } from "vitest";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.window = dom.window as unknown as typeof globalThis.window;
globalThis.document = dom.window.document;
globalThis.navigator = dom.window.navigator as Navigator;
globalThis.Element = dom.window.Element;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.Text = dom.window.Text;
globalThis.Comment = dom.window.Comment;
globalThis.requestAnimationFrame =
  globalThis.requestAnimationFrame ||
  ((callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 16));
globalThis.cancelAnimationFrame =
  globalThis.cancelAnimationFrame || ((handle: number) => clearTimeout(handle));

const filePreviewPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src/lib/components/media/FilePreview.svelte",
);

const require = createRequire(import.meta.url);

async function instantiateFilePreview(
  target: HTMLElement,
  props: Record<string, unknown>,
) {
  const source = readFileSync(filePreviewPath, "utf-8");
  const { js } = compile(source, {
    filename: filePreviewPath,
    generate: "client",
  });

  const discloseVersionPath = require.resolve("svelte/internal/disclose-version");
  const resolvedDisclosePath = discloseVersionPath.replace(/\\/g, "/");
  let patchedCode = js.code.replace(
    /import ['"]svelte\/internal\/disclose-version['"];?/g,
    `import "${resolvedDisclosePath}";`,
  );

  const clientModulePath = require.resolve("svelte/internal/client").replace(/\\/g, "/");
  patchedCode = patchedCode.replace(
    /from ['"]svelte\/internal\/client['"]/g,
    `from "${clientModulePath}"`,
  );

  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "file-preview-test-"));
  const compiledPath = path.join(tmpDir, "FilePreview.compiled.mjs");
  const lucideStubPath = path.join(tmpDir, "lucide-stub.mjs");
  writeFileSync(
    lucideStubPath,
    `function createStub(name) {\n  return function stub(anchor) {\n    const span = document.createElement('span');\n    span.setAttribute('data-icon', name);\n    const parent = anchor.parentNode;\n    if (parent) {\n      parent.insertBefore(span, anchor);\n      parent.removeChild(anchor);\n    }\n    return {\n      destroy() {\n        span.remove();\n      },\n    };\n  };\n}\nexport const X = createStub('X');\nexport const File = createStub('File');\nexport const Download = createStub('Download');\nexport const LoaderCircle = createStub('LoaderCircle');\nexport const AudioLines = createStub('AudioLines');\n`,
    "utf-8",
  );

  patchedCode = patchedCode.replace(
    /import\s*\{[\s\S]*?\}\s*from "@lucide\/svelte";/,
    `import { X, File as FileIcon, Download as DownloadIcon, LoaderCircle, AudioLines } from "${lucideStubPath.replace(/\\/g, "/")}";`,
  );

  const sveltePackagePath = require.resolve("svelte/package.json");
  const svelteRuntimePath = path
    .join(path.dirname(sveltePackagePath), "src/index-client.js")
    .replace(/\\/g, "/");
  patchedCode = patchedCode.replace(
    /from ['"]svelte['"]/g,
    `from "${svelteRuntimePath}"`,
  );

  const chatStoreStubPath = path.join(tmpDir, "chatStore-stub.mjs");
  writeFileSync(
    chatStoreStubPath,
    `export const chatStore = {\n  async loadAttachmentForMessage() {\n    return 'blob:stub-url';\n  },\n};\n`,
    "utf-8",
  );
  patchedCode = patchedCode.replace(
    /from "\$lib\/features\/chat\/stores\/chatStore"/g,
    `from "${chatStoreStubPath.replace(/\\/g, "/")}"`,
  );

  const toastStubPath = path.join(tmpDir, "toast-stub.mjs");
  writeFileSync(
    toastStubPath,
    `export const toasts = {\n  showErrorToast: () => {},\n};\n`,
    "utf-8",
  );
  patchedCode = patchedCode.replace(
    /from "\$lib\/stores\/ToastStore"/g,
    `from "${toastStubPath.replace(/\\/g, "/")}"`,
  );

  writeFileSync(compiledPath, patchedCode, "utf-8");

  const mod = await import(pathToFileURL(compiledPath).href);
  const Component = mod.default as unknown as (anchor: Comment, props: Record<string, unknown>) => void;

  const { mount } = await import(pathToFileURL(svelteRuntimePath).href);

  return mount(Component, { target, props });
}

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

describe("FilePreview", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders an audio player once the attachment blob is available", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);

    const component = await instantiateFilePreview(target, {
      variant: "message",
      chatId: "chat-1",
      messageId: "message-1",
      attachment: {
        id: "attachment-1",
        name: "voice-note.mp3",
        type: "audio/mpeg",
        size: 2048,
        objectUrl: "blob:audio-test",
        isLoaded: true,
        isLoading: false,
      },
    });

    await tick();

    const audio = target.querySelector("audio");
    expect(audio).toBeTruthy();
    expect(audio?.getAttribute("src")).toBe("blob:audio-test");

    const downloadButton = target.querySelector(
      'button[aria-label="Download attachment voice-note.mp3"]',
    );
    expect(downloadButton).toBeTruthy();

    if (typeof (component as { destroy?: () => void }).destroy === "function") {
      (component as { destroy: () => void }).destroy();
    } else if (
      typeof (component as { $destroy?: () => void }).$destroy === "function"
    ) {
      (component as { $destroy: () => void }).$destroy();
    }
  });
});
