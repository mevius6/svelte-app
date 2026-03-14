<script lang="ts">
  import type { SVGAttributes } from 'svelte/elements';

  let { class: className, ...rest }: SVGAttributes<SVGSVGElement> = $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  class={className}
  viewBox="0 0 50 40"
  width="1em"
  height="1em"
  {...rest}
>
  <line x1="5%" x2="95%" y1="20%" y2="20%" />
  <line x1="5%" x2="95%" y1="50%" y2="50%" />
  <line x1="5%" x2="95%" y1="80%" y2="80%" />
</svg>
