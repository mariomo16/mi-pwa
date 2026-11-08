<script lang="ts">
import { onMount } from "svelte";
import Icon from "#lib/components/Icon.svelte";
import { syncEngine } from "#lib/core/sync/engine.js";
import { syncState } from "#lib/core/sync/state.svelte.js";

type Props = {
  showButton?: boolean;
};

let { showButton = true }: Props = $props();
let now = $state(Date.now());

onMount(() => {
  const interval = setInterval(() => {
    now = Date.now();
  }, 30_000);
  return () => clearInterval(interval);
});

const status = $derived.by(() => {
  if (syncState.status === "syncing") {
    return {
      label: "Sincronizando",
      detail: "Guardando tus cambios",
      tone: "accent",
    };
  }

  if (syncState.status === "offline") {
    return {
      label: "Sin conexión",
      detail: "Tus datos siguen aquí",
      tone: "muted",
    };
  }

  if (syncState.status === "error") {
    return {
      label: "No se pudo sincronizar",
      detail: syncState.error ?? "Se reintentará automáticamente",
      tone: "danger",
    };
  }

  if (syncState.pending > 0) {
    return {
      label:
        syncState.pending === 1
          ? "1 cambio pendiente"
          : `${syncState.pending} cambios pendientes`,
      detail: "En cola para sincronizar",
      tone: "warning",
    };
  }

  return {
    label: syncState.lastSyncedAt ? "Todo sincronizado" : "Listo",
    detail: syncState.lastSyncedAt
      ? `Actualizado ${relativeTime(syncState.lastSyncedAt, now)}`
      : "Aún sin conexión con el servidor",
    tone: "positive",
  };
});

function relativeTime(timestamp: number, reference: number): string {
  const seconds = Math.max(0, Math.round((reference - timestamp) / 1000));
  if (seconds < 45) return "ahora";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;

  const days = Math.round(hours / 24);
  return days === 1 ? "ayer" : `hace ${days} días`;
}
</script>

<div class="flex items-center gap-2">
  <div class="min-w-0 flex-1">
    <div class="flex items-center gap-2">
      <span
        class={[
          "size-1.5 shrink-0 rounded-full",
          {
            "bg-positive": status.tone === "positive",
            "bg-accent": status.tone === "accent",
            "bg-warning": status.tone === "warning",
            "bg-danger": status.tone === "danger",
            "bg-faint": status.tone === "muted",
            "animate-pulse": syncState.status === "syncing",
          },
        ]}
      ></span>
      <span class="truncate text-[13px] font-medium text-ink">
        {status.label}
      </span>
    </div>
    <p class="mt-0.5 truncate pl-3.5 text-[11px] text-faint" title={status.detail}>
      {status.detail}
    </p>
  </div>

  {#if showButton}
    <button
      type="button"
      class="btn-icon size-8 shrink-0"
      onclick={() => syncEngine.sync()}
      disabled={syncState.status === "syncing"}
      aria-label="Sincronizar ahora"
      title="Sincronizar ahora"
    >
      <Icon
        name="refresh"
        size={15}
        class={syncState.status === "syncing" ? "animate-spin" : ""}
      />
    </button>
  {/if}
</div>
