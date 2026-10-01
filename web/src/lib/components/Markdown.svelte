<script lang="ts" module>
  import { Marked } from 'marked';
  import DOMPurify from 'dompurify';

  // GitHub-flavoured Markdown; single newlines become line breaks (how chat models write).
  const md = new Marked({ gfm: true, breaks: true });

  // Model output is untrusted: sanitize, and make every link open safely in a new tab.
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer nofollow');
    }
  });

  export function renderMarkdown(source: string): string {
    const html = md.parse(source ?? '', { async: false }) as string;
    return DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['img', 'style', 'form', 'input', 'button', 'iframe', 'svg', 'math'],
      FORBID_ATTR: ['style']
    });
  }
</script>

<script lang="ts">
  let { source, size = 'md' }: { source: string; size?: 'sm' | 'md' } = $props();
  const html = $derived(renderMarkdown(source));
</script>

<div class="md {size}">{@html html}</div>

<style>
  .md { font-family: var(--f-sans); font-size: 13.5px; line-height: 1.6; color: var(--text); overflow-wrap: anywhere; }
  .md.sm { font-size: 13.5px; }
  .md :global(> :first-child) { margin-top: 0; }
  .md :global(> :last-child) { margin-bottom: 0; }

  .md :global(p) { margin: 0 0 10px; }
  .md :global(h1), .md :global(h2), .md :global(h3), .md :global(h4) {
    font-family: var(--f-cond); font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; line-height: 1.15; margin: 16px 0 8px;
  }
  .md :global(h1) { font-size: 20px; }
  .md :global(h2) { font-size: 17px; }
  .md :global(h3) { font-size: 15px; }
  .md :global(h4) { font-family: var(--f-mono); font-weight: 500; font-size: 12px; letter-spacing: 1.2px; color: var(--text-mid); }
  .md :global(h2), .md :global(h3) { display: flex; align-items: center; gap: 8px; }
  .md :global(h2)::before, .md :global(h3)::before { content: ''; width: 3px; height: 1em; border-radius: 2px; background: var(--text); flex-shrink: 0; }

  .md :global(strong) { font-weight: 600; color: var(--text); }
  .md :global(em) { color: var(--text-mid); }
  .md :global(a) { color: var(--text); text-decoration: underline; text-decoration-color: var(--border-hi); text-underline-offset: 2px; }
  .md :global(a:hover) { text-decoration-color: var(--text); }

  .md :global(ul), .md :global(ol) { margin: 0 0 12px; padding-left: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
  .md :global(li) { position: relative; padding-left: 20px; }
  .md :global(ul > li)::before { content: ''; position: absolute; left: 5px; top: 0.62em; width: 6px; height: 6px; border-radius: 2px; background: var(--text); }
  .md :global(ol) { counter-reset: md-ol; }
  .md :global(ol > li) { counter-increment: md-ol; padding-left: 26px; }
  .md :global(ol > li)::before { content: counter(md-ol); position: absolute; left: 0; top: 0.1em; width: 18px; height: 18px; border-radius: 9px;
    background: var(--surface-hi); border: 1px solid var(--border); font-family: var(--f-cond); font-weight: 700; font-size: 12px; color: var(--text-mid);
    display: flex; align-items: center; justify-content: center; }
  .md :global(li > ul), .md :global(li > ol) { margin: 6px 0 0; }
  .md :global(ul ul > li)::before { background: transparent; border: 1.5px solid var(--mid); width: 5px; height: 5px; }
  .md :global(li > p) { margin: 0; }

  .md :global(blockquote) { margin: 0 0 12px; padding: 10px 12px; border-left: 3px solid var(--border-hi); background: var(--surface-hi);
    border-radius: 0 8px 8px 0; color: var(--text-mid); }
  .md :global(blockquote p:last-child) { margin: 0; }

  .md :global(code) { font-family: var(--f-mono); font-size: 0.86em; padding: 1px 5px; border-radius: 4px; background: var(--surface-hi); border: 1px solid var(--border); }
  .md :global(pre) { margin: 0 0 12px; padding: 10px 12px; border-radius: 8px; background: var(--bg); border: 1px solid var(--border); overflow-x: auto; }
  .md :global(pre code) { padding: 0; border: none; background: none; }

  .md :global(hr) { border: none; border-top: 1px dashed var(--border-hi); margin: 14px 0; }

  .md :global(table) { width: 100%; border-collapse: collapse; margin: 0 0 12px; font-size: 13.5px; display: block; overflow-x: auto; }
  .md :global(th), .md :global(td) { padding: 6px 8px; border-bottom: 1px solid var(--border); text-align: left; white-space: nowrap; }
  .md :global(th) { font-family: var(--f-mono); font-weight: 500; font-size: 11.5px; letter-spacing: 1px; text-transform: uppercase; color: var(--text-mid); }
</style>
