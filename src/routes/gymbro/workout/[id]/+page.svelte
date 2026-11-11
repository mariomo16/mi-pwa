<script lang="ts">
import { onMount } from "svelte";
import Icon from "#lib/components/Icon.svelte";
import { formatClock, formatVolume } from "#lib/core/dates.js";
import { db } from "#lib/core/db/index.js";
import { formatRepRange } from "#lib/core/format.js";
import { getExercises, getMuscleGroups } from "#lib/core/gymbro.js";
import { getStoredIdentity } from "#lib/core/identity.js";
import { syncEngine } from "#lib/core/sync/engine.js";

let workoutId = $state(0);
let startedAt = $state(0);
let title = $state("Entreno libre");
let exercises = $state<any[]>([]);
let allAvailableExercises = $state<any[]>([]);
let collapsed = $state(new Set<number>());
let error = $state("");
let pending = $state(false);
let exerciseSheetOpen = $state(false);
let searchQuery = $state("");
let muscleGroups = $state<any[]>([]);
let timerNow = $state<number | null>(null);

let { params }: { params: { id: string } } = $props();

async function load() {
  workoutId = Number(params.id);
  if (!Number.isInteger(workoutId)) return;

  const identity = getStoredIdentity();
  if (!identity) return;

  [muscleGroups] = await Promise.all([getMuscleGroups()]);

  const workout = await db.gymbro_workouts.get(String(workoutId));
  if (!workout || workout.deletedAt !== null) return;

  startedAt = Number(workout.data.started_at);

  // Resolve title
  if (workout.data.routine_day_id) {
    const rd = await db.gymbro_routine_days.get(
      String(workout.data.routine_day_id),
    );
    if (rd) {
      const r = await db.gymbro_routines.get(String(rd.data.routine_id));
      title = r ? (r.data.name as string) : "Entreno libre";
    }
  }

  const weRows = await db.gymbro_workout_exercises
    .where("data.workout_id")
    .equals(workoutId)
    .sortBy("data.position");

  const targetMap = new Map<
    number,
    { sets: number | null; repsMin: number | null; repsMax: number | null }
  >();
  if (workout.data.routine_day_id) {
    for (const row of await db.gymbro_routine_exercises
      .where("data.routine_day_id")
      .equals(Number(workout.data.routine_day_id))
      .toArray()) {
      targetMap.set(Number(row.data.exercise_id), {
        sets: Number(row.data.target_sets) ?? null,
        repsMin: Number(row.data.target_reps_min) ?? null,
        repsMax: Number(row.data.target_reps_max) ?? null,
      });
    }
  }

  const setsByWe = new Map<number, any[]>();
  const allSets = await db.gymbro_workout_sets.toArray();
  for (const s of allSets) {
    if (s.deletedAt !== null) continue;
    const weId = Number(s.data.workout_exercise_id);
    const list = setsByWe.get(weId) ?? [];
    list.push({
      id: Number(s.id),
      reps: Number(s.data.reps),
      weight: Number(s.data.weight),
    });
    setsByWe.set(
      weId,
      list.sort((a, b) => a.id - b.id),
    );
  }

  exercises = await Promise.all(
    weRows.map(async (we) => {
      const ex = await db.gymbro_exercises.get(String(we.data.exercise_id));
      const t = targetMap.get(Number(we.data.exercise_id));
      return {
        id: Number(we.id),
        exercise_id: Number(we.data.exercise_id),
        name: ex?.data.name ?? "Ejercicio",
        muscle_group_id: Number(ex?.data.muscle_group_id ?? 0),
        position: Number(we.data.position),
        target_sets: t?.sets ?? null,
        target_reps_min: t?.repsMin ?? null,
        target_reps_max: t?.repsMax ?? null,
        rows: (setsByWe.get(Number(we.id)) ?? []).map((s) => ({
          key: `s${s.id}`,
          id: s.id,
          reps: String(s.reps),
          weight: String(s.weight),
          snapReps: String(s.reps),
          snapWeight: String(s.weight),
        })),
      };
    }),
  );
}

