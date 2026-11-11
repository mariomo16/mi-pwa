<script lang="ts">
import { onMount } from "svelte";
import Icon from "#lib/components/Icon.svelte";
import { db } from "#lib/core/db/index.js";
import { getStoredIdentity } from "#lib/core/identity.js";
import { syncEngine } from "#lib/core/sync/engine.js";

let routines = $state<any[]>([]);
let dayMap = $state(new Map<number, number[]>());

async function load() {
  const identity = getStoredIdentity();
  if (!identity) return;

  const allRoutines = await db.gymbro_routines
    .where("data.owner_id")
    .equalsIgnoreCase(identity.deviceId)
    .sortBy("data.created_at")
    .then((arr) => arr.reverse())
    .then((rows) =>
      rows
        .filter((r) => r.deletedAt === null)
        .map((r) => ({
          id: Number(r.id),
          name: r.data.name as string,
          active: r.data.active === 1 || r.data.active === true,
        })),
    );

  const allDays = await db.gymbro_routine_days
    .where("data.routine_id")
    .above(0)
    .toArray()
    .then((rows) =>
      rows
        .filter((d) => d.deletedAt === null)
        .map((d) => ({
          routine_id: Number(d.data.routine_id),
          weekday: Number(d.data.weekday),
        })),
    );

  const map = new Map<number, number[]>();
  for (const d of allDays) {
    const list = map.get(d.routine_id) ?? [];
    list.push(d.weekday);
    map.set(d.routine_id, list);
  }

  routines = allRoutines;
  dayMap = map;
}

onMount(() => {
  void load();
});

async function deleteRoutine(id: number) {
  if (!window.confirm("¿Borrar esta rutina?")) return;
  await db.gymbro_routines
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

async function toggleActive(id: number, active: boolean) {
  await db.gymbro_routines
    .where("id")
    .equals(String(id))
    .modify((d) => {
      d.data.active = active ? 1 : 0;
      d.dirty = 1;
      d.rev = (d.rev ?? 0) + 1;
    });
  syncEngine.notifyLocalChange();
  await load();
}

const DAYS_SHORT = ["L", "M", "X", "J", "V", "S", "D"];
</script>

<svelte:head>
  <title>Rutinas · GymBro</title>
</svelte:head>

<div class="animate-rise">
  <header class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold tracking-tight">Rutinas</h1>
      <p class="mt-0.5 text-sm text-muted">Planifica tus días de entreno</p>
    </div>
    <a
      href="/gymbro/routines/new"
      class="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-gymbro-ink p-0!"
    >
      <Icon name="plus" size={15} />
    </a>
  </header>

  <div class="mx-auto w-full max-w-md px-5 pt-[max(env(safe-area-inset-top),1.25rem)] pb-32">
    {#if routines.length === 0}
    <div class="card flex flex-col items-center gap-4 p-8 text-center">
      <p class="text-sm text-muted">
        Todavía no tienes rutinas. Crea una eligiendo días y ejercicios.
      </p>
      <a href="/gymbro/routines/new" class="btn btn-primary h-12 gap-2 px-6">
        <Icon name="plus" size={14} /> Nueva rutina
      </a>
    </div>
  {:else}
    <ul class="flex flex-col gap-3">
      {#each routines as r}
        <li>
          <div class="card flex items-center gap-3 p-4">
            <a
              href="/gymbro/routines/{r.id}"
              class="min-w-0 flex-1 active:opacity-80"
            >
              <p class="truncate font-semibold">{r.name}</p>
              <div class="mt-2 flex gap-1">
                {#each DAYS_SHORT as d, wd}
                  <span
                    class={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                      (dayMap.get(r.id) ?? []).includes(wd)
                        ? "bg-accent text-gymbro-ink"
                        : "bg-raised text-muted/50"
                    }`}
                  >
                    {d}
                  </span>
                {/each}
              </div>
            </a>
            <button
              type="button"
              role="switch"
              aria-checked={r.active}
              aria-label={r.active ? "Desactivar rutina" : "Activar rutina"}
              onclick={() => toggleActive(r.id, !r.active)}
              class={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                r.active ? "bg-accent" : "border border-line bg-raised"
              }`}
            >
              <span
                class={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow-sm transition-[left] duration-150 ${
                  r.active ? "left-5.5" : "left-0.5"
                }`}
              ></span>
            </button>
            <Icon name="chevron-right" size={15} class="text-muted shrink-0" />
          </div>
        </li>
      {/each}
    </ul>
  {/if}
  </div>
</div>