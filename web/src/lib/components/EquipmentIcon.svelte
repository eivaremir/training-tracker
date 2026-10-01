<script lang="ts" module>
  // Line icons for each equipment id (24×24, stroke-based like Icon.svelte).
  const PATHS: Record<string, string> = {
    bodyweight: '<circle cx="12" cy="4.5" r="2"/><path d="M12 7v7M7 10h10M12 14l-3.5 6.5M12 14l3.5 6.5"/>',
    barbell: '<path d="M1.5 12h21M5 7v10M8 8.5v7M19 7v10M16 8.5v7"/>',
    dumbbell: '<rect x="2.5" y="8" width="5" height="8" rx="1.5"/><rect x="16.5" y="8" width="5" height="8" rx="1.5"/><path d="M7.5 12h9"/>',
    kettlebell: '<path d="M9 9.5V7.5a3 3 0 0 1 6 0v2"/><circle cx="12" cy="15" r="5.5"/><path d="M8.5 20.5h7"/>',
    ez_bar: '<path d="M1.5 12h3.5l1.5-1.5 2 3 2-3 2 3 2-3 2 3 1.5-1.5h3.5M4 8v8M20 8v8"/>',
    cable: '<circle cx="12" cy="4.5" r="2.5"/><path d="M12 7v9M8.5 19.5h7M12 16v3.5M4 2v20M20 2v20"/>',
    machine: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M5 9h14M5 13h14M5 17h14M12 3v6"/>',
    band: '<path d="M3.5 4.5h4v3h-4zM16.5 4.5h4v3h-4zM5.5 7.5c0 9 13 9 13 0"/>',
    bench: '<path d="M3 9.5h18v2.5H3zM6.5 12v7M17.5 12v7M4.5 19h4M15.5 19h4"/>',
    pullup_bar: '<path d="M4 3v18M20 3v18M4 7h16M8.5 7v3M15.5 7v3"/>',
    medicine_ball: '<circle cx="12" cy="12" r="8.5"/><path d="M4.2 9.5c5 2 10.6 2 15.6 0M4.2 14.5c5-2 10.6-2 15.6 0"/>',
    exercise_ball: '<circle cx="12" cy="11" r="8"/><path d="M5.5 21h13M8.5 7.5a5 5 0 0 1 3.5-1.5"/>',
    foam_roll: '<rect x="3.5" y="8" width="17" height="8" rx="4"/><path d="M8.5 8v8M12 8v8M15.5 8v8"/>',
    other: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12h.01M12 12h.01M16 12h.01"/>'
  };
</script>

<script lang="ts">
  let { id, size = 16 }: { id: string; size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0">{@html PATHS[id] ?? PATHS.other}</svg>