onMount(() => {
  void load();
  void getExercises().then((exs) => {
    allAvailableExercises = exs;
  });

  let interval: ReturnType<typeof setInterval>;
  const tick = () => {
    timerNow = Date.now();
  };
  tick();
  interval = setInterval(tick, 1000);
  return () => clearInterval(interval);
});

const totalVolume = $derived.by(() =>
  exercises.reduce(
    (acc: number, we: any) =>
      acc +
      we.rows.reduce(
        (a: number, r: any) =>
          a + (Number(r.snapWeight) || 0) * (Number(r.snapReps) || 0),
        0,
      ),
    0,
  ),
);

const totalSets = $derived.by(() =>
  exercises.reduce(
    (a: number, we: any) => a + we.rows.filter((r: any) => r.id != null).length,
    0,
  ),
);

const usedIds = $derived.by(
  () => new Set(exercises.map((we: any) => we.exercise_id)),
);

const q = $derived.by(() => searchQuery.trim().toLowerCase());

const filteredAvailable = $derived.by(() =>
  allAvailableExercises.filter(
    (e) => !usedIds.has(e.id) && e.name.toLowerCase().includes(q),
  ),
);

const groupedAvailable = $derived.by(() =>
  muscleGroups
    .map((g) => ({
      group: g,
      items: filteredAvailable.filter((e) => e.muscle_group_id === g.id),
    }))
    .filter((g) => g.items.length > 0),
);

async function addExerciseToWorkout(exerciseId: number) {
  const identity = getStoredIdentity();
  if (!identity) return;

  const exercise = await db.gymbro_exercises.get(String(exerciseId));
  if (!exercise) return;

  const now = Date.now();
  const maxPos = exercises.reduce((max, we) => Math.max(max, we.position), -1);
  const weId = now;
  const key = `gymbro_workout_exercises:${weId}`;

  await db.gymbro_workout_exercises.put({
    key,
    collection: "gymbro_workout_exercises",
    id: String(weId),
    data: {
      workout_id: workoutId,
      exercise_id: exerciseId,
      position: maxPos + 1,
    },
    updatedAt: now,
    deletedAt: null,
    serverSeq: 0,
    dirty: 1,
    rev: 1,
  });

  syncEngine.notifyLocalChange();

  const exData = exercise.data as any;
  exercises = [
    ...exercises,
    {
      id: weId,
      exercise_id: exerciseId,
      name: exData.name ?? "Ejercicio",
      muscle_group_id: Number(exData.muscle_group_id ?? 0),
      position: maxPos + 1,
      target_sets: null,
      target_reps_min: null,
      target_reps_max: null,
      rows: [],
    },
  ];

  exerciseSheetOpen = false;
}

function patchRow(
  weId: number,
  key: string,
  patch: Partial<
    { reps: string; weight: string } & { id?: number; key?: string }
  >,
) {
  exercises = exercises.map((we: any) =>
    we.id !== weId
      ? we
      : {
          ...we,
          rows: we.rows.map((r: any) =>
            r.key === key ? { ...r, ...patch } : r,
          ),
        },
  );
}

function addRow(we: any) {
  const lastFilled = [...we.rows].reverse().find((r) => Number(r.reps) > 0);
  const reps = lastFilled?.reps ?? "";
  const weight = lastFilled?.weight ?? "";
  exercises = exercises.map((x) =>
    x.id === we.id
      ? {
          ...x,
          rows: [
            ...x.rows,
            {
              key: `t${Date.now()}-${Math.random()}`,
              id: null,
              reps,
              weight,
              snapReps: "",
              snapWeight: "",
            },
          ],
        }
      : x,
  );
}

