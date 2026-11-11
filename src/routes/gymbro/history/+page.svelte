<script lang="ts">
import { onMount } from "svelte";
import Icon from "#lib/components/Icon.svelte";
import {
  formatDateLong,
  formatDuration,
  formatVolume,
} from "#lib/core/dates.js";
import { db } from "#lib/core/db/index.js";
import { getStoredIdentity } from "#lib/core/identity.js";

let workouts = $state<any[]>([]);

async function load() {
  const identity = getStoredIdentity();
  if (!identity) return;

  const rows = await db.gymbro_workouts
    .where("data.owner_id")
    .equalsIgnoreCase(identity.deviceId)
    .and((d) => d.data.ended_at !== null)
    .toArray();

  const summaries = await Promise.all(
    rows.map(async (row) => {
      const id = Number(row.id);
      const startedAt = Number(row.data.started_at);
      const endedAt = row.data.ended_at ? Number(row.data.ended_at) : null;
      const allSets = await db.gymbro_workout_sets.toArray();
      const sets = allSets.filter((s) => s.deletedAt === null);
      const weRows = await db.gymbro_workout_exercises
        .where("data.workout_id")
        .equals(id)
        .toArray()
        .then((rows) => rows.filter((r) => r.deletedAt === null));

      const setsForWe = sets.filter((s) =>
        weRows.some((we) => Number(we.id) === s.data.workout_exercise_id),
      );

      const volume = setsForWe.reduce(
        (a: number, s: any) => a + Number(s.data.reps) * Number(s.data.weight),
        0,
      );

      let title: string | null = null;
      if (row.data.routine_day_id) {
        const rd = await db.gymbro_routine_days.get(
          String(row.data.routine_day_id),
        );
        if (rd) {
          const r = await db.gymbro_routines.get(String(rd.data.routine_id));
          title = String(r?.data.name ?? null);
        }
      }

      let durationSeconds = row.data.duration_seconds
        ? Number(row.data.duration_seconds)
        : null;
      if (
        (!durationSeconds || durationSeconds <= 0 || durationSeconds > 86400) &&
        startedAt > 0 &&
        endedAt &&
        endedAt > startedAt
      ) {
        durationSeconds = Math.round((endedAt - startedAt) / 1000);
      }

      return {
        id,
        started_at: startedAt,
        ended_at: endedAt,
        duration_seconds: durationSeconds,
        title,
        volume,
        sets: setsForWe.length,
      };
    }),
  );

  workouts = summaries
    .sort((a: any, b: any) => (b.ended_at ?? b.started_at) - (a.ended_at ?? a.started_at))
    .slice(0, 100);
}

onMount(() => {
  void load();
});
</script>

<svelte:head>
  <title>Historial · GymBro</title>
</svelte:head>

<div class="animate-rise">
  <header>
    <h1 class="text-2xl font-bold tracking-tight">Historial</h1>
    <p class="mt-0.5 text-sm text-muted">
      {workouts.length > 0 ? `${workouts.length} entrenamientos` : "Aún no hay entrenos"}
    </p>
  </header>

  <div class="mx-auto w-full max-w-md px-5 pt-[max(env(safe-area-inset-top),1.25rem)] pb-32">
    {#each workouts as w}
    <section class="flex flex-col gap-2">
      <h2 class="px-1 text-[11px] font-bold uppercase tracking-widest text-muted">
        {w.started_at > 0 ? new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(new Date(w.started_at)).charAt(0).toUpperCase() : "Sin fecha"}
      </h2>
      <a href="/gymbro/history/{w.id}" class="card flex items-center gap-3 p-4 active:bg-raised">
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold">{w.title ?? "Entreno libre"}</p>
          <p class="mt-0.5 text-xs text-muted">
            {formatDateLong(w.started_at)} · {formatDuration(w.duration_seconds)}
          </p>
        </div>
        <div class="text-right">
          <p class="text-sm font-semibold">{formatVolume(w.volume)}</p>
          <p class="text-[11px] text-muted">{w.sets} series</p>
        </div>
        <Icon name="chevron-right" size={14} class="text-muted" />
      </a>
    </section>
  {/each}

  {#if workouts.length === 0}
    <div class="card p-6 text-center text-sm text-muted">
      Cuando termines tu primer entrenamiento aparecerá aquí.
    </div>
  {/if}
  </div>
</div>