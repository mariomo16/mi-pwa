<script lang="ts">
import { onMount } from "svelte";
import Icon from "#lib/components/Icon.svelte";
import {
  formatDateShort,
  formatVolume,
  shiftDaysISO,
  signed,
  todayISO,
} from "#lib/core/dates.js";
import { db } from "#lib/core/db/index.js";
import { getStoredIdentity } from "#lib/core/identity.js";
import { syncEngine } from "#lib/core/sync/engine.js";

let entries = $state<any[]>([]);
let today = $state("");
let weekAvg = $state<number | null>(null);
let prevWeekAvg = $state<number | null>(null);
let monthAvg = $state<number | null>(null);
let prevMonthAvg = $state<number | null>(null);
let latest = $state<any>(null);
let weekDelta = $state<number | null>(null);
let monthDelta = $state<number | null>(null);
let kgInput = $state("");
let error = $state("");
let pending = $state(false);

async function load() {
  const identity = getStoredIdentity();
  if (!identity) return;

  today = todayISO();
  const allEntries = await db.gymbro_body_weights
    .where("data.owner_id")
    .equalsIgnoreCase(identity.deviceId)
    .and((d) => d.deletedAt === null)
    .sortBy("data.date");

  entries = allEntries.map((e) => ({
    id: Number(e.id),
    date: e.data.date as string,
    weight: Number(e.data.weight),
  }));

  const weekFrom = shiftDaysISO(today, -6);
  const prevWeekFrom = shiftDaysISO(today, -13);
  const prevWeekTo = shiftDaysISO(today, -7);
  const monthFrom = shiftDaysISO(today, -29);
  const prevMonthFrom = shiftDaysISO(today, -59);
  const prevMonthTo = shiftDaysISO(today, -30);

  const avgInRange = (from: string, to: string) => {
    const list = entries.filter((e) => e.date >= from && e.date <= to);
    return list.length
      ? list.reduce((a, e) => a + e.weight, 0) / list.length
      : null;
  };

  weekAvg = avgInRange(weekFrom, today);
  prevWeekAvg = avgInRange(prevWeekFrom, prevWeekTo);
  monthAvg = avgInRange(monthFrom, today);
  prevMonthAvg = avgInRange(prevMonthFrom, prevMonthTo);

  latest = entries.length ? entries[entries.length - 1] : null;
  weekDelta =
    weekAvg != null && prevWeekAvg != null ? weekAvg - prevWeekAvg : null;
  monthDelta =
    monthAvg != null && prevMonthAvg != null ? monthAvg - prevMonthAvg : null;
}

onMount(() => {
  void load();
});

async function saveWeight() {
  const weight = Number(kgInput.replace(",", "."));
  if (!Number.isFinite(weight) || weight < 20 || weight > 400) {
    error = "Peso inválido (20–400 kg).";
    return;
  }

  const identity = getStoredIdentity();
  if (!identity) return;

  pending = true;
  try {
    const now = Date.now();
    const existing = await db.gymbro_body_weights
      .where("data.owner_id")
      .equalsIgnoreCase(identity.deviceId)
      .and((d) => d.data.date === today)
      .first();

    if (existing) {
      await db.gymbro_body_weights.update(existing.id, {
        data: { ...existing.data, weight },
        updatedAt: now,
        dirty: 1,
        rev: (existing.rev ?? 0) + 1,
      });
    } else {
      const max = await db.gymbro_body_weights.orderBy("id").last();
      const nextId = (max ? Number(max.id) : 0) + 1;
      await db.gymbro_body_weights.put({
        key: `gymbro_body_weights:${nextId}`,
        collection: "gymbro_body_weights",
        id: String(nextId),
        data: { owner_id: identity.deviceId, date: today, weight },
        updatedAt: now,
        deletedAt: null,
        serverSeq: 0,
        dirty: 1,
        rev: 1,
      });
    }

    syncEngine.notifyLocalChange();
    kgInput = "";
    error = "";
    await load();
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Error al guardar peso";
  } finally {
    pending = false;
  }
}

async function deleteEntry(id: number) {
  if (!window.confirm("¿Borrar este registro?")) return;
  await db.gymbro_body_weights
    .where("id")
    .equals(String(id))
    .modify((d) => {
      d.deletedAt = Date.now();
      d.dirty = 1;
      d.rev = (d.rev ?? 0) + 1;
    });
  syncEngine.notifyLocalChange();
  await load();
}

const withDiff = $derived.by(() =>
  [...entries].reverse().map((e, i, arr) => ({
    ...e,
    diff: i < arr.length - 1 ? e.weight - arr[i + 1].weight : null,
  })),
);

const chartPoints = $derived.by(() => entries.slice(-60));
</script>

<svelte:head>
  <title>Peso corporal · GymBro</title>
</svelte:head>

