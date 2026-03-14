<script lang="ts">
  import type { SVGAttributes } from 'svelte/elements';

  let { class: className, ...rest }: SVGAttributes<SVGSVGElement> = $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width="1em"
  height="1em"
  viewBox="0 0 24 24"
  class={className}
  {...rest}
>
  <g
    fill="none"
    stroke="currentColor"
    stroke-dasharray="16"
    stroke-dashoffset="16"
    stroke-linecap="round"
    stroke-linejoin="round"
    stroke-width="2"
  >
    <path d="M7 7l10 10">
      <animate fill="freeze" attributeName="stroke-dashoffset" dur="0.4s" values="16;0" />
    </path>
    <path d="M17 7l-10 10">
      <animate fill="freeze" attributeName="stroke-dashoffset" begin="0.4s" dur="0.4s" values="16;0" />
    </path>
  </g>
</svg>
