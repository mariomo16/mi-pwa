<script lang="ts">
import { onMount } from "svelte";
import Icon from "#lib/components/Icon.svelte";
import ThemeToggle from "#lib/components/ThemeToggle.svelte";
import {
  formatClock,
  formatDateLong,
  formatDuration,
  formatVolume,
  todayISO,
} from "#lib/core/dates.js";
import { db } from "#lib/core/db/index.js";
import { formatRepRange } from "#lib/core/format.js";
import {
  getActiveWorkout,
  getDoneRoutineDayIdsToday,
  getNextTrainingDay,
  getRecentWorkouts,
  getRoutineDaysForWeekday,
  getWeightOnDate,
} from "#lib/core/gymbro.js";
import { getStoredIdentity } from "#lib/core/identity.js";
import { syncEngine } from "#lib/core/sync/engine.js";

const DAYS_LONG = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];

let weekday = $state(0);
let today = $state("");
let todaysDays = $state<any[]>([]);
let activeWorkout = $state<any>(null);
let nextDay = $state<{ weekday: number } | null>(null);
let recent = $state<any[]>([]);
let todayWeight = $state<number | null>(null);
let doneDayIds = $state<number[]>([]);
let weightInput = $state("");
let timerNow = $state<number | null>(null);

const doneDays = new Set<number>();

async function load() {
  const identity = getStoredIdentity();
  if (!identity) return;

  const now = new Date();
  weekday = (now.getDay() + 6) % 7;
  today = todayISO(now);

  const [days, workout, next, recents, weight, done] = await Promise.all([
    getRoutineDaysForWeekday(identity.deviceId, weekday),
    getActiveWorkout(identity.deviceId),
    getNextTrainingDay(identity.deviceId),
    getRecentWorkouts(identity.deviceId, 5),
    getWeightOnDate(identity.deviceId, today),
    getDoneRoutineDayIdsToday(identity.deviceId),
  ]);

  todaysDays = days;
  activeWorkout = workout;
  nextDay = next;
  recent = recents;
  todayWeight = weight;
  doneDayIds = done;
  doneDays.clear();
  done.forEach((id) => {
    doneDays.add(id);
  });
}

onMount(() => {
  void load();

  let interval: ReturnType<typeof setInterval>;
  const tick = () => {
    timerNow = Date.now();
  };
  tick();
  interval = setInterval(tick, 1000);
  return () => clearInterval(interval);
});

function shortName(fullName: string): string {
  const parts = fullName.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return fullName;
  return `${parts[0]} ${parts
    .slice(1)
    .map((p) => `${p[0]}.`)
    .join(" ")}`;
}

async function startWorkout(routineDayId: number | null) {
  const identity = getStoredIdentity();
  if (!identity) return;

  const now = Date.now();
  const key = `gymbro_workouts:${now}`;

  await db.gymbro_workouts.put({
    key,
    collection: "gymbro_workouts",
    id: String(now),
    data: {
      owner_id: identity.deviceId,
      routine_day_id: routineDayId,
      started_at: now,
      ended_at: null,
      duration_seconds: null,
    },
    updatedAt: now,
    deletedAt: null,
    serverSeq: 0,
    dirty: 1,
    rev: 1,
  });

  syncEngine.notifyLocalChange();
  location.href = `/gymbro/workout/${now}`;
}

async function saveWeight() {
  const weight = Number(weightInput);
  if (!weight || weight < 20 || weight > 400) return;
  const identity = getStoredIdentity();
  if (!identity) return;

  const now = Date.now();
  await db.gymbro_body_weights.put({
    key: `gymbro_body_weights:${now}`,
    collection: "gymbro_body_weights",
    id: String(now),
    data: { owner_id: identity.deviceId, date: today, weight },
    updatedAt: now,
    deletedAt: null,
    serverSeq: 0,
    dirty: 1,
    rev: 1,
  });

  syncEngine.notifyLocalChange();
  weightInput = "";
  await load();
}
</script>

<svelte:head>
  <title>GymBro — Entrenamiento</title>
</svelte:head>

