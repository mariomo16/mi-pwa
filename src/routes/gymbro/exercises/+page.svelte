<script lang="ts">
import { onMount } from "svelte";
import Icon from "#lib/components/Icon.svelte";
import { db } from "#lib/core/db/index.js";
import {
  createExercise,
  deleteExercise,
  getExercises,
  getMuscleGroups,
} from "#lib/core/gymbro.js";
import { getStoredIdentity } from "#lib/core/identity.js";
import { syncEngine } from "#lib/core/sync/engine.js";

let groups = $state<any[]>([]);
let exercises = $state<any[]>([]);
let name = $state("");
let groupId = $state(1);
let error = $state("");
let deletingId = $state<number | null>(null);

const grouped = $derived.by(() =>
  groups
    .map((g) => ({
      group: g,
      items: exercises.filter((e) => e.muscle_group_id === g.id),
    }))
    .filter((g) => g.items.length > 0),
);

async function load() {
  [groups, exercises] = await Promise.all([getMuscleGroups(), getExercises()]);
  if (groups.length > 0) groupId = groups[0].id;
}

onMount(() => {
  void load();
});

async function create() {
  error = "";
  const n = name.trim();
  if (n.length < 2 || n.length > 60) {
    error = "El nombre debe tener entre 2 y 60 caracteres.";
    return;
  }
  try {
    await createExercise({ name: n, muscleGroupId: groupId });
    name = "";
    await load();
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Error al crear ejercicio";
  }
}

async function remove(id: number) {
  if (!window.confirm("¿Borrar este ejercicio?")) return;
  deletingId = id;
  try {
    await deleteExercise(id);
    await load();
  } catch (cause) {
    error =
      cause instanceof Error ? cause.message : "Error al borrar ejercicio";
  } finally {
    deletingId = null;
  }
}
</script>

<svelte:head>
  <title>Ejercicios · GymBro</title>
</svelte:head>

<div class="animate-rise">
  <header class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold tracking-tight">Ejercicios</h1>
      <p class="mt-0.5 text-sm text-muted">Biblioteca común por grupo muscular</p>
    </div>
  </header>

  <section class="card p-4">
    <h2 class="mb-3 text-xs font-bold uppercase tracking-widest text-muted">Nuevo ejercicio</h2>
    <input
      value={name}
      oninput={(e) => (name = (e.target as HTMLInputElement).value)}
      placeholder="Nombre (ej. Press banca)"
      maxlength="60"
      class="input mb-2"
    />
    <div class="mb-3 flex gap-2 overflow-x-auto no-scrollbar">
      {#each groups as g}
        <button
          type="button"
          onclick={() => (groupId = g.id)}
          class={`chip h-9 shrink-0 px-3.5 text-xs ${groupId === g.id ? "chip-accent" : ""}`}
        >
          {g.name}
        </button>
      {/each}
    </div>
    {#if error}
      <p class="mb-2 text-xs text-danger">{error}</p>
    {/if}
    <button
      type="button"
      onclick={create}
      disabled={name.trim().length < 2}
      class="btn btn-primary h-12 w-full"
    >
      <Icon name="plus" size={14} /> Crear ejercicio
    </button>
  </section>

  {#if grouped.length === 0}
    <p class="card p-6 text-center text-sm text-muted">
      Todavía no hay ejercicios. Crea el primero arriba.
    </p>
  {/if}

  {#each grouped as { group, items }}
    <section>
      <h2 class="mb-1.5 flex items-center gap-2 px-1 text-[11px] font-bold uppercase tracking-widest text-muted">
        <span class="size-1.5 shrink-0 rounded-full bg-accent"></span>
        {group.name}
        <span class="text-muted/50">· {items.length}</span>
      </h2>
      <ul class="overflow-hidden rounded-[1.25rem] border border-line">
        {#each items as e}
          <li
            class="flex h-13 items-center gap-3 border-b border-line bg-card px-4 last:border-b-0"
          >
            <span class="flex-1 truncate text-sm font-medium">{e.name}</span>
            <button
              type="button"
              onclick={() => remove(e.id)}
              disabled={deletingId === e.id}
              aria-label={`Borrar ${e.name}`}
              class="flex h-9 w-9 items-center justify-center rounded-full text-muted active:bg-raised"
            >
              <Icon name="trash" size={14} />
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/each}
</div>