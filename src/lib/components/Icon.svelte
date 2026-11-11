<script lang="ts">
type IconName =
  | "alert"
  | "arrow-right"
  | "arrow-up-right"
  | "check"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
  | "clock"
  | "cloud"
  | "database"
  | "device"
  | "download"
  | "dumbbell"
  | "flame"
  | "grid"
  | "home"
  | "lock"
  | "moon"
  | "offline"
  | "play"
  | "plus"
  | "refresh"
  | "settings"
  | "shield"
  | "sparkles"
  | "sun"
  | "trash"
  | "upload"
  | "user"
  | "x";

type Props = {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  class?: string;
};

let {
  name,
  size = 18,
  strokeWidth = 1.8,
  class: className = "",
}: Props = $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  class={className}
  aria-hidden="true"
  focusable="false"
>
  {#if name === "home"}
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
    <path d="M9 21v-6h6v6" />
  {:else if name === "grid"}
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  {:else if name === "settings"}
    <path d="M4 6h9" />
    <path d="M17 6h3" />
    <circle cx="15" cy="6" r="2" />
    <path d="M4 12h3" />
    <path d="M11 12h9" />
    <circle cx="9" cy="12" r="2" />
    <path d="M4 18h7" />
    <path d="M15 18h5" />
    <circle cx="13" cy="18" r="2" />
  {:else if name === "refresh"}
    <path d="M20 11a8 8 0 1 0-2.3 5.7" />
    <path d="M20 4v7h-7" />
  {:else if name === "sun"}
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
  {:else if name === "moon"}
    <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5Z" />
  {:else if name === "arrow-up-right"}
    <path d="M7 17 17 7" />
    <path d="M8 7h9v9" />
  {:else if name === "arrow-right"}
    <path d="M4 12h16" />
    <path d="m14 6 6 6-6 6" />
  {:else if name === "chevron-left"}
    <path d="m15 6-6 6 6 6" />
  {:else if name === "chevron-down"}
    <path d="m6 9 6 6 6-6" />
  {:else if name === "flame"}
    <path d="M12 3s5.5 4.2 5.5 9a5.5 5.5 0 0 1-11 0c0-1.8.8-3.4 1.8-4.7.3 1 .9 1.9 1.9 2.2C10.5 7.6 12 3 12 3Z" />
  {:else if name === "play"}
    <path d="M8.5 5.8c0-.9 1-1.5 1.8-1L18.4 9c.8.5.8 1.6 0 2l-8.1 5.2c-.8.5-1.8-.1-1.8-1Z" fill="currentColor" />
  {:else if name === "trash"}
    <path d="M4.5 7h15" />
    <path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
    <path d="M6.5 7 7.4 19a2 2 0 0 0 2 1.9h5.2a2 2 0 0 0 2-1.9L17.5 7" />
    <path d="M10 11v6M14 11v6" />
  {:else if name === "check"}
    <path d="m4 12 5 5L20 6" />
  {:else if name === "offline"}
    <path d="M3 3l18 18" />
    <path d="M8.5 16.5a5 5 0 0 1 7 0" />
    <path d="M5 12.5a10 10 0 0 1 3-2" />
    <path d="M16 10.5a10 10 0 0 1 3 2" />
    <path d="M2 9a15 15 0 0 1 4-2.5" />
    <path d="M18 6.5A15 15 0 0 1 22 9" />
    <circle cx="12" cy="20" r=".6" fill="currentColor" stroke="none" />
  {:else if name === "alert"}
    <path d="M12 3 2.5 20h19L12 3Z" />
    <path d="M12 9v5" />
    <circle cx="12" cy="17.2" r=".6" fill="currentColor" stroke="none" />
  {:else if name === "download"}
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M4 20h16" />
  {:else if name === "upload"}
    <path d="M12 21V9" />
    <path d="m7 14 5-5 5 5" />
    <path d="M4 4h16" />
  {:else if name === "x"}
    <path d="M6 6l12 12M18 6 6 18" />
  {:else if name === "device"}
    <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
    <path d="M11 18.5h2" />
  {:else if name === "lock"}
    <rect x="4" y="10" width="16" height="11" rx="2.5" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  {:else if name === "shield"}
    <path d="M12 3 4.5 6v5.5c0 5 3.2 8 7.5 9.5 4.3-1.5 7.5-4.5 7.5-9.5V6L12 3Z" />
    <path d="m9 12 2 2 4-4" />
  {:else if name === "plus"}
    <path d="M12 5v14M5 12h14" />
  {:else if name === "dumbbell"}
    <path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10M2 10v4M22 10v4" />
  {:else if name === "clock"}
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  {:else if name === "database"}
    <ellipse cx="12" cy="5" rx="8" ry="3" />
    <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
    <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
  {:else if name === "cloud"}
    <path d="M7 18a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 9.5 3.5 3.5 0 0 1 17.5 18H7Z" />
  {:else if name === "sparkles"}
    <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z" />
    <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" />
  {:else if name === "user"}
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
  {/if}
</svg>
