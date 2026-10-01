<script lang="ts" module>
  // Open sheets, innermost last — Escape only closes the topmost one.
  const stack: symbol[] = [];
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import IconButton from './IconButton.svelte';
  let { open, onclose, onback, title, height, children }: {
    open: boolean; onclose: () => void; /** Shows a back arrow before the title. */ onback?: () => void;
    title?: string; height?: string; children: Snippet;
  } = $props();

  const me = Symbol();
  $effect(() => {
    if (!open) return;
    stack.push(me);
    return () => { stack.splice(stack.indexOf(me), 1); };
  });
  function onkey(e: KeyboardEvent) {
    if (open && e.key === 'Escape' && stack[stack.length - 1] === me) onclose();
  }
</script>

<svelte:window onkeydown={onkey} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="overlay" onclick={onclose}>
    <div class="sheet" style:max-height={height || '85vh'} style:--sheet-h={height || '85vh'} onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
      <div class="grip"></div>
      {#if title}
        <div class="head">
          {#if onback}<IconButton icon="chev-l" onclick={onback} label="Back" />{/if}
          <div class="title">{title}</div>
          <IconButton icon="x" onclick={onclose} label="Close" />
        </div>
      {/if}
      <div class="body">{@render children()}</div>
    </div>
  </div>
{/if}

<style>
  .overlay { position: fixed; inset: 0; z-index: 100; background: var(--overlay); display: flex; align-items: flex-end;
    justify-content: center; animation: tt-fade 0.18s ease; }
  .sheet { width: 100%; max-width: 480px; background: var(--surface); border-top: 1px solid var(--border-hi);
    border-top-left-radius: 18px; border-top-right-radius: 18px; display: flex; flex-direction: column;
    animation: tt-slide 0.22s cubic-bezier(0.2, 0.9, 0.3, 1); outline: none; }
  /* Wide screens: a centred dialog instead of a bottom sheet. */
  @media (min-width: 720px) {
    .overlay { align-items: center; padding: 16px; }
    .sheet { max-width: 640px; border: 1px solid var(--border-hi); border-radius: 18px; overflow: hidden;
      animation: tt-pop 0.18s cubic-bezier(0.2, 0.9, 0.3, 1); max-height: min(var(--sheet-h, 85vh), calc(100dvh - 32px)) !important; }
    .grip { display: none; }
  }
  .grip { width: 36px; height: 4px; background: var(--border-hi); border-radius: 2px; margin: 10px auto 4px; }
  .head { padding: 10px 18px 14px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 6px; }
  .head :global(button:first-child) { margin-left: -8px; }
  .title { flex: 1; min-width: 0; font-family: var(--f-cond); font-weight: 600; font-size: 18px; color: var(--text); letter-spacing: 0.3px; }
  .body { flex: 1; overflow-y: auto; }
</style>
