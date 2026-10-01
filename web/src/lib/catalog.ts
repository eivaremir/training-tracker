// Public-domain exercise catalog (free-exercise-db), shipped as a static file and loaded on first use.
import type { CatalogExercise, Exercise } from './types';
import { uid } from './dates';

interface CatalogFile { source: string; license: string; commit: string; imageBase: string; exercises: CatalogExercise[] }

let pending: Promise<CatalogFile> | null = null;

export function loadCatalog(): Promise<CatalogFile> {
  pending ??= fetch('/catalog/exercises.json').then((r) => {
    if (!r.ok) throw new Error(`catalog ${r.status}`);
    return r.json();
  });
  pending.catch(() => (pending = null)); // allow a retry after a network error
  return pending;
}

/** Copy a catalog entry into the user's own library. */
export function toExercise(c: CatalogExercise, imageBase: string): Exercise {
  return {
    id: uid('ex'),
    name: c.name,
    notes: '',
    photoUrl: null,
    createdAt: new Date().toISOString(),
    muscles: { primary: [...c.muscles.primary], secondary: [...c.muscles.secondary] },
    equipment: [...c.equipment],
    instructions: [...c.instructions],
    images: c.images.map((p) => imageBase + p),
    level: c.level,
    category: c.category,
    sourceId: c.id
  };
}
