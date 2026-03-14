<script lang="ts">
  import type { SVGAttributes } from 'svelte/elements';
  import { icons, type IconName } from '$lib/components/icons';

  type IconProps = {
    name: IconName;
    size?: number | string;
    title?: string;
    class?: string;
  } & SVGAttributes<SVGSVGElement>;

  let {
    name,
    size = '1em',
    title,
    class: className,
    ...rest
  }: IconProps = $props();

  const Component = $derived(icons[name]);
</script>

{#if Component}
  <Component
    width={size}
    height={size}
    class={className}
    aria-hidden={title ? undefined : 'true'}
    aria-label={title}
    role={title ? 'img' : 'presentation'}
    focusable={title ? undefined : 'false'}
    {...rest}
  />
{/if}
