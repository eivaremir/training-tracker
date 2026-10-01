// Muscle taxonomy and body-map SVG paths (left side only; right side is mirrored).
export const MUSCLES: Record<string, string> = {
  traps: 'Traps', shoulders: 'Shoulders', chest: 'Chest', biceps: 'Biceps', triceps: 'Triceps',
  forearms: 'Forearms', abs: 'Abs', obliques: 'Obliques', lats: 'Lats', lowerback: 'Lower back',
  glutes: 'Glutes', quads: 'Quads', hamstrings: 'Hamstrings', calves: 'Calves',
  upper_traps: 'Upper traps', mid_traps: 'Mid traps', lower_traps: 'Lower traps',
  front_delts: 'Front delts', side_delts: 'Side delts', rear_delts: 'Rear delts',
  upper_chest: 'Upper chest', lower_chest: 'Mid/lower chest',
  biceps_long: 'Biceps long head', biceps_short: 'Biceps short head',
  triceps_long: 'Triceps long head', triceps_lateral: 'Triceps lateral head',
  forearm_flexors: 'Wrist flexors', brachioradialis: 'Brachioradialis', forearm_extensors: 'Wrist extensors',
  upper_abs: 'Upper abs', lower_abs: 'Lower abs',
  teres: 'Teres major', latissimus: 'Latissimus',
  glute_med: 'Glute medius', glute_max: 'Glute maximus',
  vastus_lateralis: 'Vastus lateralis', rectus_femoris: 'Rectus femoris', vastus_medialis: 'Vastus medialis', adductors: 'Adductors',
  biceps_femoris: 'Biceps femoris', semitendinosus: 'Semitendinosus',
  tibialis: 'Tibialis', gastrocnemius: 'Gastrocnemius', soleus: 'Soleus'
};

export const PARENT: Record<string, string> = {
  upper_traps: 'traps', mid_traps: 'traps', lower_traps: 'traps',
  front_delts: 'shoulders', side_delts: 'shoulders', rear_delts: 'shoulders',
  upper_chest: 'chest', lower_chest: 'chest', biceps_long: 'biceps', biceps_short: 'biceps',
  triceps_long: 'triceps', triceps_lateral: 'triceps',
  forearm_flexors: 'forearms', brachioradialis: 'forearms', forearm_extensors: 'forearms',
  upper_abs: 'abs', lower_abs: 'abs', teres: 'lats', latissimus: 'lats',
  glute_med: 'glutes', glute_max: 'glutes',
  vastus_lateralis: 'quads', rectus_femoris: 'quads', vastus_medialis: 'quads', adductors: 'quads',
  biceps_femoris: 'hamstrings', semitendinosus: 'hamstrings',
  tibialis: 'calves', gastrocnemius: 'calves', soleus: 'calves'
};

export const childrenOf = (g: string) => Object.keys(PARENT).filter((k) => PARENT[k] === g);

export type Shape = { id: string; d: string };
export type BodyMode = 'simple' | 'advanced';

