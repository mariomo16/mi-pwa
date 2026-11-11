<script lang="ts">
import Icon from "#lib/components/Icon.svelte";
import { DAYS_LONG, DAYS_SHORT } from "#lib/core/dates.js";
import { db } from "#lib/core/db/index.js";
import { getStoredIdentity } from "#lib/core/identity.js";
import { syncEngine } from "#lib/core/sync/engine.js";

const COL_ROUTINES = "gymbro_routines";
const COL_ROUTINE_DAYS = "gymbro_routine_days";
const COL_ROUTINE_EXERCISES = "gymbro_routine_exercises";

type Props = {
  groups: any[];
  exercises: any[];
  initial?: {
    id: number;
    name: string;
    days: {
      weekday: number;
      rows: {
        exercise: any;
        targetSets: number | null;
        targetRepsMin: number | null;
        targetRepsMax: number | null;
      }[];
    }[];
  } | null;
};

let { groups, exercises, initial = null }: Props = $props();

let name = $state(initial?.name ?? "");
let enabledDays = $state<number[]>(
  initial ? initial.days.map((d) => d.weekday).sort((a, b) => a - b) : [],
);
let days = $state<Record<number, any[]>>({});
if (initial) {
  for (const d of initial.days) {
    days[d.weekday] = d.rows.map((row) => ({
      ...row,
      uid: `init${d.weekday}-${row.exercise.id}-${Math.random()}`,
    }));
  }
}
let pickerDay = $state<number | null>(null);
let error = $state("");
let pending = $state(false);
let uidCounter = $state(0);

function nextUid(prefix: string) {
  uidCounter += 1;
  return `${prefix}-${uidCounter}`;
}

function toggleDay(wd: number) {
  error = "";
  if (enabledDays.includes(wd)) {
    enabledDays = enabledDays.filter((d) => d !== wd);
  } else {
    enabledDays = [...enabledDays, wd].sort((a, b) => a - b);
  }
  if (!days[wd]) days = { ...days, [wd]: [] };
}

function addExercise(wd: number, exercise: any) {
  days = {
    ...days,
    [wd]: [
      ...(days[wd] ?? []),
      {
        uid: nextUid(`add${wd}`),
        exercise,
        targetSets: null,
        targetRepsMin: null,
        targetRepsMax: null,
      },
    ],
  };
}

function removeRow(wd: number, index: number) {
  days = {
    ...days,
    [wd]: (days[wd] ?? []).filter((_, i) => i !== index),
  };
}

function bumpField(
  wd: number,
  index: number,
  field: "targetSets",
  max: number,
  delta: number,
) {
  days = {
    ...days,
    [wd]: (days[wd] ?? []).map((row, i) =>
      i === index
        ? {
            ...row,
            [field]:
              Math.min(max, Math.max(0, (row[field] ?? 0) + delta)) || null,
          }
        : row,
    ),
  };
}

function bumpRepsMin(wd: number, index: number, delta: number) {
  days = {
    ...days,
    [wd]: (days[wd] ?? []).map((row, i) => {
      if (i !== index) return row;
      const min =
        Math.min(100, Math.max(0, (row.targetRepsMin ?? 0) + delta)) || null;
      const max =
        min == null || (row.targetRepsMax != null && row.targetRepsMax < min)
          ? min
          : row.targetRepsMax;
      return { ...row, targetRepsMin: min, targetRepsMax: max };
    }),
  };
}

function bumpRepsMax(wd: number, index: number, delta: number) {
  days = {
    ...days,
    [wd]: (days[wd] ?? []).map((row, i) => {
      if (i !== index || row.targetRepsMin == null) return row;
      const next = (row.targetRepsMax ?? row.targetRepsMin) + delta;
      const max = next < row.targetRepsMin ? null : Math.min(100, next);
      return { ...row, targetRepsMax: max };
    }),
  };
}

function moveUp(wd: number, index: number) {
  if (index === 0) return;
  days = {
    ...days,
    [wd]: (() => {
      const rows = [...(days[wd] ?? [])];
      [rows[index - 1], rows[index]] = [rows[index], rows[index - 1]];
      return rows;
    })(),
  };
}

