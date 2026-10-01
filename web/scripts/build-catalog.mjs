// Builds static/catalog/exercises.json from free-exercise-db (public domain, Unlicense).
//   node scripts/build-catalog.mjs [commit-sha]
// The commit is pinned so the catalog and its CDN image URLs never change underneath us.
import { writeFileSync, mkdirSync } from 'node:fs';

const REPO = 'yuhonas/free-exercise-db';
const COMMIT = process.argv[2] || 'f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5';
const SRC = `https://raw.githubusercontent.com/${REPO}/${COMMIT}/dist/exercises.json`;
const IMAGE_BASE = `https://cdn.jsdelivr.net/gh/${REPO}@${COMMIT}/exercises/`;

// Dataset muscle names → the app's muscle ids (see src/lib/muscles.ts).
const MUSCLE = {
  abdominals: 'abs', abductors: 'glute_med', adductors: 'adductors', biceps: 'biceps', calves: 'calves',
  chest: 'chest', forearms: 'forearms', glutes: 'glutes', hamstrings: 'hamstrings', lats: 'lats',
  'lower back': 'lowerback', 'middle back': 'mid_traps', neck: 'upper_traps', quadriceps: 'quads',
  shoulders: 'shoulders', traps: 'traps', triceps: 'triceps'
};
// Dataset equipment → the app's equipment ids (see src/lib/equipment.ts).
const EQUIP = {
  'body only': 'bodyweight', barbell: 'barbell', dumbbell: 'dumbbell', kettlebells: 'kettlebell',
  'e-z curl bar': 'ez_bar', cable: 'cable', machine: 'machine', bands: 'band', 'medicine ball': 'medicine_ball',
  'exercise ball': 'exercise_ball', 'foam roll': 'foam_roll', other: 'other'
};

const muscles = (list) => {
  const out = [...new Set(list.map((m) => MUSCLE[m]).filter(Boolean))];
  const unknown = list.filter((m) => !MUSCLE[m]);
  if (unknown.length) throw new Error(`Unmapped muscles: ${unknown.join(', ')}`);
  return out;
};

const res = await fetch(SRC);
if (!res.ok) throw new Error(`${SRC} → ${res.status}`);
const data = await res.json();

const exercises = data.map((x) => {
  if (x.equipment && !EQUIP[x.equipment]) throw new Error(`Unmapped equipment: ${x.equipment}`);
  const primary = muscles(x.primaryMuscles);
  return {
    id: x.id,
    name: x.name.trim(),
    level: x.level ?? null,
    category: x.category ?? null,
    force: x.force ?? null,
    mechanic: x.mechanic ?? null,
    equipment: x.equipment ? [EQUIP[x.equipment]] : [],
    muscles: { primary, secondary: muscles(x.secondaryMuscles).filter((m) => !primary.includes(m)) },
    instructions: x.instructions.map((s) => s.trim()).filter(Boolean),
    images: x.images
  };
}).sort((a, b) => a.name.localeCompare(b.name));

const catalog = {
  source: `https://github.com/${REPO}`,
  license: 'Unlicense (public domain)',
  commit: COMMIT,
  imageBase: IMAGE_BASE,
  exercises
};
mkdirSync('static/catalog', { recursive: true });
writeFileSync('static/catalog/exercises.json', JSON.stringify(catalog));
console.log(`catalog: ${exercises.length} exercises from ${REPO}@${COMMIT.slice(0, 7)}`);
