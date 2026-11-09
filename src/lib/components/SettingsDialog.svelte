<script lang="ts">
import { onMount } from "svelte";
import Icon from "#lib/components/Icon.svelte";
import SyncIndicator from "#lib/components/SyncIndicator.svelte";
import ThemeToggle from "#lib/components/ThemeToggle.svelte";
import {
  createBackup,
  downloadBackup,
  importBackup,
} from "#lib/core/backup.js";
import { type DeviceIdentity, getStoredIdentity } from "#lib/core/identity.js";
import { profileState, updateProfile } from "#lib/core/profile.svelte.js";

type Props = {
  onClose?: () => void;
};

let { onClose = () => {} }: Props = $props();

let dialog: HTMLDialogElement | undefined = $state();
let identity = $state<DeviceIdentity | null>(null);
let draft = $state({
  name: profileState.data.name,
  headline: profileState.data.headline,
  location: profileState.data.location,
});
let saving = $state(false);
let saveState = $state<"idle" | "saved" | "error">("idle");
let saveError = $state("");
let exporting = $state(false);
let importing = $state(false);
let restoreIdentity = $state(false);
let importMessage = $state<{ tone: "ok" | "error"; text: string } | null>(null);

onMount(() => {
  identity = getStoredIdentity();

  const previous = document.body.style.overflow;
  document.body.style.overflow = "hidden";

  return () => {
    document.body.style.overflow = previous;
  };
});

function setupDialog(node: HTMLDialogElement) {
  dialog = node;
  node.showModal();

  return () => {
    dialog = undefined;
  };
}

async function save(): Promise<void> {
  saving = true;
  saveState = "idle";
  saveError = "";

  try {
    await updateProfile({
      name: draft.name,
      headline: draft.headline,
      location: draft.location,
    });
    saveState = "saved";
  } catch (cause) {
    saveState = "error";
    saveError =
      cause instanceof Error ? cause.message : "No se pudo guardar el perfil";
  } finally {
    saving = false;
  }
}

async function exportBackup(): Promise<void> {
  exporting = true;
  importMessage = null;

  try {
    const backup = await createBackup();
    downloadBackup(backup);
    importMessage = {
      tone: "ok",
      text: "Copia descargada. Incluye tu credencial de sincronización.",
    };
  } catch {
    importMessage = {
      tone: "error",
      text: "No se pudo crear la copia de seguridad",
    };
  } finally {
    exporting = false;
  }
}

async function handleFile(event: Event): Promise<void> {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  importMessage = null;

  if (file.size > 5_000_000) {
    importMessage = {
      tone: "error",
      text: "El archivo es demasiado grande para ser una copia de Core",
    };
    input.value = "";
    return;
  }

  if (
    restoreIdentity &&
    !window.confirm(
      "Se reemplazarán los datos locales y la credencial de este dispositivo. ¿Continuar?",
    )
  ) {
    input.value = "";
    return;
  }

  importing = true;

  try {
    const parsed = JSON.parse(await file.text()) as unknown;
    const result = await importBackup(parsed, { restoreIdentity });
    importMessage = {
      tone: "ok",
      text:
        result.imported === 1
          ? "1 documento importado"
          : `${result.imported} documentos importados`,
    };
    if (restoreIdentity) identity = getStoredIdentity();
    restoreIdentity = false;
  } catch (cause) {
    importMessage = {
      tone: "error",
      text:
        cause instanceof Error ? cause.message : "No se pudo importar la copia",
    };
  } finally {
    importing = false;
    input.value = "";
  }
}

function close(): void {
  dialog?.close();
}

function handleBackdrop(event: MouseEvent): void {
  if (event.target === dialog) close();
}
</script>

<dialog
  {@attach setupDialog}
  class="m-auto max-h-[90dvh] w-[min(680px,calc(100vw-1.5rem))] overflow-y-auto rounded-card border border-line bg-canvas p-0 text-ink shadow-2xl backdrop:bg-black/45 backdrop:backdrop-blur-[2px]"
  aria-labelledby="settings-title"
  onclose={onClose}
  onclick={handleBackdrop}
