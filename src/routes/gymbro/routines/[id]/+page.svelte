<script lang="ts">
import { onMount } from "svelte";
import RoutineBuilderForm from "#lib/components/gymbro/RoutineBuilderForm.svelte";
import Icon from "#lib/components/Icon.svelte";
import { db } from "#lib/core/db/index.js";
import { getExercises, getMuscleGroups } from "#lib/core/gymbro.js";

let groups = $state<any[]>([]);
let exercises = $state<any[]>([]);
let routine = $state<{ id: number; name: string } | null>(null);

let { params }: { params: { id: string } } = $props();

async function load() {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return;

  const r = await db.gymbro_routines.get(String(id));
  if (!r || r.deletedAt !== null) return;
  routine = { id: Number(r.id), name: r.data.name as string };

  [groups, exercises] = await Promise.all([getMuscleGroups(), getExercises()]);

  const dayRows = await db.gymbro_routine_exercises
    .where("data.routine_day_id")
    .above(0)
    .toArray()
    .then((rows) =>
      rows
        .filter((d) => d.deletedAt === null)
        .map((d) => ({
          weekday: Number(d.data.weekday),
          exercise_id: Number(d.data.exercise_id),
          target_sets: d.data.target_sets,
          target_reps_min: d.data.target_reps_min,
          target_reps_max: d.data.target_reps_max,
          position: Number(d.data.position),
        })),
    )
    .then((rows) =>
      rows.sort((a, b) => a.weekday - b.weekday || a.position - b.position),
    );

  const byId = new Map(exercises.map((e) => [e.id, e]));
  const groupedDays = new Map<number, any[]>();
  for (const row of dayRows) {
    const exercise = byId.get(row.exercise_id);
    if (!exercise) continue;
    const list = groupedDays.get(row.weekday) ?? [];
    list.push({
      exercise,
      targetSets: row.target_sets,
      targetRepsMin: row.target_reps_min,
      targetRepsMax: row.target_reps_max,
    });
    groupedDays.set(row.weekday, list);
  }

  const initial = {
    id: routine.id,
    name: routine.name,
    days: [...groupedDays.entries()].map(([weekday, rows]) => ({
      weekday,
      rows,
    })),
  };

  // Pass initial to the form
  const formEl = document.getElementById("routine-builder");
  if (formEl && (formEl as any).svelteComponent) {
    (formEl as any).svelteComponent.$set({ initial });
  }
}

onMount(() => {
  void load();
});
</script>

<svelte:head>
  <title>Editar rutina · GymBro</title>
</svelte:head>

<div class="animate-rise">
  <header class="flex items-center gap-2">
    <a
      href="/gymbro/routines"
      aria-label="Volver"
      class="flex h-10 w-10 items-center justify-center rounded-full bg-surface border border-line text-muted"
    >
      <Icon name="chevron-left" size={15} />
    </a>
    {#if routine}
      <h1 class="truncate text-2xl font-bold tracking-tight">{routine.name}</h1>
    {/if}
  </header>
  <div id="routine-builder">
    <RoutineBuilderForm {groups} {exercises} initial={routine ? { id: routine.id, name: routine.name, days: [] } : null} />
  </div>
</div>