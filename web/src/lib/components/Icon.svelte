<script lang="ts" module>
  const PATHS: Record<string, string> = {
    today: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    dumbbell: '<path d="M2 12h2M20 12h2M6 6v12M18 6v12M9 9v6M15 9v6M9 12h6"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    cal: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-7"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 8v4l3 2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M5 13l4 4L19 7"/>',
    x: '<path d="M6 6l12 12M18 6l-12 12"/>',
    edit: '<path d="M11 4H4v16h16v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
    'chev-r': '<path d="M9 6l6 6-6 6"/>',
    'chev-l': '<path d="M15 6l-6 6 6 6"/>',
    'chev-d': '<path d="M6 9l6 6 6-6"/>',
    play: '<path d="M6 4l14 8-14 8V4z"/>',
    pause: '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
    trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M5 6l1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14"/>',
    flame: '<path d="M12 2s4 4 4 8a4 4 0 0 1-8 0c0-1 .5-2 1-3 0 2 1 3 2 3 0-3-1-5 1-8z"/><path d="M5 14a7 7 0 0 0 14 0"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v3a3 3 0 0 1-3 3M7 5H4v3a3 3 0 0 0 3 3"/>',
    'arrow-r': '<path d="M5 12h14M13 6l6 6-6 6"/>',
    camera: '<path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>'
  };
</script>

<script lang="ts">
  let { name, size = 20, stroke = 1.5 }: { name: string; size?: number; stroke?: number } = $props();
  // An unknown name renders an empty (invisible) icon; flag it during development.
  $effect(() => { if (import.meta.env.DEV && !PATHS[name]) console.warn(`Icon: unknown name "${name}"`); });
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={stroke}
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0">{@html PATHS[name] ?? ''}</svg>
