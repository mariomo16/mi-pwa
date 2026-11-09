<script lang="ts">
import { onMount } from "svelte";
import Icon from "#lib/components/Icon.svelte";
import SyncIndicator from "#lib/components/SyncIndicator.svelte";
import { type DeviceIdentity, getStoredIdentity } from "#lib/core/identity.js";
import { profileState } from "#lib/core/profile.svelte.js";
import { openSettings } from "#lib/core/ui.svelte.js";

let identity = $state<DeviceIdentity | null>(null);

onMount(() => {
  identity = getStoredIdentity();
});

const dateLabel = new Intl.DateTimeFormat("es-ES", {
  weekday: "long",
  day: "numeric",
  month: "long",
}).format(new Date());
const dateText = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);

const greeting = (() => {
  const hour = new Date().getHours();
  if (hour < 6) return "Buenas noches";
  if (hour < 13) return "Buenos días";
  if (hour < 20) return "Buenas tardes";
  return "Buenas noches";
})();

const name = $derived(profileState.data.name.trim());
const firstName = $derived(name.split(/\s+/)[0] ?? "");
const location = $derived(profileState.data.location.trim());
</script>

<svelte:head>
  <title>Core — Tu espacio personal</title>
  <meta
    name="description"
    content="Core es tu espacio personal: perfil, proyectos y datos que siguen contigo incluso sin conexión."
  />
</svelte:head>

<div class="animate-rise">
  <section>
    <p class="eyebrow">{dateText}</p>

    <h1
      class="mt-8 max-w-3xl font-serif text-[clamp(3rem,8vw,5.75rem)] leading-[0.92] tracking-[-0.03em] text-balance"
    >
      {greeting},{#if firstName}
        <span class="italic text-accent">{firstName}</span>.{:else}
        <span class="italic text-accent">qué bueno verte</span>.{/if}
    </h1>

    <div class="mt-8 flex flex-wrap items-center gap-3">
      <button type="button" class="btn btn-ink" onclick={openSettings}>
        {name ? "Editar perfil" : "Completar perfil"}
        <Icon name="arrow-up-right" size={15} />
      </button>
    </div>

    {#if location}
      <p class="mt-8 flex items-center gap-1.5 text-sm text-muted">
        <Icon name="home" size={13} />
        {location}
      </p>
    {/if}
  </section>
</div>

<section class="mt-14 animate-rise-delayed">
  <div class="flex flex-wrap items-end justify-between gap-4">
    <div>
      <p class="eyebrow">Proyectos</p>
      <h2 class="mt-2 font-serif text-4xl tracking-[-0.02em] sm:text-5xl">
        Un núcleo, varios módulos.
      </h2>
    </div>
  </div>

  <div class="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
    <article
      class="relative flex min-h-80 flex-col justify-between overflow-hidden rounded-card border border-gymbro/40 bg-gymbro p-6 text-gymbro-ink transition-transform duration-200 hover:-translate-y-1 sm:p-8"
    >
      <div
        class="pointer-events-none absolute -right-14 -top-20 size-60 rounded-full border border-gymbro-ink/10"
        aria-hidden="true"
      ></div>
      <div
        class="pointer-events-none absolute -right-4 -top-10 size-36 rounded-full border border-gymbro-ink/10"
        aria-hidden="true"
      ></div>

      <div class="relative flex items-start justify-between gap-4">
        <span class="font-mono text-[10px] uppercase tracking-[0.14em] opacity-70">
          Módulo 01
        </span>
        <span
          class="inline-flex items-center rounded-full border border-gymbro-ink/20 bg-gymbro-ink/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em]"
        >
          En preparación
        </span>
      </div>

      <div class="relative mt-16 flex items-end justify-between gap-6">
        <div>
          <h3 class="font-serif text-5xl leading-none tracking-[-0.02em] sm:text-6xl">
            GymBro
          </h3>
          <p class="mt-3 max-w-sm text-sm leading-relaxed opacity-80">
            Entrenamiento, rutinas y progreso. Conectado a tu perfil y a la
            misma sincronización.
          </p>
        </div>
        <div
          class="hidden size-20 shrink-0 items-center justify-center rounded-full border border-gymbro-ink/20 sm:flex"
          aria-hidden="true"
        >
          <Icon name="dumbbell" size={30} />
        </div>
      </div>

      <div
        class="relative mt-8 flex items-center gap-2 border-t border-gymbro-ink/15 pt-4 font-mono text-[10px] uppercase tracking-[0.14em] opacity-70"
      >
        <span class="size-1.5 rounded-full bg-gymbro-ink"></span>
        Próximamente
      </div>
    </article>

    <article
      class="flex min-h-80 flex-col justify-between rounded-card border border-dashed border-line-strong p-6 sm:p-8"
    >
      <div class="flex items-center justify-between">
        <span class="eyebrow">Módulo 02</span>
        <Icon name="plus" size={16} class="text-faint" />
      </div>

      <div>
        <h3 class="font-serif text-3xl leading-tight tracking-[-0.01em] text-muted">
          Lo que venga después
        </h3>
        <p class="mt-2 max-w-xs text-sm leading-relaxed text-muted">
          Cada módulo comparte identidad, almacenamiento local y sync. Sin
          silos.
        </p>
      </div>
    </article>
  </div>
</section>

<section id="sistema" class="mt-14 scroll-mt-24">
  <div class="flex flex-wrap items-end justify-between gap-4">
    <div>
      <p class="eyebrow">Sistema</p>
      <h2 class="mt-2 font-serif text-4xl tracking-[-0.02em]">
        Todo bajo control.
      </h2>
    </div>
  </div>

  <div class="mt-6 overflow-hidden rounded-card border border-line bg-surface">
    <div
      class="grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0"
    >
      <div class="p-5">
        <p class="eyebrow mb-3">Sync</p>
        <SyncIndicator />
      </div>

      <div class="p-5">
        <p class="eyebrow mb-3">Datos</p>
        <div class="flex items-start gap-3">
          <div
            class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-raised text-muted"
          >
            <Icon name="database" size={16} />
          </div>
          <div>
            <p class="text-sm font-medium">IndexedDB local</p>
            <p class="mt-0.5 text-xs text-muted">Funciona sin conexión</p>
          </div>
        </div>
      </div>

      <div class="p-5">
        <p class="eyebrow mb-3">Dispositivo</p>
        <div class="flex items-start gap-3">
          <div
            class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-raised text-muted"
          >
            <Icon name="device" size={16} />
          </div>
          <div class="min-w-0">
            <p class="truncate text-sm font-medium">
              {identity?.name ?? "Este dispositivo"}
            </p>
            <p class="mt-0.5 font-mono text-[10px] tracking-wide text-faint">
              {identity ? identity.deviceId.slice(0, 8) : "local"}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>

</section>

<footer
  class="mt-14 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-5 text-[11px] text-faint"
>
  <span>Core · v0.1.0</span>
</footer>