async function save() {
  error = "";
  if (!name.trim()) {
    error = "Ponle un nombre a la rutina.";
    return;
  }
  if (!enabledDays.length) {
    error = "Elige al menos un día.";
    return;
  }
  const emptyDays = enabledDays.filter((wd) => !days[wd]?.length);
  if (emptyDays.length) {
    const names = emptyDays.map((wd) => DAYS_LONG[wd].toLowerCase());
    error =
      emptyDays.length === 1
        ? `Añade ejercicios al ${names[0]}.`
        : `Añade ejercicios a: ${names.join(", ")}.`;
    return;
  }

  pending = true;
  try {
    const identity = getStoredIdentity();
    if (!identity) throw new Error("No hay identidad de dispositivo");

    const input: {
      id: number | undefined;
      name: string;
      days: {
        weekday: number;
        exercises: {
          exerciseId: number;
          targetSets: number | null;
          targetRepsMin: number | null;
          targetRepsMax: number | null;
        }[];
      }[];
    } = {
      id: initial?.id,
      name: name.trim(),
      days: enabledDays.map((wd) => ({
        weekday: wd,
        exercises: (days[wd] ?? []).map((row) => ({
          exerciseId: row.exercise.id,
          targetSets: row.targetSets,
          targetRepsMin: row.targetRepsMin,
          targetRepsMax: row.targetRepsMax,
        })),
      })),
    };

    const now = Date.now();
    let routineId: number;

    if (input.id != null) {
      routineId = input.id;
      await db[COL_ROUTINE_DAYS]
        .where("data.routine_id")
        .equals(routineId)
        .modify((d) => {
          d.deletedAt = Date.now();
          d.dirty = 1;
          d.rev = (d.rev ?? 0) + 1;
        });
      await db[COL_ROUTINES]
        .where("id")
        .equals(String(routineId))
        .modify((d) => {
          d.data.name = input.name;
          d.dirty = 1;
          d.rev = (d.rev ?? 0) + 1;
        });
    } else {
      const max = await db[COL_ROUTINES].orderBy("id").last();
      routineId = (max ? Number(max.id) : 0) + 1;
      const rKey = `gymbro_routines:${routineId}`;
      await db[COL_ROUTINES].put({
        key: rKey,
        collection: COL_ROUTINES,
        id: String(routineId),
        data: {
          owner_id: identity.deviceId,
          name: input.name,
          active: 1,
          created_at: now,
        },
        updatedAt: now,
        deletedAt: null,
        serverSeq: 0,
        dirty: 1,
        rev: 1,
      });
      // Deactivate other routines
      await db[COL_ROUTINES]
        .where("data.owner_id")
        .equalsIgnoreCase(identity.deviceId)
        .and((d) => Number(d.id) !== routineId)
        .modify((d) => {
          d.data.active = 0;
          d.dirty = 1;
          d.rev = (d.rev ?? 0) + 1;
        });
    }

    for (const day of input.days) {
      let maxRd = await db[COL_ROUTINE_DAYS].orderBy("id").last();
      const rdId = (maxRd ? Number(maxRd.id) : 0) + 1;
      const rdKey = `gymbro_routine_days:${rdId}`;
      await db[COL_ROUTINE_DAYS].put({
        key: rdKey,
        collection: COL_ROUTINE_DAYS,
        id: String(rdId),
        data: {
          routine_id: routineId,
          weekday: day.weekday,
        },
        updatedAt: now,
        deletedAt: null,
        serverSeq: 0,
        dirty: 1,
        rev: 1,
      });

      for (const [i, ex] of day.exercises.entries()) {
        let maxRe = await db[COL_ROUTINE_EXERCISES].orderBy("id").last();
        const reId = (maxRe ? Number(maxRe.id) : 0) + 1;
        const reKey = `gymbro_routine_exercises:${reId}`;
        await db[COL_ROUTINE_EXERCISES].put({
          key: reKey,
          collection: COL_ROUTINE_EXERCISES,
          id: String(reId),
          data: {
            routine_day_id: rdId,
            exercise_id: ex.exerciseId,
            position: i,
            target_sets: ex.targetSets,
            target_reps_min: ex.targetRepsMin,
            target_reps_max: ex.targetRepsMax,
          },
          updatedAt: now,
          deletedAt: null,
          serverSeq: 0,
          dirty: 1,
          rev: 1,
        });
      }
    }

    syncEngine.notifyLocalChange();
    window.location.href = "/gymbro/routines";
  } catch (cause) {
    error =
      cause instanceof Error ? cause.message : "Error al guardar la rutina";
  } finally {
    pending = false;
  }
}

