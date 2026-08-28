import { marked } from 'marked';

/**
 * Render session descriptions. Raw HTML is escaped before parsing rather than
 * sanitised after, so no markup an author writes can ever reach the DOM
 * (SPEC §7.4). Links are forced to open in a new tab with `noopener`.
 */
const escapeHtml = (raw: string): string =>
  raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const SAFE_PROTOCOLS = ['http:', 'https:', 'mailto:'];

function safeHref(href: string): string | undefined {
  try {
    const url = new URL(href, window.location.origin);
    return SAFE_PROTOCOLS.includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

const renderer = new marked.Renderer();
renderer.link = ({ href, title, tokens }) => {
  const text = renderer.parser.parseInline(tokens);
  const safe = safeHref(href);
  if (!safe) return text;
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
  return `<a href="${escapeHtml(safe)}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
};
renderer.image = ({ text }) => escapeHtml(text);

marked.setOptions({ renderer, gfm: true, breaks: true });

export function renderMarkdown(source: string): string {
  return marked.parse(escapeHtml(source), { async: false });
}