<div class="animate-rise">
  <header>
    <h1 class="text-2xl font-bold tracking-tight">Peso corporal</h1>
    <p class="mt-0.5 text-sm text-muted">Registra a diario y mira tu evolución</p>
  </header>

  <section class="card p-4">
    <div class="mb-3 flex items-baseline justify-between">
      <h2 class="text-xs font-bold uppercase tracking-widest text-muted">Hoy</h2>
      <span class="text-[11px] text-muted">{entries.length} registros</span>
    </div>
    <div class="flex items-center gap-2">
      <input
        type="number"
        inputmode="decimal"
        placeholder="72.5"
        bind:value={kgInput}
        class="input h-12 pr-9 text-lg font-semibold"
      />
      <span class="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-muted">kg</span>
      <button
        type="button"
        onclick={saveWeight}
        disabled={pending || !kgInput.trim()}
        class="h-12 w-14 shrink-0 rounded-[0.875rem] bg-accent text-gymbro-ink disabled:opacity-40"
      >
        OK
      </button>
    </div>
    {#if error}
      <p class="mt-2 text-xs text-danger">{error}</p>
    {/if}
  </section>

  <section class="grid grid-cols-3 gap-2.5">
    <div class="card flex flex-col items-center gap-1 p-3.5">
      <span class="text-[10px] font-bold uppercase tracking-widest text-muted">Actual</span>
      <span class="text-lg font-bold tabular-nums">
        {latest ? `${latest.weight.toFixed(1)} kg` : "—"}
      </span>
    </div>
    <div class="card flex flex-col items-center gap-1 p-3.5">
      <span class="text-[10px] font-bold uppercase tracking-widest text-muted">Semana</span>
      <span
        class={`text-lg font-bold tabular-nums ${
          weekDelta == null
            ? "text-muted"
            : weekDelta <= 0
              ? "text-positive"
              : "text-danger"
        }`}
      >
        {weekDelta == null ? "—" : signed(weekDelta)}
      </span>
    </div>
    <div class="card flex flex-col items-center gap-1 p-3.5">
      <span class="text-[10px] font-bold uppercase tracking-widest text-muted">Mes</span>
      <span
        class={`text-lg font-bold tabular-nums ${
          monthDelta == null
            ? "text-muted"
            : monthDelta <= 0
              ? "text-positive"
              : "text-danger"
        }`}
      >
        {monthDelta == null ? "—" : signed(monthDelta)}
      </span>
    </div>
  </section>

  <section class="card p-4">
    <h2 class="mb-3 text-xs font-bold uppercase tracking-widest text-muted">Progreso</h2>
    {#if chartPoints.length >= 2}
      {@const weights = chartPoints.map((p) => p.weight)}
      {@const minVal = Math.min(...weights)}
      {@const maxVal = Math.max(...weights)}
      {@const adjMin = maxVal - minVal < 1 ? minVal - 0.5 : minVal - (maxVal - minVal) * 0.1}
      {@const adjMax = maxVal - minVal < 1 ? maxVal + 0.5 : maxVal + (maxVal - minVal) * 0.1}
      {@const linePoints = chartPoints.map((p, i) => {
        const x = 10 + (i * 320) / (chartPoints.length - 1);
        const y = 16 + ((adjMax - p.weight) * 108) / (adjMax - adjMin);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(" ")}
      {@const last = chartPoints[chartPoints.length - 1]}
      {@const lastX = 10 + ((chartPoints.length - 1) * 320) / (chartPoints.length - 1)}
      {@const lastY = 16 + ((adjMax - last.weight) * 108) / (adjMax - adjMin)}
      <div class="h-[140px]">
        <svg
          viewBox="0 0 340 140"
          class="w-full"
          role="img"
          aria-label="Curva de peso"
        >
          <defs>
            <linearGradient id="wc-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#d7f542" stop-opacity="0.28"></stop>
              <stop offset="100%" stop-color="#d7f542" stop-opacity="0"></stop>
            </linearGradient>
          </defs>
          {#each [0.25, 0.5, 0.75] as f}
            <line
              x1={10}
              x2={330}
              y1={16 + f * 108}
              y2={16 + f * 108}
              stroke="rgba(255,255,255,0.06)"
              stroke-dasharray="3 5"
            ></line>
          {/each}
          <path
            d={`M10,124 L${linePoints.split(" ").join(" L")} L330,124 Z`}
            fill="url(#wc-fill)"
          ></path>
          <polyline
            points={linePoints}
            fill="none"
            stroke="#d7f542"
            stroke-width="2"
            stroke-linejoin="round"
            stroke-linecap="round"
          ></polyline>
          <circle cx={lastX} cy={lastY} r="4" fill="#d7f542"></circle>
          <circle cx={lastX} cy={lastY} r="7.5" fill="none" stroke="#d7f542" stroke-opacity="0.35"></circle>
        </svg>
        <div class="mt-1 flex justify-between text-[10px] font-semibold text-muted">
          <span>{chartPoints[0].weight.toFixed(1)} kg</span>
          <span class="text-accent">{last.weight.toFixed(1)} kg</span>
        </div>
      </div>
    {:else}
      <p class="py-8 text-center text-sm text-muted">
        Registra al menos dos días para ver tu curva de progreso.
      </p>
    {/if}
  </section>

  {#if withDiff.length > 0}
    <section class="flex flex-col gap-2">
      <h2 class="px-1 text-[11px] font-bold uppercase tracking-widest text-muted">Registros recientes</h2>
      <ul class="overflow-hidden rounded-[1.25rem] border border-line">
        {#each withDiff.slice(0, 20) as e}
          <li class="flex h-13 items-center gap-3 border-b border-line bg-surface px-4 last:border-b-0">
            <span class="w-20 text-xs font-semibold text-muted">{formatDateShort(e.date)}</span>
            <span class="text-sm font-bold tabular-nums">{e.weight.toFixed(1)} kg</span>
            {#if e.diff != null && e.diff !== 0}
              <span
                class={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                  e.diff < 0
                    ? "bg-positive/10 text-positive"
                    : "bg-danger/10 text-danger"
                }`}
              >
                {e.diff > 0 ? "+" : ""}{e.diff.toFixed(1)}
              </span>
            {/if}
            <button
              type="button"
              onclick={() => deleteEntry(e.id)}
              aria-label="Borrar registro"
              class="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-muted active:bg-raised"
            >
              <Icon name="trash" size={14} />
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</div>