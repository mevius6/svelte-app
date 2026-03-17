<script lang="ts">
  import type { PageProps } from './$types';

  import Cover from "$lib/components/Cover.svelte";
  import LandscapeShader from '$lib/components/LandscapeViewport.svelte';

  let { data }: PageProps = $props();
</script>

<!--
MARK: Scene I. Intro
-->

<!-- <div
  class="wrapper after-overlay"
  style:--after='var(--gradient-retro)'
  style:--after-stack=30
  style:--after-alpha=.25
  style:--after-blend='screen'
  style:--after-filter='brightness(1) sepia(25%)'
> -->
<div class="wrapper">
  <div
    class="content inset-start zi-20 flex items-center justify-center after-overlay--tile"
    style:--after='var(--noise-subtle)'
    style:--after-alpha=.40
    style:--after-tile=250
    style:--after-blend='screen'
    style:--after-filter='brightness(1) sepia(50%)'
  >
    <!-- <Landscape /> -->
    <!-- <WaterText /> -->

    <!-- WebGL Environment Shader -->
    <LandscapeShader />
</div>

  <!-- CSS Masked Portal -->
  <div class="spot-container zi-40">
    <div class="spot relpos flex h-full w-full items-center">
      <Cover />
    </div>
  </div>
</div>

<style>
  :global(svg[height='0'][aria-hidden='true']) { position: fixed }

  :global([class*='multicol']) {
    grid-template-columns: repeat(auto-fill, minmax(22ch, 1fr));
  }

  /* HDR sunset palette */
  /* .swatch {
    &:nth-child(1) { background: color(display-p3 1 .8 0) }
    &:nth-child(2) { background: color(display-p3 1 .6 0) }
    &:nth-child(3) { background: color(display-p3 1 .45 0) }
    &:nth-child(4) { background: color(display-p3 1 .3 0) }
    &:nth-child(5) { background: color(display-p3 1 .1 0) }
  } */
  /* .gradient-sunset {
    background: linear-gradient(
      in var(--_space, oklch),
      deeppink,
      yellow
    );
  } */

  /*
  MARK:- Layout and STA logic
  */

  /* 1. The runway that creates the scrollbar */
  :global(main:where(:has(> .wrapper))) {
    /* height: 10000vh; */

    --scroll-drama: 700;
    block-size: calc(var(--scroll-drama, 300) * 1svb);
  }

  /* 2. The sticky container stays glued to the screen */
  .wrapper:where(:has(> .spot-container)) {
    /* https://www.smashingmagazine.com/2025/11/keyframes-tokens-standardizing-animation-across-projects/ */
    --anim-zoom-from: 1;
    --anim-zoom-to: 2.5;

    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    /* overflow: clip; */

    > * { position: absolute; }
  }

  /* 3. A visually static background layer */
  .content {
    /* TODO transition sky/water gradient from sunrise to sunset hues */
    --landscape-gradient-intro: linear-gradient(
      #95978a,
      #f4bf77,
      #5b96a2
    );
    --landscape-gradient-outro: linear-gradient(
      rgb(237, 189, 175),
      rgb(227, 150, 111),
      rgb(37, 60, 67)
    );
    --landscape-gradient: radial-gradient(
      circle at 50% 50%,
      oklch(73.7% 0.10735 45.96),
      oklch(67.422% 0.01877 114.097)
    );
    /* toggle off */
    --landscape-gradient: ;

    top: 0;
    height: 100svh;
    /* container-type: size; */

    /* > canvas {…} */
    :global(& > svg) {
      inset-inline-start: 50%;
      min-inline-size: 100cqi;
    }
  }

  /* 4. A visually zoomable foreground layer */
  .spot-container {
    position: sticky;
    top: 0;
    block-size: 100svh;
    overflow: clip;
    pointer-events: none;

    perspective: 1000px;
    transform-style: preserve-3d;
    transform: translate3d(0,0,0); /* GPU trigger */

    @supports (animation-timeline: scroll(root)) {
      @media (prefers-reduced-motion: no-preference) {
        animation: zoom-in linear both;

        /* 5. Link the animation to the root scrollbar */
        animation-timeline: scroll(root block);

        /* the animation is smoothly combined with the existing transform, so the element stays in place and animates as expected. */
        animation-composition: add;

        will-change: transform, opacity;
      }
    }
  }

  /* 6. The scroll-driven keyframes */
  @keyframes zoom-in {
    /* https://www.stefanjudis.com/today-i-learned/css-zoom-to-scale-elements/ */
    0% { /* from */
      transform: scale(1); /* translateZ(0.0001px); */
      filter: blur(0px);
    }
    100% { /* to */
      transform: scale(5); /* translateZ(1000px); */
      filter: blur(5px);
    }
  }
</style>
