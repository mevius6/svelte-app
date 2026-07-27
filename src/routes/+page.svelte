<script lang="ts">
  import episodes from '$lib/content/data.json'
  import type { PageProps } from './$types';

  // import Cover from "$lib/components/Cover.svelte";
  import LandscapeShader from '$lib/components/LandscapeViewport.svelte';

  let { data }: PageProps = $props();

  const ROUTE_PREFIX = '/episodes'
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
  <!-- <div
    class="content inset-start zi-20 flex items-center justify-center after-overlay--tile"
    style:--after='var(--noise-subtle)'
    style:--after-alpha=.40
    style:--after-tile=250
    style:--after-blend='screen'
    style:--after-filter='brightness(1) sepia(50%)'
  > -->
  <div class="content inset-start zi-20 flex items-center justify-center">
    <!-- WebGL Environment Shader -->
    <LandscapeShader />

    <ul class="abspos grid w-full place-content-center">
      {#each episodes as episode (episode.id || episode.title)}
        {@const articleSlug = episode.slug || episode.id}
        <li class="card flex self-center">
          <!-- <figure class="relpos col-span-full revealing-image overflow-hidden">
            {#if episode.coverUrl}
              <picture>
                <img src={episode.coverUrl} alt={`Обложка: ${episode.title}`}>
              </picture>
            {/if}
          </figure> -->
          <article class="flex flex-col justify-between"
            style:--max-line-length=100%
          >
            <header class="w-full flow">
              <!-- Slug is req -->
              {#if articleSlug}
                <a href={`${ROUTE_PREFIX}/${encodeURIComponent(articleSlug)}`}
                  class="h1">{episode.title}</a>
              {:else}
                <span>{episode.title}</span>
              {/if}
              <p style:color=var(--nightglo-ng200)>{episode.duration}</p>
            </header>
            <!-- <p>{episode.excerpt}</p> -->
            <p class="h4">{episode.description}</p>
          </article>
        </li>
      {/each}
    </ul>
  </div>

  <!-- CSS Masked Portal -->
  <!-- <div class="spot-container zi-40">
    <div class="spot relpos flex h-full w-full items-center">
      <Cover />
    </div>
  </div> -->
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

  ul:where(.grid) {
    position: absolute;
    /* inset: 0; */
    inset-block-start: 0;
    block-size: calc(var(--scroll-drama) * 1svb);

    grid-template-columns: 1;
    grid-template-rows: repeat(8, minmax(auto, 1fr));

    > li {
      inline-size: 90cqi;
      block-size: 90cqb;
    }
    > li:nth-child(1) {grid-row: 1;}
    > li:nth-child(1) {
      backdrop-filter:
        /* hue-rotate(180deg) */
        saturate(2.4)
        contrast(1.3)
        grayscale(.8);
    }
    > li:nth-child(2) {grid-row: 2;}
    > li:nth-child(2) {
      backdrop-filter: sepia(.2) brightness(.9) saturate(.8) contrast(1.2);
    }
    > li:nth-child(3) {grid-row: 3;}
    > li:nth-child(4) {grid-row: 4;}
    > li:nth-child(5) {grid-row: 5;}
    > li:nth-child(5) {
      backdrop-filter: saturate(.1) brightness(.8) contrast(1.4);
    }
    > li:nth-child(6) {grid-row: 6;}
    > li:nth-child(6) {
      backdrop-filter: sepia(.4) brightness(.7) contrast(1.6);
    }
    > li:nth-child(7) {grid-row: 7;}
    > li:nth-child(8) {grid-row: 8;}
  }
  @media (width>=48rem) {
    ul:where(.grid) {
      grid-template-columns: repeat(var(--cols, 2), minmax(25ch, 1fr));

      > li {
        /* margin-inline: 4ric; */
        /* place-self: center; */
        grid-column: 1/-1;
        aspect-ratio: 16/9;

        /* &:nth-child(odd) { grid-column: 1 }
        &:nth-child(even) { grid-column: 2 } */
      }
    }
  }
  /* @media (width>=80rem) {} */

  /* for compact view */
  /* :where(figure, picture, img) {
    aspect-ratio: var(--ar,4/3);
  } */

  .card {
    padding: 4rex 2ch;
    border: 1px solid var(--nightglo-ng200);

    background-color: color-mix(in oklab, var(--surface-2) 12%, #0000);
    /* backdrop-filter: blur(8px); */
    border-radius: 2ch;
    overflow: hidden;

    & > article > header > a {
      color:var(--foreground);
      line-height: 1cap;
    }

    /* & > figure {
      isolation: isolate;
      opacity: 75%;
      & img {
        filter: grayscale(1);
        mix-blend-mode: luminosity;
      }
      & picture {
        background-color: var(--nightglo-ng200);
      }
      &:where(:not(:hover)) {
        filter: brightness(80%) contrast(125%) saturate(75%);
      }
    } */
  }

  /* https://scroll-driven-animations.style/demos/contact-list/css/ */
  @keyframes animate-in-and-out {
    entry 0%  {
      opacity: 0; transform: translateY(100%);
    }
    entry 100%  {
      opacity: 1; transform: translateY(0);
    }

    exit 0% {
      opacity: 1; transform: translateY(0);
    }
    exit 100% {
      opacity: 0; transform: translateY(-100%);
    }
  }

  li {
    animation: linear animate-in-and-out;
    animation-timeline: view();
  }

  /*
  MARK:- Layout and STA logic
  */

  /* 1. The runway that creates the scrollbar */
  :global(main:where(:has(> .wrapper))) {
    /* height: 10000vh; */

    /* NOTE: longer scroll runway for smoother/even phase pacing (dawn/day/sunset) */
    --scroll-drama: 800; /* 100 * [sections num] */
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
