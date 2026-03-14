<svelte:options runes={true} />

<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';

  type Props = {
    dur?: number;
    stepX?: number;
    stepY?: number;
    children?: Snippet;
  };

  let {
    dur = 2000,
    stepX = 48,
    stepY = 96,
    children
  }: Props = $props();

  // no-js
  let isEnhanced = $state(false);

  onMount(() => {
    isEnhanced = true;
  });
</script>

<article
  class="abspos zi-10 font-mono glyph-stagger"
  data-enhanced={isEnhanced ? 'true' : 'false'}
  style:--dur={`${dur}ms`}
  style:--step-x={`${stepX}ms`}
  style:--step-y={`${stepY}ms`}
>
  {@render children?.()}
</article>

<style>
  .glyph-stagger {
    inset-inline-start: 50%;
    inset-block-end: var(--spacer-16x);
    inline-size: min(56ch, 65ch);

    color: var(--nightglo-ng200);
    white-space: pre;

    transform-origin: 0% 105%;
    transform: perspective(500px) translateX(-50%) rotateX(30deg);
  }

  .glyph-stagger :global(a) {
    --wght-base: 300;
    --wght-peak: 900;
    --wght-trough: 130;
    --ease-wave: cubic-bezier(0.2, 0.72, 0.12, 1);

    display: inline;
    color: inherit;
    text-decoration: none;
    white-space: pre;
    font: inherit;
    letter-spacing: inherit;
    line-height: inherit;
    outline: none;
  }

  .glyph-stagger :global(a > span) {
    font: inherit;
    font-weight: var(--wght, 300);
  }

  .glyph-stagger :global(.label) {
    position: relative;
    z-index: 1;
    display: inline;
    pointer-events: none;
  }

  .glyph-stagger :global(.char) {
    --wght: var(--wght-base);

    display: inline-block;
    will-change: font-weight;
  }

  .glyph-stagger[data-enhanced='true'] :global(
    .wave:not(:hover) .label-enhanced .char
  ) {
    animation: glyph-stagger var(--dur) var(--ease-wave) both infinite alternate-reverse;
    animation-delay: calc(
      var(--row) * var(--step-y) + var(--i) * var(--step-x)
    );
  }

  @keyframes glyph-stagger {
    0% {
      font-weight: 300;
    }
    35% {
      font-weight: 450;
    }
    72% {
      font-weight: 100;
    }
    100% {
      font-weight: 300;
    }
  }
</style>
