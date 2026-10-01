<script lang="ts">
  import '../app.css';
  import type { Snippet } from 'svelte';
  import Icon from '$lib/components/Icon.svelte';
  import { store } from '$lib/store.svelte';

  let { children }: { children: Snippet } = $props();

  try { store.theme = (localStorage.getItem('tt-theme') as 'dark' | 'light') || 'dark'; } catch { /* private mode */ }
  // A new deploy installs a new service worker; reload once so this tab runs the new version.
  $effect(() => {
    if (!('serviceWorker' in navigator)) return;
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    const onChange = () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } };
    navigator.serviceWorker.addEventListener('controllerchange', onChange);
    // Check for a new version whenever the app comes back to the foreground.
    const onVisible = () => { if (document.visibilityState === 'visible') navigator.serviceWorker.getRegistration().then((r) => r?.update()); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { navigator.serviceWorker.removeEventListener('controllerchange', onChange); document.removeEventListener('visibilitychange', onVisible); };
  });

  $effect(() => {
    document.documentElement.dataset.theme = store.theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', store.theme === 'dark' ? '#0a0a0a' : '#f5f5f5');
  });
</script>

<div class="app">
  {#if store.error}
    <div class="error" role="alert">
      <span>{store.error}</span>
      <button onclick={() => (store.error = null)} aria-label="Dismiss"><Icon name="x" size={14} /></button>
    </div>
  {/if}
  {@render children()}
</div>

<style>
  .app { min-height: 100vh; display: flex; flex-direction: column; background: var(--bg); color: var(--text); max-width: 480px;
    margin: 0 auto; border-left: 1px solid var(--border); border-right: 1px solid var(--border); position: relative; }
  .error { margin: 12px; padding: 10px 12px; border: 1px solid var(--danger); border-radius: 10px; color: var(--danger);
    font-family: var(--f-mono); font-size: 11px; display: flex; align-items: center; gap: 8px; }
  .error span { flex: 1; }
  .error button { background: transparent; border: none; color: inherit; cursor: pointer; }
</style>
