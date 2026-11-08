<script lang="ts">
import Icon from "#lib/components/Icon.svelte";
import { themeState, toggleTheme } from "#lib/core/theme.svelte.js";

type Props = {
  showLabel?: boolean;
};

let { showLabel = false }: Props = $props();

const label = $derived(
  themeState.value === "dark"
    ? "Cambiar a tema claro"
    : "Cambiar a tema oscuro",
);
</script>

<button
  type="button"
  class={showLabel
    ? "btn btn-ghost w-full justify-between"
    : "btn-icon size-9"}
  onclick={toggleTheme}
  aria-label={label}
  title={label}
>
  {#if showLabel}
    <span class="text-sm font-medium">Tema</span>
    <span class="flex items-center gap-2 text-sm text-muted">
      {themeState.value === "dark" ? "Oscuro" : "Claro"}
      <Icon name={themeState.value === "dark" ? "sun" : "moon"} size={16} />
    </span>
  {:else}
    <Icon name={themeState.value === "dark" ? "sun" : "moon"} size={17} />
  {/if}
</button>
