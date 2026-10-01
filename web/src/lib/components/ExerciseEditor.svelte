<script lang="ts">
  import Icon from './Icon.svelte';
  import Label from './Label.svelte';
  import Button from './Button.svelte';
  import Sheet from './Sheet.svelte';
  import TextField from './TextField.svelte';
  import BodyMap from './BodyMap.svelte';
  import EquipmentPicker from './EquipmentPicker.svelte';
  import { store } from '../store.svelte';
  import { uid } from '../dates';
  import type { Exercise, Muscles } from '../types';

  let { exercise, onsave, oncancel, ondelete }: {
    exercise?: Exercise; onsave: (e: Exercise) => void; oncancel: () => void; ondelete?: (id: string) => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  let name = $state(exercise?.name || '');
  // svelte-ignore state_referenced_locally
  let notes = $state(exercise?.notes || '');
  // svelte-ignore state_referenced_locally
  let muscles = $state<Muscles>(exercise ? structuredClone($state.snapshot(exercise.muscles)) : { primary: [], secondary: [] });
  // svelte-ignore state_referenced_locally
  let equipment = $state<string[]>([...(exercise?.equipment ?? [])]);
  // svelte-ignore state_referenced_locally
  let steps = $state((exercise?.instructions ?? []).join('\n'));
  // svelte-ignore state_referenced_locally
  let images = $state<string[]>([...(exercise?.images ?? [])]);
  let confirmDel = $state(false);

  const inUse = $derived(exercise ? store.routines.filter((r) => r.exercises.some((x) => x.exerciseId === exercise.id)) : []);
  const plural = $derived(inUse.length > 1 ? 's' : '');

  const save = () => onsave({
    id: exercise?.id || uid('ex'), name: name || 'Untitled', notes, muscles: $state.snapshot(muscles),
    photoUrl: exercise?.photoUrl || null, createdAt: exercise?.createdAt || new Date().toISOString(),
    equipment: $state.snapshot(equipment),
    instructions: steps.split('\n').map((l) => l.trim()).filter(Boolean),
    images: $state.snapshot(images),
    level: exercise?.level ?? null, category: exercise?.category ?? null, sourceId: exercise?.sourceId ?? null
  });
</script>

<div class="wrap">
  {#if images.length}
    <div class="photos">
      {#each images as src (src)}
        <div class="shot">
          <img {src} alt="" loading="lazy" referrerpolicy="no-referrer" />
          <button type="button" onclick={() => (images = images.filter((x) => x !== src))} aria-label="Remove photo"><Icon name="x" size={12} /></button>
        </div>
      {/each}
    </div>
  {:else}
    <!-- Photo upload is a placeholder until S3 presigned uploads are wired up. -->
    <button class="photo" disabled title="Photo upload coming soon">
      <Icon name="camera" size={24} />
      <Label>Add photo</Label>
    </button>
  {/if}
  <TextField label="Name" bind:value={name} placeholder="e.g. Romanian Deadlift" />
  <BodyMap bind:value={muscles} />
  <EquipmentPicker bind:value={equipment} />
  <label class="notes">
    <Label>Instructions · one step per line</Label>
    <textarea bind:value={steps} placeholder={'Set up…\nBrace…\nLower under control…'} rows="5"></textarea>
  </label>
  <label class="notes">
    <Label>Notes (optional)</Label>
    <textarea bind:value={notes} placeholder="Cues, form notes…" rows="3"></textarea>
  </label>

  {#if exercise && inUse.length}
    <div class="inuse">
      <Label color="var(--text-low)">Used in {inUse.length} routine{plural}</Label>
      <div class="tags">{#each inUse as r (r.id)}<span>{r.name}</span>{/each}</div>
    </div>
  {/if}

  <div class="row" style="margin-top:6px">
    {#if exercise && ondelete}<Button variant="danger" icon="trash" onclick={() => (confirmDel = true)}>Delete</Button>{/if}
    <div style="flex:1"></div>
    <Button variant="secondary" onclick={oncancel}>Cancel</Button>
    <Button onclick={save} disabled={!name}>Save</Button>
  </div>
</div>

<Sheet open={confirmDel} onclose={() => (confirmDel = false)} title="Delete exercise?">
  <div class="confirm">
    <div class="body-copy">
      <strong>{exercise?.name}</strong>
      {#if inUse.length}is used in {inUse.length} routine{plural}. It will be removed from those routines.{:else}will be removed.{/if}
      Logged sessions keep the exercise reference.
    </div>
    <div class="row">
      <Button variant="secondary" full onclick={() => (confirmDel = false)}>Cancel</Button>
      <Button variant="danger" full icon="trash" onclick={() => { confirmDel = false; ondelete?.(exercise!.id); }}>Delete</Button>
    </div>
  </div>
</Sheet>

<style>
  .wrap { padding: 18px; display: flex; flex-direction: column; gap: 16px; }
  .photo { width: 100%; height: 160px; background: repeating-linear-gradient(45deg, var(--stripe-a) 0 10px, var(--stripe-b) 10px 20px);
    border: 1px dashed var(--border-hi); border-radius: 12px; color: var(--text-mid); cursor: pointer;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; }
  .photo:disabled { cursor: default; }
  .photos { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
  .shot { position: relative; }
  .shot img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 10px; border: 1px solid var(--border); display: block; background: var(--surface-hi); }
  .shot button { position: absolute; top: 6px; right: 6px; width: 24px; height: 24px; border-radius: 12px; border: none; cursor: pointer;
    background: var(--overlay); color: #fff; display: flex; align-items: center; justify-content: center; }
  .notes { display: flex; flex-direction: column; gap: 6px; }
  textarea { background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; color: var(--text);
    outline: none; font-family: var(--f-sans); font-size: 13px; resize: vertical; }
  .inuse { background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 12px; }
  .tags { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px; }
  .tags span { padding: 3px 8px; background: var(--surface); border: 1px solid var(--border); border-radius: 4px; font-family: var(--f-sans); font-size: 11px; color: var(--text-mid); }
  .confirm { padding: 18px; display: flex; flex-direction: column; gap: 14px; }
</style>