async function commit(we: any, row: any) {
  const reps = parseInt(row.reps, 10);
  const weight = parseFloat(row.weight.replace(",", "."));
  if (!Number.isFinite(reps) || reps < 1) return;
  if (!Number.isFinite(weight) || weight < 0) return;
  if (
    row.id != null &&
    row.reps === row.snapReps &&
    row.weight === row.snapWeight
  )
    return;

  pending = true;
  try {
    const identity = getStoredIdentity();
    if (!identity) return;

    const now = Date.now();
    if (row.id != null) {
      await db.gymbro_workout_sets
        .where("id")
        .equals(String(row.id))
        .modify((s) => {
          s.data.reps = reps;
          s.data.weight = weight;
          s.updatedAt = now;
          s.dirty = 1;
          s.rev = (s.rev ?? 0) + 1;
        });
    } else {
      const setNumber = we.rows.filter((r: any) => r.id != null).length + 1;
      const max = await db.gymbro_workout_sets.orderBy("id").last();
      const nextId = (max ? Number(max.id) : 0) + 1;
      await db.gymbro_workout_sets.put({
        key: `gymbro_workout_sets:${nextId}`,
        collection: "gymbro_workout_sets",
        id: String(nextId),
        data: {
          workout_exercise_id: we.id,
          set_number: setNumber,
          reps,
          weight,
        },
        updatedAt: now,
        deletedAt: null,
        serverSeq: 0,
        dirty: 1,
        rev: 1,
      });
    }

    syncEngine.notifyLocalChange();
    patchRow(we.id, row.key, {
      id: row.id ?? 0,
      key: row.id ? row.key : `s${Date.now()}`,
      snapReps: row.reps,
      snapWeight: row.weight,
    } as any);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Error al guardar serie";
  } finally {
    pending = false;
  }
}

function delSet(weId: number, row: any) {
  exercises = exercises.map((we: any) =>
    we.id === weId
      ? { ...we, rows: we.rows.filter((r: any) => r.key !== row.key) }
      : we,
  );
  if (row.id == null) return;
  db.gymbro_workout_sets
    .where("id")
    .equals(String(row.id))
    .modify((s) => {
      s.deletedAt = Date.now();
      s.dirty = 1;
      s.rev = (s.rev ?? 0) + 1;
    })
    .then(() => syncEngine.notifyLocalChange());
}

function removeExercise(we: any) {
  if (!window.confirm(`¿Quitar ${we.name} del entrenamiento?`)) return;
  exercises = exercises.filter((x) => x.id !== we.id);
  db.gymbro_workout_exercises
    .where("id")
    .equals(String(we.id))
    .modify((we) => {
      we.deletedAt = Date.now();
      we.dirty = 1;
      we.rev = (we.rev ?? 0) + 1;
    })
    .then(() => syncEngine.notifyLocalChange());
}

function toggleCollapse(weId: number) {
  if (collapsed.has(weId)) collapsed.delete(weId);
  else collapsed.add(weId);
}

async function finishWorkout() {
  pending = true;
  try {
    const now = Date.now();
    await db.gymbro_workouts
      .where("id")
      .equals(String(workoutId))
      .modify((w) => {
        w.data.ended_at = now;
        w.data.duration_seconds = Math.max(
          1,
          Math.round((now - startedAt) / 1000),
        );
        w.dirty = 1;
        w.rev = (w.rev ?? 0) + 1;
      });
    syncEngine.notifyLocalChange();
    location.href = `/gymbro/history/${workoutId}`;
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Error al finalizar";
  } finally {
    pending = false;
  }
}

async function discardWorkout() {
  if (!window.confirm("¿Descartar este entrenamiento? Se borrará todo."))
    return;
  pending = true;
  try {
    await db.gymbro_workouts.where("id").equals(String(workoutId)).delete();
    await db.gymbro_workout_exercises
      .where("data.workout_id")
      .equals(workoutId)
      .modify((we) => {
        we.deletedAt = Date.now();
        we.dirty = 1;
        we.rev = (we.rev ?? 0) + 1;
      });
    const sets = await db.gymbro_workout_sets.toArray();
    for (const s of sets) {
      if (
        exercises.some((e: any) =>
          e.rows.some((r: any) => r.key === `s${s.id}`),
        )
      ) {
        await db.gymbro_workout_sets
          .where("id")
          .equals(String(s.id))
          .modify((s) => {
            s.deletedAt = Date.now();
            s.dirty = 1;
            s.rev = (s.rev ?? 0) + 1;
          });
      }
    }
    syncEngine.notifyLocalChange();
    location.href = "/gymbro";
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Error al descartar";
  } finally {
    pending = false;
  }
}
</script>