>
  <div class="flex min-h-full flex-col">
    <header
      class="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-canvas/95 px-5 py-4 backdrop-blur sm:px-7"
    >
      <div>
        <p class="eyebrow">Core</p>
        <h2 id="settings-title" class="font-serif text-3xl leading-none">
          Ajustes
        </h2>
      </div>
      <button
        type="button"
        class="btn-icon size-9"
        onclick={close}
        aria-label="Cerrar ajustes"
      >
        <Icon name="x" size={18} />
      </button>
    </header>

    <div class="space-y-9 px-5 py-6 sm:px-7">
      <section>
        <div class="mb-3 flex items-center gap-2">
          <Icon name="user" size={15} class="text-muted" />
          <h3 class="eyebrow">Perfil</h3>
        </div>

        <form
          class="space-y-3"
          onsubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block sm:col-span-2">
              <span class="mb-1.5 block text-xs font-medium text-muted">
                Nombre
              </span>
              <input
                class="input"
                bind:value={draft.name}
                maxlength={80}
                autocomplete="name"
                placeholder="¿Cómo te llamas?"
              />
            </label>

            <label class="block">
              <span class="mb-1.5 block text-xs font-medium text-muted">
                Ubicación
              </span>
              <input
                class="input"
                bind:value={draft.location}
                maxlength={80}
                autocomplete="address-level2"
                placeholder="Ciudad"
              />
            </label>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <button type="submit" class="btn btn-primary" disabled={saving}>
              {saving ? "Guardando..." : "Guardar perfil"}
            </button>

            {#if saveState === "saved"}
              <span
                class="flex items-center gap-1 text-xs font-medium text-positive"
                aria-live="polite"
              >
                <Icon name="check" size={13} />
                Guardado
              </span>
            {:else if saveState === "error"}
              <span class="text-xs text-danger" aria-live="polite">
                {saveError}
              </span>
            {/if}
          </div>
        </form>
      </section>

      <section>
        <div class="mb-3 flex items-center gap-2">
          <Icon name="cloud" size={15} class="text-muted" />
          <h3 class="eyebrow">Sincronización</h3>
        </div>

        <div class="card p-4">
          <SyncIndicator />

          <div class="my-4 h-px bg-line"></div>

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

          <p class="mt-4 text-xs leading-relaxed text-muted">
            Core guarda primero en este dispositivo. La copia remota se
            actualiza al cambiar algo, cada minuto y al volver a la app.
          </p>
        </div>
      </section>

      <section>
        <div class="mb-3 flex items-center gap-2">
          <Icon name="database" size={15} class="text-muted" />
          <h3 class="eyebrow">Copia de seguridad</h3>
        </div>

        <div class="card p-4">
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="btn btn-ghost"
              onclick={() => void exportBackup()}
              disabled={exporting}
            >
              <Icon name="download" size={15} />
              {exporting ? "Preparando..." : "Exportar"}
            </button>

            <label class="btn btn-ghost">
              <Icon name="upload" size={15} />
              {importing ? "Importando..." : "Importar"}
              <input
                type="file"
                accept="application/json,.json"
                class="sr-only"
                onchange={handleFile}
                disabled={importing}
              />
            </label>
          </div>

          <label class="mt-4 flex items-start gap-2 text-xs text-muted">
            <input
              type="checkbox"
              class="mt-0.5 size-3.5 shrink-0 accent-accent"
              bind:checked={restoreIdentity}
            />
            <span>
              Restaurar también la credencial del dispositivo. Reemplaza los
              datos locales y vuelve a vincular la copia con el servidor.
            </span>
          </label>

          <div
            class="mt-4 flex items-start gap-2 rounded-xl border border-line bg-raised/60 p-3"
          >
            <Icon name="lock" size={14} class="mt-0.5 shrink-0 text-faint" />
            <p class="text-[11px] leading-relaxed text-muted">
              El archivo incluye tu credencial de sincronización. Guárdalo en
              un lugar seguro: permite acceder a tus datos.
            </p>
          </div>

          {#if importMessage}
            <p
              class={[
                "mt-3 text-xs",
                importMessage.tone === "ok" ? "text-positive" : "text-danger",
              ]}
              aria-live="polite"
            >
              {importMessage.text}
            </p>
          {/if}
        </div>
      </section>

      <section>
        <div class="mb-3 flex items-center gap-2">
          <Icon name="sun" size={15} class="text-muted" />
          <h3 class="eyebrow">Apariencia</h3>
        </div>

        <ThemeToggle showLabel />
      </section>
    </div>

    <footer
      class="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-4 text-[11px] text-faint sm:px-7"
    >
      <span>Core 0.1.0</span>
    </footer>
  </div>
</dialog>
