export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard !== undefined && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  // セキュアコンテキストでない場合のフォールバック
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    const copied = document.execCommand("copy");
    if (!copied) throw new Error("copy command failed");
  } finally {
    document.body.removeChild(textarea);
  }
}