function removeRoutine() {
  if (!initial) return;
  if (!window.confirm("¿Borrar esta rutina?")) return;
  pending = true;
  db[COL_ROUTINES]
    .where("id")
    .equals(String(initial.id))
    .modify((d) => {
      d.deletedAt = Date.now();
      d.dirty = 1;
      d.rev = (d.rev ?? 0) + 1;
    })
    .then(() => {
      syncEngine.notifyLocalChange();
      window.location.href = "/gymbro/routines";
    })
    .catch((cause) => {
      error =
        cause instanceof Error ? cause.message : "Error al borrar la rutina";
      pending = false;
    });
}

let searchQuery = $state("");
let creating = $state(false);

const grouped = $derived.by(() => {
  const q = searchQuery.trim().toLowerCase();
  const filtered = q
    ? exercises.filter((e) => e.name.toLowerCase().includes(q))
    : exercises;
  return groups
    .map((g) => ({
      group: g,
      items: filtered.filter((e) => e.muscle_group_id === g.id),
    }))
    .filter((g) => g.items.length > 0);
});

function isPicked(exerciseId: number) {
  return (days[pickerDay ?? -1] ?? []).some(
    (r: any) => r.exercise.id === exerciseId,
  );
}
</script>

<div class="flex flex-col gap-5">
  <section class="card p-4">
    <label
      for="routine-name"
      class="mb-1.5 block text-xs font-bold uppercase tracking-widest text-muted"
    >
      Nombre de la rutina
    </label>
    <input
      id="routine-name"
      bind:value={name}
      placeholder="ej. Torso – Pierna"
      maxlength="60"
      class="input"
    />
  </section>

  <section class="card p-4">
    <h2 class="mb-3 text-xs font-bold uppercase tracking-widest text-muted">
      Días de entrenamiento
    </h2>
    <div class="grid grid-cols-7 gap-1.5">
      {#each DAYS_SHORT as d, wd}
        <button
          type="button"
          onclick={() => toggleDay(wd)}
          aria-pressed={enabledDays.includes(wd)}
          class={`chip h-12 w-full text-sm ${enabledDays.includes(wd) ? "chip-accent" : ""}`}
        >
          {d}
        </button>
      {/each}
    </div>
  </section>

  {#each enabledDays as wd}
    {#key wd}
    <section class="card overflow-hidden">
      <div class="flex items-center justify-between border-b border-line px-4 py-3">
        <h3 class="text-sm font-bold">{DAYS_LONG[wd]}</h3>
        <span class="text-xs text-muted">
          {(days[wd] ?? []).length} ejercicios
        </span>
      </div>

      <ul>
        {#each days[wd] ?? [] as row, i}
          <li class="border-b border-line px-4 py-3 last:border-b-0">
            <div class="flex items-center gap-2">
              <span class="size-1.5 shrink-0 rounded-full bg-accent"></span>
              <span class="min-w-0 flex-1 truncate text-sm font-medium">
                {row.exercise.name}
              </span>
              <button
                type="button"
                onclick={() => removeRow(wd, i)}
                aria-label="Quitar ejercicio"
                class="flex h-8 w-8 items-center justify-center rounded-full text-muted active:bg-raised"
              >
                <Icon name="x" size={14} />
              </button>
            </div>
            <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 pl-4.5">
              <div class="flex items-center gap-2">
                <span class="text-xs text-muted">Series</span>
                <div
                  class="flex items-center gap-1 rounded-full border border-line bg-raised p-0.5"
                >
                  <button
                    type="button"
                    onclick={() => bumpField(wd, i, "targetSets", 15, -1)}
                    aria-label="Bajar"
                    class="flex h-7 w-7 items-center justify-center rounded-full text-muted active:bg-surface"
                  >
                    −
                  </button>
                  <span class="w-8 text-center text-xs font-bold tabular-nums">
                    {row.targetSets ?? "—"}
                  </span>
                  <button
                    type="button"
                    onclick={() => bumpField(wd, i, "targetSets", 15, 1)}
                    disabled={(row.targetSets ?? 0) >= 15 && row.targetSets != null}
                    aria-label="Subir"
                    class="flex h-7 w-7 items-center justify-center rounded-full text-muted active:bg-surface disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-xs text-muted">Reps</span>
                <div
                  class="flex items-center gap-1 rounded-full border border-line bg-raised p-0.5"
                >
                  <button
                    type="button"
                    onclick={() => bumpRepsMin(wd, i, -1)}
                    aria-label="Bajar"
                    class="flex h-7 w-7 items-center justify-center rounded-full text-muted active:bg-surface"
                  >
                    −
                  </button>
                  <span class="w-8 text-center text-xs font-bold tabular-nums">
                    {row.targetRepsMin ?? "—"}
                  </span>
                  <span class="text-xs font-bold text-muted">–</span>
                  <button
                    type="button"
                    onclick={() => bumpRepsMax(wd, i, 1)}
                    disabled={row.targetRepsMin == null}
                    aria-label="Subir"
                    class="flex h-7 w-7 items-center justify-center rounded-full text-muted active:bg-surface disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
              </div>
              <button
                type="button"
                onclick={() => moveUp(wd, i)}
                disabled={i === 0}
                class="ml-auto rounded-lg px-1.5 py-1 text-[10px] font-bold uppercase tracking-wide text-muted disabled:opacity-20"
              >
                ↑
              </button>
            </div>
          </li>
        {/each}
      </ul>

      <button
        type="button"
        onclick={() => (pickerDay = wd)}
        class="chip m-3 h-11 w-[calc(100%-1.5rem)] gap-2 text-sm text-accent"
      >
        <Icon name="plus" size={14} />
        Añadir ejercicio
      </button>
    </section>
    {/key}
  {/each}

  <div class="sticky bottom-24 flex flex-col gap-2">
    {#if error}
      <p role="alert" class="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-medium text-danger shadow-lg">
        {error}
      </p>
    {/if}
    <button
      type="button"
      onclick={save}
      disabled={pending}
      class="btn btn-primary h-13 w-full shadow-xl"
    >
      {#if pending}
        <span class="h-5 w-5 animate-spin rounded-full border-2 border-black/25 border-t-black/70"></span>
      {:else}
        <Icon name="check" size={15} />
        Guardar rutina
      {/if}
    </button>
    {#if initial}
      <button
        type="button"
        onclick={removeRoutine}
        disabled={pending}
        class="btn btn-ghost h-11 w-full text-sm text-danger"
      >
        <Icon name="trash" size={14} />
        Borrar rutina
      </button>
    {/if}
  </div>

  {#if pickerDay != null}
    <div
      class="fixed inset-0 z-50 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onclick={() => (pickerDay = null)}
        class="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <div class="sheet relative mx-auto flex max-h-[82dvh] w-full max-w-md flex-col rounded-t-[1.75rem] border border-line bg-surface">
        <div class="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 class="text-lg font-bold tracking-tight">Elegir ejercicio</h3>
          <button
            type="button"
            onclick={() => (pickerDay = null)}
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
          <button
            type="button"
            onclick={() => (creating = true)}
            class="chip mb-4 h-11 w-full gap-2 px-4 text-sm text-accent"
          >
            <Icon name="plus" size={14} />
            Crear ejercicio nuevo
          </button>

          {#if grouped.length === 0 && !creating}
            <p class="py-8 text-center text-sm text-muted">Sin resultados</p>
          {/if}

          {#each grouped as { group, items }}
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
                      onclick={() => addExercise(pickerDay!, e)}
                      class={`flex h-12 w-full items-center gap-3 border-b border-line px-4 text-left last:border-b-0 ${isPicked(e.id) ? "bg-raised/50" : "bg-surface active:bg-raised"}`}
                    >
                      <span class="size-1.5 shrink-0 rounded-full bg-accent"></span>
                      <span class="flex-1 truncate text-sm">{e.name}</span>
                      {#if isPicked(e.id)}
                        <span class="text-accent"><Icon name="check" size={14} /></span>
                      {/if}
                    </button>
                  </li>
                {/each}
              </ul>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>