<svelte:head>
  <title>{title} · GymBro</title>
</svelte:head>

<div class="animate-rise">
  <header class="sticky top-0 z-30 border-b border-line bg-surface/90 px-5 pt-3 pb-3 backdrop-blur">
    <div class="flex items-center gap-2">
      <a href="/gymbro" aria-label="Volver" class="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-muted">
        <Icon name="chevron-left" size={15} />
      </a>
      <div class="min-w-0 flex-1 text-center">
        <p class="truncate text-sm font-bold">{title}</p>
        <p class="text-[11px] text-muted">{totalSets} series · {formatVolume(totalVolume)}</p>
      </div>
      <button
        type="button"
        aria-label="Descartar entreno"
        onclick={discardWorkout}
        class="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-muted"
      >
        <Icon name="trash" size={14} />
      </button>
    </div>
    <div class="mt-3 flex flex-col items-center">
      <span class="font-mono tabular-nums text-[44px] leading-none font-bold tracking-tight">
        {timerNow != null ? formatClock(timerNow - startedAt) : "--:--"}
      </span>
      <button
        type="button"
        disabled={pending}
        onclick={finishWorkout}
        class="btn btn-primary mt-3 h-11 w-full max-w-56"
      >
        Finalizar entreno
      </button>
    </div>
  </header>

  <div class="mx-auto w-full max-w-md px-5 pt-[max(env(safe-area-inset-top),1.25rem)] pb-32">
    {#if error}
    <p class="rounded-xl border border-danger/20 bg-danger/10 px-4 py-2.5 text-xs text-danger">{error}</p>
  {/if}

  {#if exercises.length === 0}
    <div class="card p-6 text-center text-sm text-muted">
      Añade ejercicios para empezar a registrar series.
    </div>
  {/if}

  {#each exercises as we}
    <section class="card overflow-hidden">
      <div
        role="button"
        tabindex="0"
        class="flex cursor-pointer items-center gap-2 border-b border-line px-4 py-3 active:bg-raised/50"
        onclick={() => toggleCollapse(we.id)}
      >
        <span class="size-1.5 shrink-0 rounded-full bg-accent"></span>
        <h3 class="min-w-0 flex-1 truncate font-semibold">{we.name}</h3>
        {#if we.target_sets != null && !collapsed.has(we.id)}
          <span class="rounded-md bg-raised px-2 py-0.5 text-[11px] font-semibold text-muted">
            {formatRepRange(we.target_reps_min, we.target_reps_max) ? `objetivo ${we.target_sets} × ${formatRepRange(we.target_reps_min, we.target_reps_max)}` : `objetivo ${we.target_sets} ×`}
          </span>
        {/if}
        {#if collapsed.has(we.id)}
          <span class="text-xs text-muted">{we.rows.filter((r: any) => r.id != null).length}/{we.rows.length} series</span>
          <Icon name="chevron-down" size={14} class="text-muted" />
        {:else}
          <Icon name="chevron-right" size={14} class="text-muted" />
        {/if}
        <button
          type="button"
          onclick={(e) => { e.stopPropagation(); removeExercise(we); }}
          aria-label={`Quitar ${we.name}`}
          class="-mr-1.5 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted active:bg-raised"
        >
          <Icon name="x" size={14} />
        </button>
      </div>

      <div class="collapse-content" data-state={collapsed.has(we.id) ? "collapsed" : "expanded"}>
        <div>
          <ul class="px-3 pt-2">
            {#each we.rows as row, i}
              <li class="mb-1.5 flex items-center gap-2">
                <span
                  class={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${row.id != null && row.reps === row.snapReps && row.weight === row.snapWeight ? "bg-accent-soft text-accent" : "bg-raised text-muted"}`}
                >
                  S{i + 1}
                </span>
                <input
                  value={row.reps}
                  oninput={(e) => patchRow(we.id, row.key, { reps: (e.target as HTMLInputElement).value })}
                  onblur={() => commit(we, row)}
                  onkeydown={(e) => e.key === "Enter" && commit(we, row)}
                  inputmode="numeric"
                  placeholder="reps"
                  aria-label="Repeticiones"
                  class={`input h-11 flex-1 px-3 text-center font-semibold ${row.id != null && row.reps !== row.snapReps ? "border-accent/60" : ""}`}
                />
                <span class="text-muted">×</span>
                <input
                  value={row.weight}
                  oninput={(e) => patchRow(we.id, row.key, { weight: (e.target as HTMLInputElement).value })}
                  onblur={() => commit(we, row)}
                  onkeydown={(e) => e.key === "Enter" && commit(we, row)}
                  inputmode="decimal"
                  placeholder="kg"
                  aria-label="Peso en kg"
                  class={`input h-11 w-20 px-3 text-center font-semibold ${row.id != null && row.weight !== row.snapWeight ? "border-accent/60" : ""}`}
                />
                <button
                  type="button"
                  onclick={() => delSet(we.id, row)}
                  aria-label="Borrar serie"
                  class="flex h-11 w-8 shrink-0 items-center justify-center rounded-xl text-muted/60 active:text-danger"
                >
                  <Icon name="trash" size={14} />
                </button>
              </li>
            {/each}
          </ul>

          <div class="p-3 pt-1">
            <button
              type="button"
              onclick={() => addRow(we)}
              class="chip h-10 w-full gap-1.5 text-sm text-accent"
            >
              <Icon name="plus" size={14} />
              Serie
            </button>
          </div>
        </div>
      </div>
    </section>
  {/each}

  <button
    type="button"
    onclick={() => (exerciseSheetOpen = true)}
    class="btn btn-ghost h-12 gap-2"
  >
    <Icon name="plus" size={14} />
    Añadir ejercicio
  </button>

  {#if exerciseSheetOpen}
    <div
      class="fixed inset-0 z-50 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onclick={() => (exerciseSheetOpen = false)}
        class="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <div class="sheet relative mx-auto flex max-h-[82dvh] w-full max-w-md flex-col rounded-t-[1.75rem] border border-line bg-surface">
        <div class="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 class="text-lg font-bold tracking-tight">Elegir ejercicio</h3>
          <button
            type="button"
            onclick={() => (exerciseSheetOpen = false)}
            aria-label="Cerrar"
            class="flex h-9 w-9 items-center justify-center rounded-full bg-raised text-muted"
          >
            <Icon name="x" size={14} />
          </button>
        </div>

        <div class="px-5 pb-3">
          <div class="relative">
            <input
              bind:value={searchQuery}
              placeholder="Buscar…"
              autoCapitalize="none"
              class="input pl-10"
            />
          </div>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
          {#if groupedAvailable.length === 0}
            <p class="py-8 text-center text-sm text-muted">Sin resultados</p>
          {:else}
            {#each groupedAvailable as { group, items }}
              <div class="mb-4">
                <p class="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted">
                  <span class="size-1.5 shrink-0 rounded-full bg-accent"></span>
                  {group.name}
                </p>
                <ul class="overflow-hidden rounded-2xl border border-line">
                  {#each items as e}
                    <li>
                      <button
                        type="button"
                        onclick={() => addExerciseToWorkout(e.id)}
                        class="flex h-12 w-full items-center gap-3 border-b border-line px-4 text-left last:border-b-0 bg-surface active:bg-raised"
                      >
                        <span class="size-1.5 shrink-0 rounded-full bg-accent"></span>
                        <span class="flex-1 truncate text-sm">{e.name}</span>
                      </button>
                    </li>
                  {/each}
                </ul>
              </div>
            {/each}
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <div class="pb-2"></div>
</div>
</div>