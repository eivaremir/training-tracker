// Equipment taxonomy. Icons live in components/EquipmentIcon.svelte.
export const EQUIPMENT: Record<string, string> = {
  bodyweight: 'Body only',
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  kettlebell: 'Kettlebell',
  ez_bar: 'EZ curl bar',
  cable: 'Cable',
  machine: 'Machine',
  band: 'Bands',
  bench: 'Bench',
  pullup_bar: 'Pull-up bar',
  medicine_ball: 'Medicine ball',
  exercise_ball: 'Exercise ball',
  foam_roll: 'Foam roll',
  other: 'Other'
};

export const equipmentLabel = (ids: string[] = []) => ids.map((id) => EQUIPMENT[id] ?? id).join(' · ');
