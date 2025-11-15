export async function writeTextToClipboard(text: string): Promise<boolean> {
  const value = text ?? "";
  if (typeof window === "undefined") {
    return false;
  }

  const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : null;
  if (clipboard && typeof clipboard.writeText === "function") {
    try {
      await clipboard.writeText(value);
      return true;
    } catch (error) {
      console.debug("Clipboard writeText failed", error);
    }
  }

  if (typeof document === "undefined") {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "readonly");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    const success =
      typeof document.execCommand === "function"
        ? document.execCommand("copy")
        : false;
    return Boolean(success);
  } catch (error) {
    console.debug("Fallback clipboard copy failed", error);
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}
