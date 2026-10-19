<script lang="ts">
  import { page } from '$app/state';
  import { afterNavigate } from '$app/navigation';
  import { onMount, tick, type Snippet } from 'svelte';
  import Icon from '$lib/components/Icon.svelte';
  import { store } from '$lib/store.svelte';
  import RestTimer from '$lib/components/RestTimer.svelte';
  import { rest } from '$lib/rest.svelte';

  let { children }: { children: Snippet } = $props();

  type Tab = { href: string; label: string; icon: string };
  type Menu = { label: string; icon: string; menu: Tab[] };

  // Today, Log and Plans share one "Execution" tab that opens them in a small menu.
  const tabs: (Tab | Menu)[] = [
    { href: '/', label: 'Home', icon: 'chart' },
    { label: 'Execution', icon: 'play', menu: [
      { href: '/today', label: 'Today', icon: 'today' },
      { href: '/log', label: 'Log', icon: 'list' },
      { href: '/history', label: 'History', icon: 'history' },
      { href: '/plans', label: 'Plans', icon: 'cal' }
    ] },
    { href: '/library', label: 'Library', icon: 'dumbbell' },
    { href: '/progress', label: 'Stats', icon: 'history' }
  ];

  let menuOpen = $state(false);
  let menuWrap = $state<HTMLElement>();
  let menuBtn = $state<HTMLButtonElement>();

  async function toggleMenu(e: MouseEvent) {
    menuOpen = !menuOpen;
    // Opened from the keyboard (Enter/Space report no clicks): move focus into the menu.
    if (menuOpen && e.detail === 0) {
      await tick();
      (menuWrap?.querySelector<HTMLElement>('[aria-current="page"]') ?? menuWrap?.querySelector<HTMLElement>('[role="menuitem"]'))?.focus();
    }
  }
  function menuKeys(e: KeyboardEvent) {
    const items = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="menuitem"]')];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = ({ ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 } as Record<string, number>)[e.key];
    if (next === undefined) return;
    e.preventDefault();
    items[(next + items.length) % items.length].focus();
  }
  function closeOnOutside(e: PointerEvent) {
    if (menuOpen && !menuWrap?.contains(e.target as Node)) menuOpen = false;
  }
  function closeOnEscape(e: KeyboardEvent) {
    if (!menuOpen || e.key !== 'Escape') return;
    const hadFocus = menuWrap?.contains(document.activeElement);
    menuOpen = false;
    if (hadFocus) menuBtn?.focus();
  }

  // Covers picking an item as well as back/forward while the menu is open.
  afterNavigate(() => { menuOpen = false; });

  // Mounted once per sign-in, so each user gets a fresh load of their own data.
  onMount(() => { store.init(); });
</script>

<svelte:head><title>Training Tracker</title></svelte:head>
<svelte:window onpointerdown={closeOnOutside} onkeydown={closeOnEscape} />

