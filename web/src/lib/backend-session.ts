/** Relative app APIs may carry the site's login cookie; external origins retain the desktop's credential omission. */
export function backendSession(base: string): "same-origin" | "omit" {
  if (/[\u0000-\u001f\u007f]/.test(base)) return "omit";
  return base === "" || (base.startsWith("/") && !base.startsWith("//") && !base.includes("\\")) ? "same-origin" : "omit";
}
