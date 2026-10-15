/**
 * Brings a piece of the document to look like another one by changing only what differs. The screen is drawn as a string every time the core answers; putting that string in place whole would replace every element, and
 * every animation (the rings, the flows, the bars growing, the sweep of the entrance) would start again from its first frame at each answer. Here the elements that are the same stay the same element: a text is
 * rewritten only when it changed, an attribute only when it changed, and an element is replaced only when it is another kind of element. Nothing here knows what the drawing means.
 */

/** Makes the attributes of `from` the attributes of `to`: the ones that differ are set, the ones `to` does not have are removed. */
export function syncAttributes(from: Element, to: Element): void {
  for (const name of Array.from(from.getAttributeNames())) if (!to.hasAttribute(name)) from.removeAttribute(name);
  for (const name of to.getAttributeNames()) {
    const value = to.getAttribute(name) as string;
    if (from.getAttribute(name) !== value) from.setAttribute(name, value);
  }
}

/** Makes the children of `from` the children of `to`, in place. */
export function morphChildren(from: Node, to: Node): void {
  const a = Array.from(from.childNodes);
  const b = Array.from(to.childNodes);
  const shared = Math.min(a.length, b.length);
  for (let i = 0; i < shared; i++) {
    const x = a[i]!, y = b[i]!;
    if (x.nodeType !== y.nodeType || (x.nodeType === 1 && x.nodeName !== y.nodeName)) {
      from.replaceChild(y.cloneNode(true), x);
    } else if (x.nodeType === 1) {
      syncAttributes(x as Element, y as Element);
      morphChildren(x, y);
    } else if (x.nodeValue !== y.nodeValue) {
      x.nodeValue = y.nodeValue;
    }
  }
  for (let i = a.length - 1; i >= shared; i--) from.removeChild(a[i]!);
  for (let i = shared; i < b.length; i++) from.appendChild(b[i]!.cloneNode(true));
}
