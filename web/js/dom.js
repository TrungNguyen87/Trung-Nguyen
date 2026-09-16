/**
 * Minimal DOM helpers. Deliberately not a framework: the whole point of
 * leaving Streamlit was to stop shipping a runtime between the child's tap
 * and the screen, and adding React back would undo most of that.
 */

/**
 * Create an element.
 * @param {string} tag  "div", or "div.card.big", or "button.primary"
 * @param {object} [props]  className, textContent, html, dataset, style,
 *   aria-* / data-* attributes, and on* event handlers.
 * @param {Array|string} [children]
 */
export function el(tag, props = {}, children = []) {
  const [name, ...classes] = tag.split(".");
  const node = document.createElement(name || "div");
  if (classes.length) node.classList.add(...classes);

  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === "html") node.innerHTML = value;
    else if (key === "text") node.textContent = value;
    else if (key === "class") node.classList.add(...String(value).split(/\s+/).filter(Boolean));
    else if (key === "style" && typeof value === "object") Object.assign(node.style, value);
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key in node && key !== "list" && typeof value !== "object") {
      node[key] = value;
    } else {
      node.setAttribute(key, value === true ? "" : value);
    }
  }

  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** An element whose content is a trusted HTML string (our own SVG/markdown). */
export function raw(tag, htmlString, props = {}) {
  return el(tag, { ...props, html: htmlString });
}

/**
 * Append children, skipping null/undefined/false.
 *
 * Use this instead of node.append(...) whenever a child is conditional:
 * Node.append() stringifies its arguments, so a bare `condition ? el(...) : null`
 * puts the literal text "null" on the page rather than nothing.
 */
export function append(node, ...children) {
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/** Run `fn` once the browser has painted - used to trigger enter animations. */
export function nextFrame(fn) {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}
