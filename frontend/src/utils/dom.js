/**
 * DOM Utility helpers for clean, safe Vanilla JS application development.
 */

export function $(selector, context = document) {
  return context.querySelector(selector);
}

export function $$(selector, context = document) {
  return Array.from(context.querySelectorAll(selector));
}

/**
 * Create an HTML element with classes, attributes, and optional children.
 */
export function createElement(tag, { className = '', attributes = {}, text = '', html = '' } = {}) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  for (const [key, value] of Object.entries(attributes)) {
    el.setAttribute(key, value);
  }
  if (text) el.textContent = text;
  if (html) el.innerHTML = html;
  return el;
}

/**
 * Escapes unsafe HTML characters to prevent XSS.
 */
export function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
