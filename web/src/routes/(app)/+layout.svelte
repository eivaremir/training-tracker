<script lang="ts">
  import { page } from '$app/state';
  import { onMount, type Snippet } from 'svelte';
  import Icon from '$lib/components/Icon.svelte';
  import { store } from '$lib/store.svelte';
  import RestTimer from '$lib/components/RestTimer.svelte';
  import { rest } from '$lib/rest.svelte';

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

<div class="shell">
  <nav aria-label="Main">
    <div class="brand" aria-hidden="true">Training<br />Tracker</div>
    {#each tabs as t (t.href)}
      <a href={t.href} class:on={page.url.pathname === t.href} aria-current={page.url.pathname === t.href ? 'page' : undefined} title={t.label}>
        <Icon name={t.icon} size={20} />
        <span>{t.label}</span>
      </a>
    {/each}
  </nav>
  <main>
    <div class="content">{#if store.loaded}{@render children()}{/if}</div>
  </main>
</div>

<!-- Rest between sets floats over every page, not just Today. -->
{#if rest.active}<RestTimer />{/if}

<style>
  /* Phone (portrait): content, then a bottom tab bar. */
  .shell { flex: 1; display: flex; flex-direction: column; }
  main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .content { flex: 1; width: 100%; }
  nav { order: 1; position: sticky; bottom: 0; z-index: 10; background: var(--bg); border-top: 1px solid var(--border);
    display: grid; grid-template-columns: repeat(7, 1fr); padding-bottom: env(safe-area-inset-bottom, 0); }
  .brand { display: none; }
  a { color: var(--text-low); padding: 11px 0 13px; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 4px;
    border-top: 2px solid transparent; margin-top: -1px; text-decoration: none; }
  a.on { color: var(--text); border-top-color: var(--text); }
  a span { font-family: var(--f-cond); font-weight: 600; font-size: 13px; letter-spacing: 0.6px; text-transform: uppercase; white-space: nowrap; }

  /* Landscape phones and tablets: a vertical rail on the left. */
  @media (min-width: 720px) {
    .shell { flex-direction: row; }
    nav { order: 0; position: sticky; top: 0; bottom: auto; height: 100vh; height: 100dvh; width: 84px; flex-shrink: 0;
      display: flex; flex-direction: column; justify-content: flex-start; gap: 2px; overflow-y: auto;
      border-top: none; border-right: 1px solid var(--border);
      padding: calc(12px + env(safe-area-inset-top, 0px)) 0 env(safe-area-inset-bottom, 0) env(safe-area-inset-left, 0); }
    a { padding: 9px 0; margin: 0; border-top: none; border-left: 2px solid transparent; }
    a.on { border-left-color: var(--text); }
    main { padding-right: env(safe-area-inset-right, 0); }
    .content { max-width: 1240px; margin: 0 auto; }
  }
  /* Short landscape phones: icons only so all seven fit. */
  @media (min-width: 720px) and (max-height: 520px) {
    nav { width: 64px; }
    a { padding: 10px 0; }
    a span { display: none; }
  }
  /* Desktop: a labelled sidebar. */
  @media (min-width: 1100px) and (min-height: 600px) {
    nav { width: 220px; justify-content: flex-start; padding: 24px 12px; gap: 4px; }
    .brand { display: block; padding: 4px 12px 24px; font-family: var(--f-cond); font-weight: 700; font-size: 22px;
      line-height: 1; letter-spacing: 0.5px; text-transform: uppercase; color: var(--text); }
    a { flex-direction: row; gap: 12px; padding: 11px 12px; border-left: none; border-radius: 10px; }
    a:hover { color: var(--text); background: var(--surface); }
    a.on { background: var(--surface-hi); }
    a span { font-size: 15px; letter-spacing: 1px; }
  }
</style>