<div class="shell">
  <nav aria-label="Main" class:raised={menuOpen}>
    <div class="brand" aria-hidden="true">Training<br />Tracker</div>
    {#each tabs as t (t.label)}
      {#if 'menu' in t}
        <div class="group" bind:this={menuWrap}>
          <button type="button" class="tab" class:on={t.menu.some((m) => m.href === page.url.pathname)} bind:this={menuBtn}
            aria-haspopup="menu" aria-expanded={menuOpen} aria-controls="nav-menu" title={t.label} onclick={toggleMenu}>
            <Icon name={t.icon} size={20} />
            <span>{t.label}</span>
          </button>
          {#if menuOpen}
            <div id="nav-menu" class="menu" role="menu" tabindex="-1" aria-label={t.label} onkeydown={menuKeys}>
              {#each t.menu as m (m.href)}
                <a href={m.href} class="tab" class:on={page.url.pathname === m.href} role="menuitem"
                  aria-current={page.url.pathname === m.href ? 'page' : undefined} title={m.label}>
                  <Icon name={m.icon} size={20} />
                  <span>{m.label}</span>
                </a>
              {/each}
            </div>
          {/if}
        </div>
      {:else}
        <a href={t.href} class="tab" class:on={page.url.pathname === t.href} aria-current={page.url.pathname === t.href ? 'page' : undefined} title={t.label}>
          <Icon name={t.icon} size={20} />
          <span>{t.label}</span>
        </a>
      {/if}
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
    display: grid; grid-template-columns: repeat(4, 1fr); padding-bottom: env(safe-area-inset-bottom, 0); }
  .brand { display: none; }
  .tab { color: var(--text-low); padding: 11px 0 13px; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 4px;
    border: none; border-top: 2px solid transparent; margin-top: -1px; text-decoration: none; background: none; font: inherit; cursor: pointer; }
  .tab.on, .tab[aria-expanded='true'] { color: var(--text); }
  .tab.on { border-top-color: var(--text); }
  .tab span { font-family: var(--f-cond); font-weight: 600; font-size: 13px; letter-spacing: 0.6px; text-transform: uppercase; white-space: nowrap; }

  /* While the menu is open, sit over the pages' sticky headers and the rest timer (still under the update banner and sheets). */
  nav.raised { z-index: 55; }

  /* The Execution tab's menu: a popover above the bar here, a flyout beside the rail/sidebar below. Its items are
     the same tabs, marked by a fill instead of the edge line. */
  .group { position: relative; min-width: 0; display: flex; flex-direction: column; }
  .group > .tab { width: 100%; }
  .menu { position: absolute; z-index: 1; bottom: calc(100% + 8px); left: 50%; translate: -50% 0; width: 88px; padding: 4px;
    display: flex; flex-direction: column; gap: 2px; background: var(--bg); border: 1px solid var(--border-hi); border-radius: 14px;
    box-shadow: var(--shadow); outline: none; transform-origin: bottom center; animation: tt-pop 0.12s ease-out; }
  .menu .tab { margin: 0; border: none; border-radius: 10px; padding: 10px 0 11px; }
  .menu .tab.on { background: var(--surface-hi); }

  /* Landscape phones and tablets: a vertical rail on the left. It doesn't scroll (that would clip the menu's flyout);
     the four tabs fit even on short landscape phones. */
  @media (min-width: 720px) {
    .shell { flex-direction: row; }
    nav { order: 0; position: sticky; top: 0; bottom: auto; height: 100vh; height: 100dvh; width: 84px; flex-shrink: 0;
      display: flex; flex-direction: column; justify-content: flex-start; gap: 2px;
      border-top: none; border-right: 1px solid var(--border);
      padding: calc(12px + env(safe-area-inset-top, 0px)) 0 env(safe-area-inset-bottom, 0) env(safe-area-inset-left, 0); }
    .tab { padding: 9px 0; margin: 0; border-top: none; border-left: 2px solid transparent; }
    .tab.on { border-left-color: var(--text); }
    .menu { bottom: auto; top: -5px; left: calc(100% + 9px); translate: none; width: 84px; transform-origin: left top; }
    .menu .tab { padding: 9px 0; }
    main { padding-right: env(safe-area-inset-right, 0); }
    .content { max-width: 1240px; margin: 0 auto; }
  }
  /* Short landscape phones: a slimmer, icon-only rail that leaves more room for content (the menu keeps its labels). */
  @media (min-width: 720px) and (max-height: 520px) {
    nav { width: 64px; }
    .tab { padding: 10px 0; }
    .tab span { display: none; }
    .menu .tab span { display: inline; }
  }
  /* Desktop: a labelled sidebar. */
  @media (min-width: 1100px) and (min-height: 600px) {
    nav { width: 220px; justify-content: flex-start; padding: 24px 12px; gap: 4px; }
    .brand { display: block; padding: 4px 12px 24px; font-family: var(--f-cond); font-weight: 700; font-size: 22px;
      line-height: 1; letter-spacing: 0.5px; text-transform: uppercase; color: var(--text); }
    .tab { flex-direction: row; gap: 12px; padding: 11px 12px; border-left: none; border-radius: 10px; }
    .tab:hover { color: var(--text); background: var(--surface); }
    .tab.on { background: var(--surface-hi); }
    .tab span { font-size: 15px; letter-spacing: 1px; }
    .menu { left: calc(100% + 21px); width: 200px; }
    .menu .tab { padding: 11px 12px; }
  }
</style>
