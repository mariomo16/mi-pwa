<script lang="ts">
import { onMount } from "svelte";
import { dev } from "$app/env";
import { afterNavigate } from "$app/navigation";
import "./layout.css";
import favicon from "#lib/assets/favicon.svg";
import Icon from "#lib/components/Icon.svelte";
import Logo from "#lib/components/Logo.svelte";
import SettingsDialog from "#lib/components/SettingsDialog.svelte";
import SyncIndicator from "#lib/components/SyncIndicator.svelte";
import ThemeToggle from "#lib/components/ThemeToggle.svelte";
import { loadProfile } from "#lib/core/profile.svelte.js";
import { syncEngine } from "#lib/core/sync/engine.js";
import { initTheme } from "#lib/core/theme.svelte.js";
import { closeSettings, openSettings, uiState } from "#lib/core/ui.svelte.js";
import type { LayoutProps } from "./$types";

let { children }: LayoutProps = $props();

let updateAvailable = $state(false);

onMount(() => {
  initTheme();
  void loadProfile();
  syncEngine.start();

  let cancelled = false;

  if (!dev && "serviceWorker" in navigator) {
    void navigator.serviceWorker.ready
      .then((registration) => {
        if (cancelled) return;

        if (registration.waiting && navigator.serviceWorker.controller) {
          updateAvailable = true;
        }

        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;

          worker.addEventListener("statechange", () => {
            if (
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              updateAvailable = true;
            }
          });
        });
      })
      .catch(() => {
        // The app still works without a service worker.
      });

    void afterNavigate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
    });
  }

  return () => {
    cancelled = true;
    syncEngine.stop();
  };
});

async function applyUpdate(): Promise<void> {
  updateAvailable = false;

  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration?.waiting) {
    window.location.reload();
    return;
  }

  navigator.serviceWorker.addEventListener(
    "controllerchange",
    () => window.location.reload(),
    { once: true },
  );
  registration.waiting.postMessage({ type: "SKIP_WAITING" });
}
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

<div class="min-h-dvh bg-canvas">
  <aside
    class="fixed inset-y-0 left-0 z-30 hidden w-[252px] flex-col border-r border-line bg-surface px-4 py-5 lg:flex"
  >
    <div class="px-2">
      <Logo />
    </div>

    <nav class="mt-9 space-y-1" aria-label="Principal">
      <a
        href="/"
        class="flex items-center gap-3 rounded-xl bg-raised px-3 py-2.5 text-sm font-medium text-ink"
        aria-current="page"
      >
        <Icon name="home" size={17} />
        Inicio
        <span class="ml-auto size-1.5 rounded-full bg-accent"></span>
      </a>

      <div
        class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted opacity-70"
        aria-disabled="true"
      >
        <Icon name="grid" size={17} />
        Proyectos
        <span class="chip ml-auto">Pronto</span>
      </div>
    </nav>

    <div class="mt-auto space-y-3">
      <div class="rounded-card border border-line bg-canvas p-3">
        <SyncIndicator />
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          class="btn btn-ghost flex-1 justify-start"
          onclick={openSettings}
        >
          <Icon name="settings" size={16} />
          Ajustes
        </button>
        <ThemeToggle />
      </div>
    </div>
  </aside>

  <header
    class="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-canvas/85 px-4 py-3 backdrop-blur lg:hidden"
  >
    <Logo size={30} />
    <div class="flex items-center gap-1">
      <ThemeToggle />
    </div>
  </header>

  <main class="lg:pl-[252px]">
    <div
      class="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-16 lg:pt-12"
    >
      {@render children()}
    </div>
  </main>

  <nav
    class="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    aria-label="Principal"
  >
    <div class="mx-auto grid max-w-md grid-cols-3">
      <a
        href="/"
        class="flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium text-accent"
        aria-current="page"
      >
        <Icon name="home" size={19} />
        Inicio
      </a>

      <div
        class="flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium text-faint opacity-60"
        aria-disabled="true"
      >
        <Icon name="grid" size={19} />
        Proyectos
      </div>

      <button
        type="button"
        class={[
          "flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium",
          uiState.settingsOpen ? "text-accent" : "text-faint",
        ]}
        onclick={openSettings}
      >
        <Icon name="settings" size={19} />
        Ajustes
      </button>
    </div>
  </nav>

  {#if updateAvailable}
    <div
      class="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-50 w-[calc(100vw-2rem)] max-w-sm lg:bottom-6"
      role="status"
      aria-live="polite"
    >
      <div
        class="card flex items-center gap-3 border-line-strong p-3 pl-4 shadow-2xl"
      >
        <div class="min-w-0 flex-1">
          <p class="text-sm font-semibold">Nueva versión disponible</p>
          <p class="mt-0.5 text-xs text-muted">
            Actualiza para cargar los últimos cambios.
          </p>
        </div>
        <button
          type="button"
          class="btn btn-primary px-3"
          onclick={() => void applyUpdate()}
        >
          Actualizar
        </button>
        <button
          type="button"
          class="btn-icon size-8"
          onclick={() => (updateAvailable = false)}
          aria-label="Descartar aviso"
        >
          <Icon name="x" size={15} />
        </button>
      </div>
    </div>
  {/if}
</div>

{#if uiState.settingsOpen}
  <SettingsDialog onClose={closeSettings} />
{/if}
