<script lang="ts">
import { onMount } from "svelte";
import Icon from "#lib/components/Icon.svelte";
import {
  formatDateLong,
  formatDuration,
  formatTime,
  formatVolume,
} from "#lib/core/dates.js";
import { db } from "#lib/core/db/index.js";

let workoutId = $state(0);
let startedAt = $state(0);
let endedAt = $state<number | null>(null);
let durationSeconds = $state<number | null>(null);
let routineDayId = $state<number | null>(null);
let title = $state("Entreno libre");
let exercises = $state<any[]>([]);

let { params }: { params: { id: string } } = $props();

async function load() {
  workoutId = Number(params.id);
  if (!Number.isInteger(workoutId)) return;

  const workout = await db.gymbro_workouts.get(String(workoutId));
  if (!workout || workout.deletedAt !== null) return;

  startedAt = Number(workout.data.started_at);
  endedAt = workout.data.ended_at ? Number(workout.data.ended_at) : null;
  durationSeconds = workout.data.duration_seconds
    ? Number(workout.data.duration_seconds)
    : null;
  routineDayId = workout.data.routine_day_id
    ? Number(workout.data.routine_day_id)
    : null;

  if (routineDayId) {
    const rd = await db.gymbro_routine_days.get(String(routineDayId));
    if (rd) {
      const r = await db.gymbro_routines.get(String(rd.data.routine_id));
      title = r ? (r.data.name as string) : "Entreno libre";
    }
  }

  const exRows = await db.gymbro_workout_exercises
    .where("data.workout_id")
    .equals(workoutId)
    .and((d) => d.deletedAt === null)
    .sortBy("data.position")
    .then((rows) =>
      rows.map((r) => ({
        we_id: Number(r.id),
        exercise_id: Number(r.data.exercise_id),
      })),
    );

  const allSets = await db.gymbro_workout_sets.toArray();
  const validSets = allSets.filter((s) => s.deletedAt === null);

  const byExercise = new Map<number, any[]>();
  for (const s of validSets) {
    const weId = Number(s.data.workout_exercise_id);
    const list = byExercise.get(weId) ?? [];
    list.push(s);
    byExercise.set(
      weId,
      list.sort(
        (a, b) => Number(a.data.set_number) - Number(b.data.set_number),
      ),
    );
  }

  exercises = await Promise.all(
    exRows.map(async (ex) => {
      const exData = await db.gymbro_exercises.get(String(ex.exercise_id));
      const rows = byExercise.get(ex.we_id) ?? [];
      const vol = rows.reduce(
        (a: number, s: any) => a + Number(s.data.reps) * Number(s.data.weight),
        0,
      );
      return {
        we_id: ex.we_id,
        name: exData?.data.name ?? "Ejercicio",
        muscle_group_id: Number(exData?.data.muscle_group_id ?? 0),
        sets: rows.map((s: any) => ({
          set_number: Number(s.data.set_number),
          reps: Number(s.data.reps),
          weight: Number(s.data.weight),
        })),
        vol,
      };
    }),
  );
}

onMount(() => {
  void load();
});

const totalVolume = $derived.by(() => {
  let vol = 0;
  for (const ex of exercises) {
    for (const s of ex.sets) {
      vol += s.reps * s.weight;
    }
  }
  return vol;
});
</script>

<svelte:head>
  <title>{title} · GymBro</title>
</svelte:head>

<div class="animate-rise">
  <header class="flex items-center gap-2">
    <a
      href="/gymbro/history"
      aria-label="Volver"
      class="flex h-10 w-10 items-center justify-center rounded-full bg-surface border border-line text-muted"
    >
      <Icon name="chevron-left" size={15} />
    </a>
    <div class="min-w-0">
      <h1 class="truncate text-xl font-bold tracking-tight">{title}</h1>
      <p class="text-xs text-muted capitalize">{formatDateLong(startedAt)}</p>
    </div>
  </header>

  <div class="mx-auto w-full max-w-md px-5 pt-[max(env(safe-area-inset-top),1.25rem)] pb-32">
    <section class="grid grid-cols-3 gap-2.5">
    <div class="card flex flex-col items-center gap-1 p-3.5">
      <span class="text-[10px] font-bold uppercase tracking-widest text-muted">Duración</span>
      <span class="text-lg font-bold">{formatDuration(durationSeconds)}</span>
    </div>
    <div class="card flex flex-col items-center gap-1 p-3.5">
      <span class="text-[10px] font-bold uppercase tracking-widest text-muted">Volumen</span>
      <span class="text-lg font-bold">{formatVolume(totalVolume)}</span>
    </div>
    <div class="card flex flex-col items-center gap-1 p-3.5">
      <span class="text-[10px] font-bold uppercase tracking-widest text-muted">Series</span>
      <span class="text-lg font-bold">{exercises.reduce((a, e) => a + e.sets.length, 0)}</span>
    </div>
  </section>

  {#if endedAt != null}
    <p class="-mt-2 flex items-center justify-center gap-1.5 text-xs text-muted">
      <Icon name="flame" size={14} />
      {formatTime(startedAt)} – {formatTime(endedAt)}
    </p>
  {/if}

  {#if exercises.length === 0}
    <p class="card p-6 text-center text-sm text-muted">
      Entreno sin ejercicios registrados.
    </p>
  {/if}

  {#each exercises as ex}
    <section class="card overflow-hidden">
      <div class="flex items-center gap-2 border-b border-line px-4 py-3">
        <span class="size-1.5 shrink-0 rounded-full bg-accent"></span>
        <h3 class="min-w-0 flex-1 truncate font-semibold">{ex.name}</h3>
        <span class="text-xs font-semibold text-muted">{formatVolume(ex.vol)}</span>
      </div>
      <table class="w-full text-sm">
        <tbody>
          {#each ex.sets as s}
            <tr class="border-b border-line last:border-b-0">
              <td class="px-4 py-2.5 text-xs font-semibold text-muted">S{s.set_number}</td>
              <td class="py-2.5 text-right font-semibold tabular-nums">{s.reps}</td>
              <td class="w-8 py-2.5 text-center text-xs text-muted">×</td>
              <td class="py-2.5 pr-4 font-semibold tabular-nums">{s.weight} kg</td>
            </tr>
          {:else}
            <tr>
              <td colSpan={4} class="px-4 py-3 text-center text-xs text-muted">
                Sin series registradas
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/each}
  </div>
</div>