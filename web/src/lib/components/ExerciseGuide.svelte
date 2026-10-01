<script lang="ts">
  // How-to view for an exercise: photos, generated muscle map, equipment, level and steps.
  import Label from './Label.svelte';
  import BodyFigure from './BodyFigure.svelte';
  import EquipmentIcon from './EquipmentIcon.svelte';
  import { MUSCLES, SHAPES, stateOf } from '../muscles';
  import { EQUIPMENT } from '../equipment';
  import type { Muscles } from '../types';

  let { muscles, equipment = [], instructions = [], images = [], level, category }: {
    muscles: Muscles; equipment?: string[]; instructions?: string[]; images?: string[];
    level?: string | null; category?: string | null;
  } = $props();

  let hover = $state<string | null>(null);
  const fill = (id: string) => {
    const s = stateOf(id, muscles, 'advanced');
    return s === 'p' ? 'var(--text)' : s === 's' ? 'var(--mid)' : hover === id ? 'var(--border-hi)' : 'var(--surface-hihi)';
  };
  const failed = $state<Record<string, boolean>>({});
</script>

<div class="guide">
  {#if images.length}
    <div class="photos" style:grid-template-columns="repeat({Math.min(images.length, 2)}, 1fr)">
      {#each images.slice(0, 2) as src, i (src)}
        <figure>
          {#if failed[src]}
            <div class="ph">[ PHOTO UNAVAILABLE ]</div>
          {:else}
            <img {src} alt="{i === 0 ? 'Start' : 'Finish'} position" loading="lazy" decoding="async" referrerpolicy="no-referrer"
              onerror={() => (failed[src] = true)} />
          {/if}
          {#if images.length > 1}<figcaption><Label size={8} color="var(--text-low)">{i === 0 ? 'Start' : 'Finish'}</Label></figcaption>{/if}
        </figure>
      {/each}
    </div>
  {/if}

  <div class="map">
    <div class="map-head">
      <Label>Muscles</Label>
      <Label size={9} color={hover ? 'var(--text)' : 'var(--text-low)'}>{hover ? MUSCLES[hover] : ''}</Label>
    </div>
    <div class="figs">
      <BodyFigure shapes={SHAPES.advanced.front} label="Front" {fill} bind:hover maxWidth={130} />
      <BodyFigure shapes={SHAPES.advanced.back} label="Back" {fill} bind:hover maxWidth={130} />
    </div>
    <div class="chips">
      {#each muscles.primary as m (m)}<span class="chip p">{MUSCLES[m] ?? m}</span>{/each}
      {#each muscles.secondary as m (m)}<span class="chip">{MUSCLES[m] ?? m}</span>{/each}
    </div>
  </div>

  {#if equipment.length || level || category}
    <div class="meta">
      {#each equipment as e (e)}<span class="tag"><EquipmentIcon id={e} size={14} />{EQUIPMENT[e] ?? e}</span>{/each}
      {#if level}<span class="tag muted">{level}</span>{/if}
      {#if category}<span class="tag muted">{category}</span>{/if}
    </div>
  {/if}

  {#if instructions.length}
    <div>
      <Label>How to</Label>
      <ol>
        {#each instructions as step, i (i)}<li><span class="n">{i + 1}</span><span>{step}</span></li>{/each}
      </ol>
    </div>
  {/if}
</div>

<style>
  .guide { display: flex; flex-direction: column; gap: 16px; }
  .photos { display: grid; gap: 6px; }
  figure { margin: 0; display: flex; flex-direction: column; gap: 4px; }
  img, .ph { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 10px; border: 1px solid var(--border); background: var(--surface-hi); display: block; }
  .ph { display: flex; align-items: center; justify-content: center; font-family: var(--f-mono); font-size: 11px; letter-spacing: 1px; color: var(--text-low);
    background: repeating-linear-gradient(45deg, var(--stripe-a) 0 8px, var(--stripe-b) 8px 16px); }
  .map { background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 12px; }
  .map-head { display: flex; justify-content: space-between; align-items: baseline; }
  .figs { margin-top: 8px; display: flex; gap: 4px; justify-content: center; }
  .chips, .meta { display: flex; flex-wrap: wrap; gap: 6px; }
  .chips { margin-top: 10px; }
  .chip { padding: 3px 7px; border-radius: 4px; border: 1px solid var(--border-hi); color: var(--text); font-family: var(--f-cond); font-weight: 600;
    font-size: 12px; letter-spacing: 0.8px; text-transform: uppercase; }
  .chip.p { background: var(--text); color: var(--bg); border-color: var(--text); }
  .tag { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--border);
    background: var(--surface); color: var(--text); font-family: var(--f-cond); font-weight: 600; font-size: 13px; letter-spacing: 0.8px; text-transform: uppercase; }
  .tag.muted { color: var(--text-mid); }
  ol { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  li { display: flex; gap: 10px; font-family: var(--f-sans); font-size: 13px; line-height: 1.5; color: var(--text); }
  .n { flex-shrink: 0; width: 20px; height: 20px; border-radius: 10px; background: var(--surface-hi); border: 1px solid var(--border);
    display: flex; align-items: center; justify-content: center; font-family: var(--f-cond); font-weight: 700; font-size: 12px; color: var(--text-mid); }
</style>
