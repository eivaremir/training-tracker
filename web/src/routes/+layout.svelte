<script lang="ts">
  import '../app.css';
  import type { Snippet } from 'svelte';
  import { updated } from '$app/state';
  import { checkForUpdate } from '$lib/update';
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
    // Installed apps are usually resumed, not reloaded: check for a new version whenever the
    // app comes back to the foreground, and switch to it right away if there is one.
    const onVisible = async () => {
      if (document.visibilityState !== 'visible') return;
      if (await checkForUpdate()) location.reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => { navigator.serviceWorker.removeEventListener('controllerchange', onChange); document.removeEventListener('visibilitychange', onVisible); };
  });

  $effect(() => {
    document.documentElement.dataset.theme = store.theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', store.theme === 'dark' ? '#0a0a0a' : '#f5f5f5');
  });
</script>

<div class="app">
  {#if updated.current}
    <div class="update" role="status">
      <span>New version available</span>
      <button onclick={() => location.reload()}>Reload</button>
    </div>
  {/if}
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
  /* Landscape phones, tablets and desktop use the full width (see the rail/sidebar in (app)/+layout). */
  @media (min-width: 720px) { .app { max-width: none; border: none; } }
  .update { position: sticky; top: 0; z-index: 60; display: flex; align-items: center; gap: 10px;
    padding: calc(10px + env(safe-area-inset-top, 0px)) 14px 10px; background: var(--text); color: var(--bg);
    font-family: var(--f-mono); font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase; }
  .update span { flex: 1; }
  .update button { padding: 6px 12px; border-radius: 8px; border: none; cursor: pointer; background: var(--bg); color: var(--text);
    font-family: var(--f-cond); font-weight: 600; font-size: 13px; letter-spacing: 1px; text-transform: uppercase; }
  .error { margin: 12px; padding: 10px 12px; border: 1px solid var(--danger); border-radius: 10px; color: var(--danger);
    font-family: var(--f-mono); font-size: 12px; display: flex; align-items: center; gap: 8px; }
  .error span { flex: 1; }
  .error button { background: transparent; border: none; color: inherit; cursor: pointer; }
</style>
