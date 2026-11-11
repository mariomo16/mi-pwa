<script lang="ts">
import { onMount } from "svelte";
import RoutineBuilderForm from "#lib/components/gymbro/RoutineBuilderForm.svelte";
import Icon from "#lib/components/Icon.svelte";
import { getExercises, getMuscleGroups } from "#lib/core/gymbro.js";

let groups = $state<any[]>([]);
let exercises = $state<any[]>([]);

async function load() {
  [groups, exercises] = await Promise.all([getMuscleGroups(), getExercises()]);
}

onMount(() => {
  void load();
});
</script>

<svelte:head>
  <title>Nueva rutina · GymBro</title>
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
    <h1 class="text-2xl font-bold tracking-tight">Nueva rutina</h1>
  </header>
  <RoutineBuilderForm {groups} {exercises} />
</div>