<div class="animate-rise">
  <header class="flex items-center justify-between">
    <div>
      <p class="text-sm capitalize text-muted">{formatDateLong(new Date().getTime())}</p>
      <h1 class="text-2xl font-bold tracking-tight">Hola</h1>
    </div>
    <ThemeToggle />
  </header>

  <div class="mx-auto w-full max-w-md px-5 pt-[max(env(safe-area-inset-top),1.25rem)] pb-32">
    {#if activeWorkout}
    <a
      href="/gymbro/workout/{activeWorkout.id}"
      class="block rounded-[1.25rem] border border-accent/30 bg-accent-soft p-4"
    >
      <div class="flex items-center justify-between">
        <div>
          <p class="text-xs font-bold uppercase tracking-wider text-accent">Entrenamiento en curso</p>
          <span class="mt-1 font-mono tabular-nums text-2xl font-bold">
            {timerNow != null ? formatClock(timerNow - activeWorkout.started_at) : "--:--"}
          </span>
        </div>
        <span class="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-gymbro-ink">
          <Icon name="chevron-right" size={15} />
        </span>
      </div>
    </a>
  {/if}

  <section class="flex flex-col gap-3 mt-4">
    <h2 class="text-xs font-bold uppercase tracking-widest text-muted">
      Hoy · {DAYS_LONG[weekday]}
    </h2>

    {#if todaysDays.length > 0}
      {#each todaysDays as day}
        <div class="card p-4">
          <p class="font-semibold">{day.routine_name}</p>
          <ul class="mt-2 flex flex-col gap-1.5">
            {#each day.exercises as ex}
              <li class="flex items-center gap-2 text-sm text-muted">
                <span class="size-1.5 shrink-0 rounded-full bg-accent"></span>
                <span class="truncate">{ex.exercise_name}</span>
                {#if ex.target_sets != null}
                  <span class="ml-auto shrink-0 rounded-md bg-raised px-2 py-0.5 text-[11px] font-semibold">
                    {formatRepRange(ex.target_reps_min, ex.target_reps_max)}
                  </span>
                {/if}
              </li>
            {/each}
          </ul>
          <div class="mt-4">
            {#if doneDays.has(day.routine_day_id)}
              <div class="flex h-12 w-full items-center justify-center gap-2 rounded-[0.875rem] bg-raised text-sm font-semibold text-muted">
                <span class="text-accent"><Icon name="check" size={14} /></span>
                Entrenado hoy
              </div>
            {:else if activeWorkout}
              {#if activeWorkout.routine_day_id === day.routine_day_id}
                <a href="/gymbro/workout/{activeWorkout.id}" class="flex h-12 w-full items-center justify-center gap-2 rounded-[0.875rem] bg-accent text-gymbro-ink text-sm font-semibold">
                  <Icon name="play" size={14} /> Continuar entreno
                </a>
              {:else}
                <div class="flex h-12 w-full items-center justify-center rounded-[0.875rem] bg-raised text-sm font-semibold text-muted">
                  Entreno en curso
                </div>
              {/if}
            {:else}
              <button
                onclick={() => startWorkout(day.routine_day_id)}
                class="flex h-12 w-full items-center justify-center gap-2 rounded-[0.875rem] bg-accent text-gymbro-ink text-sm font-semibold"
              >
                <Icon name="play" size={14} /> Empezar entreno
              </button>
            {/if}
          </div>
        </div>
      {/each}
    {:else if nextDay}
      <div class="card flex items-center justify-between p-4">
        <div class="flex items-center gap-3">
          <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-raised text-muted">
            <Icon name="flame" size={15} />
          </span>
          <div>
            <p class="text-sm font-semibold">Hoy no toca entrenar</p>
            <p class="text-xs text-muted">Próximo: {DAYS_LONG[nextDay.weekday]}</p>
          </div>
        </div>
        <div class="flex gap-1">
          {#each ["L", "M", "X", "J", "V", "S", "D"] as d}
            <span class="text-[10px] font-semibold text-muted/60">{d}</span>
          {/each}
        </div>
      </div>
    {:else}
      <p class="card p-4 text-sm text-muted">
        Aún no tienes rutinas.
        <a href="/gymbro/routines/new" class="font-semibold text-accent">Crea una</a>
         o entrena libre.
      </p>
    {/if}

    {#if !activeWorkout}
      <button
        onclick={() => startWorkout(null)}
        class="btn btn-ghost h-12 gap-2 text-sm text-accent"
      >
        <Icon name="plus" size={14} /> Entreno libre
      </button>
    {/if}
  </section>

  <section class="card p-4 relative">
    <div class="mb-3 flex items-baseline justify-between">
      <h2 class="text-xs font-bold uppercase tracking-widest text-muted">Peso de hoy</h2>
      <a href="/gymbro/weight" class="text-xs font-semibold text-accent">Ver progreso</a>
    </div>
    <div class="flex items-center gap-2">
      <input
        type="number"
        inputmode="decimal"
        placeholder="72.5"
        bind:value={weightInput}
        class="input h-12 pr-9 text-lg font-semibold"
      />
      <span class="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-muted">
        kg
      </span>
      <button
        onclick={saveWeight}
        disabled={!weightInput?.trim()}
        class="h-12 w-14 shrink-0 rounded-[0.875rem] bg-accent text-gymbro-ink disabled:opacity-40"
      >
        OK
      </button>
    </div>
  </section>

  {#if recent.length > 0}
    <section class="flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <h2 class="text-xs font-bold uppercase tracking-widest text-muted">
          Últimos entrenos
        </h2>
        <a href="/gymbro/history" class="text-xs font-semibold text-accent">
          Todo el historial
        </a>
      </div>
      {#each recent as w}
        <a href="/gymbro/history/{w.id}" class="card flex items-center gap-3 p-4">
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
      {/each}
    </section>
  {/if}

  {#if recent.length === 0 && !todaysDays.length}
    <a
      href="/gymbro/routines/new"
      class="btn btn-ghost mx-auto mt-6 h-12 gap-2 px-6 text-accent"
    >
      <Icon name="plus" size={14} /> Crear mi primera rutina
    </a>
  {/if}
  </div>
</div>