export const SHAPES: Record<BodyMode, { front: Shape[]; back: Shape[] }> = {
  simple: {
    front: [
      { id: 'traps', d: 'M92 60 L74 72 Q84 70 92 68 Z' },
      { id: 'shoulders', d: 'M74 72 Q58 72 52 86 Q52 96 58 98 Q66 88 76 84 Z' },
      { id: 'chest', d: 'M99 72 L80 74 Q70 84 72 100 Q84 110 99 104 Z' },
      { id: 'biceps', d: 'M56 102 Q50 118 52 136 Q58 140 63 134 Q66 116 64 100 Z' },
      { id: 'forearms', d: 'M51 142 Q44 160 42 182 Q47 186 51 182 Q58 164 62 142 Z' },
      { id: 'abs', d: 'M88 108 L99 108 L99 170 Q92 168 88 162 Z' },
      { id: 'obliques', d: 'M76 106 L86 108 L86 162 Q78 150 76 130 Z' },
      { id: 'quads', d: 'M78 178 Q70 210 74 262 Q84 268 94 262 Q98 220 97 184 Z' },
      { id: 'calves', d: 'M76 282 Q72 310 78 344 Q84 348 88 344 Q94 312 90 282 Z' }
    ],
    back: [
      { id: 'traps', d: 'M100 56 L76 72 Q90 88 99 116 Z' },
      { id: 'shoulders', d: 'M74 72 Q58 72 52 86 Q52 96 58 98 Q66 88 76 84 Z' },
      { id: 'lats', d: 'M78 84 Q72 110 82 148 L98 148 L98 122 Q88 96 78 84 Z' },
      { id: 'triceps', d: 'M56 102 Q50 118 52 136 Q58 140 63 134 Q66 116 64 100 Z' },
      { id: 'forearms', d: 'M51 142 Q44 160 42 182 Q47 186 51 182 Q58 164 62 142 Z' },
      { id: 'lowerback', d: 'M84 152 L99 152 L99 172 L86 172 Q83 162 84 152 Z' },
      { id: 'glutes', d: 'M80 176 Q74 196 82 208 Q92 212 99 206 L99 176 Z' },
      { id: 'hamstrings', d: 'M76 214 Q72 240 76 266 Q84 270 94 266 Q98 240 97 214 Z' },
      { id: 'calves', d: 'M74 280 Q68 306 78 336 Q86 340 90 334 Q96 306 90 280 Z' }
    ]
  },
  advanced: {
    front: [
      { id: 'upper_traps', d: 'M92 60 L74 72 Q84 70 92 68 Z' },
      { id: 'side_delts', d: 'M64 73 Q56 76 52 86 Q52 96 58 98 Q59 86 64 73 Z' },
      { id: 'front_delts', d: 'M74 72 L64 73 Q59 86 58 98 Q66 88 76 84 Z' },
      { id: 'upper_chest', d: 'M99 72 L80 74 Q74 80 73 88 L99 88 Z' },
      { id: 'lower_chest', d: 'M99 88 L73 88 Q70 94 72 100 Q84 110 99 104 Z' },
      { id: 'biceps_long', d: 'M56 102 Q50 118 52 136 Q55 138 58 137 Q58 118 60 101 Z' },
      { id: 'biceps_short', d: 'M60 101 Q58 118 58 137 Q61 138 63 134 Q66 116 64 100 Z' },
      { id: 'brachioradialis', d: 'M51 142 Q44 160 42 182 Q45 184 47 184 Q52 160 57 142 Z' },
      { id: 'forearm_flexors', d: 'M57 142 Q52 160 47 184 Q49 185 51 182 Q58 164 62 142 Z' },
      { id: 'upper_abs', d: 'M88 108 L99 108 L99 138 L88 138 Z' },
      { id: 'lower_abs', d: 'M88 138 L99 138 L99 170 Q92 168 88 162 Z' },
      { id: 'obliques', d: 'M76 106 L86 108 L86 162 Q78 150 76 130 Z' },
      { id: 'vastus_lateralis', d: 'M78 178 Q70 210 74 262 L82 262 Q80 220 85 180 Z' },
      { id: 'rectus_femoris', d: 'M85 180 Q80 220 82 262 L86 262 Q92 230 92 182 Z' },
      { id: 'adductors', d: 'M92 182 L97 184 Q98 212 96 234 L90 234 Q92 208 92 182 Z' },
      { id: 'vastus_medialis', d: 'M90 234 L96 234 Q96 250 94 262 L86 262 Q88 248 90 234 Z' },
      { id: 'tibialis', d: 'M76 282 Q72 310 78 344 Q84 348 88 344 Q94 312 90 282 Z' }
    ],
    back: [
      { id: 'upper_traps', d: 'M100 56 L76 72 L100 74 Z' },
      { id: 'mid_traps', d: 'M76 72 Q84 82 90 92 L100 94 L100 74 Z' },
      { id: 'lower_traps', d: 'M90 92 Q95 102 99 116 L100 94 Z' },
      { id: 'side_delts', d: 'M64 73 Q56 76 52 86 Q52 96 58 98 Q59 86 64 73 Z' },
      { id: 'rear_delts', d: 'M74 72 L64 73 Q59 86 58 98 Q66 88 76 84 Z' },
      { id: 'teres', d: 'M78 84 Q76 92 76 98 Q82 96 86 94 Q82 88 78 84 Z' },
      { id: 'latissimus', d: 'M76 98 Q74 120 82 148 L98 148 L98 122 Q92 104 86 94 Q82 96 76 98 Z' },
      { id: 'triceps_lateral', d: 'M56 102 Q50 118 52 136 Q55 138 58 137 Q58 118 60 101 Z' },
      { id: 'triceps_long', d: 'M60 101 Q58 118 58 137 Q61 138 63 134 Q66 116 64 100 Z' },
      { id: 'forearm_extensors', d: 'M51 142 Q44 160 42 182 Q47 186 51 182 Q58 164 62 142 Z' },
      { id: 'lowerback', d: 'M84 152 L99 152 L99 172 L86 172 Q83 162 84 152 Z' },
      { id: 'glute_med', d: 'M80 176 L99 176 L99 184 Q88 182 78 186 Q78 180 80 176 Z' },
      { id: 'glute_max', d: 'M78 186 Q88 182 99 184 L99 206 Q92 212 82 208 Q74 196 78 186 Z' },
      { id: 'biceps_femoris', d: 'M76 214 Q72 240 76 266 L86 266 Q84 240 86 214 Z' },
      { id: 'semitendinosus', d: 'M86 214 Q84 240 86 266 Q90 268 94 266 Q98 240 97 214 Z' },
      { id: 'gastrocnemius', d: 'M74 280 Q70 296 72 312 Q82 318 92 312 Q94 296 90 280 Z' },
      { id: 'soleus', d: 'M72 312 Q74 326 78 336 Q86 340 90 334 Q92 322 92 312 Q82 318 72 312 Z' }
    ]
  }
};

export const SILHOUETTE = [
  'M100 12 Q116 12 117 32 Q116 52 100 54 Q84 52 83 32 Q84 12 100 12 Z',
  'M92 52 L108 52 L108 64 L92 64 Z',
  'M100 62 Q66 64 50 86 Q46 110 48 140 Q38 170 38 192 Q44 202 52 192 Q60 168 66 140 Q70 124 72 110 Q74 150 76 172 Q66 220 72 270 Q66 310 74 350 Q70 362 80 364 Q92 362 90 350 Q98 310 96 272 Q100 230 100 196 Z'
];

/** Effective selection state of a shape id: primary, secondary or none. */
export const stateOf = (id: string, v: { primary: string[]; secondary: string[] }, mode: BodyMode) => {
  const has = (list: string[]) =>
    mode === 'advanced'
      ? list.includes(id) || (!!PARENT[id] && list.includes(PARENT[id]))
      : list.includes(id) || childrenOf(id).some((c) => list.includes(c));
  return has(v.primary) ? 'p' : has(v.secondary) ? 's' : 'n';
};

export const musclesLabel = (m?: { primary: string[] }) =>
  m && m.primary.length ? m.primary.map((id) => MUSCLES[id]).join(' · ') : null;
