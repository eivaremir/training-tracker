<script lang="ts">
  import { page } from '$app/state';
  import { onMount, type Snippet } from 'svelte';
  import Icon from '$lib/components/Icon.svelte';
  import { store } from '$lib/store.svelte';

  let { children }: { children: Snippet } = $props();

  const tabs = [
    { href: '/', label: 'Home', icon: 'chart' },
    { href: '/today', label: 'Today', icon: 'today' },
    { href: '/log', label: 'Log', icon: 'list' },
    { href: '/plans', label: 'Plans', icon: 'cal' },
    { href: '/library', label: 'Library', icon: 'dumbbell' },
    { href: '/progress', label: 'Stats', icon: 'history' },
    { href: '/settings', label: 'Settings', icon: 'settings' }
  ];

  // Mounted once per sign-in, so each user gets a fresh load of their own data.
  onMount(() => { store.init(); });
</script>

<svelte:head><title>Training Tracker</title></svelte:head>

<main>
  {#if store.loaded}{@render children()}{/if}
</main>
<nav style:grid-template-columns="repeat({tabs.length}, 1fr)">
  {#each tabs as t (t.href)}
    <a href={t.href} class:on={page.url.pathname === t.href} aria-current={page.url.pathname === t.href ? 'page' : undefined}>
      <Icon name={t.icon} size={20} />
      <span>{t.label}</span>
    </a>
  {/each}
</nav>

<style>
  main { flex: 1; }
  nav { position: sticky; bottom: 0; z-index: 10; background: var(--bg); border-top: 1px solid var(--border); display: grid;
    padding-bottom: env(safe-area-inset-bottom, 0); }
  a { color: var(--text-low); padding: 11px 0 13px; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 4px;
    border-top: 2px solid transparent; margin-top: -1px; text-decoration: none; }
  a.on { color: var(--text); border-top-color: var(--text); }
  a span { font-family: var(--f-mono); font-size: 8.5px; letter-spacing: 0.4px; text-transform: uppercase; white-space: nowrap; }
</style>
