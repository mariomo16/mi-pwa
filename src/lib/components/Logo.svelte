<script lang="ts">
type Props = {
  size?: number;
  wordmark?: boolean;
  href?: string | null;
};

let { size = 34, wordmark = true, href = "/" }: Props = $props();
</script>

<svelte:element this={href ? "a" : "div"} {href} class="group inline-flex items-center gap-2.5" aria-label="Core">
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    class="shrink-0 transition-transform duration-200 group-hover:-rotate-3"
  >
    <rect width="64" height="64" rx="14.5" fill="var(--ink)" />
    <path
      d="M44 19a18 18 0 1 0 0 26"
      stroke="var(--canvas)"
      stroke-width="5.5"
      stroke-linecap="round"
    />
    <circle cx="32" cy="32" r="5" fill="var(--accent)" />
  </svg>

  {#if wordmark}
    <span
      class="font-serif leading-none tracking-[-0.02em] text-ink"
      style="font-size: {Math.round(size * 0.72)}px"
    >
      Core
    </span>
  {/if}
</svelte:element>
