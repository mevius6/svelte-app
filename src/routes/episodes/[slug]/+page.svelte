<script lang="ts">
  // import Carousel from '$lib/components/Carousel.svelte';

  // import type { PageProps } from './$types';
  /** @type {import('./$types').PageProps} */
  let { data } = $props();

  const ROUTE_PREFIX = '/episodes'
</script>

<svelte:head>
  {#if data.episode?.title}
    <title>{data.episode.title} | Истории</title>
  {:else}
    <title>Статья | Истории</title>
  {/if}
</svelte:head>

<!-- <div class="container relpos"> -->
  <article class="story">
    <p class="back-link">
      <a href={ROUTE_PREFIX}>Назад к списку</a>
    </p>

    <section class="hero">
      {#if data.episode.coverUrl}
        <figure class="relpos">
          <picture>
            <img
              src={data.episode.coverUrl}
              alt={`Обложка: ${data.episode.title}`}
              fetchpriority="high">
          </picture>
        </figure>
      {/if}

      <hgroup class="flex-row">
        <h1>{data.episode.title}</h1>
        {#if data.episode.excerpt}
          <b class="h5 excerpt">{data.episode.excerpt}</b>
        {/if}
      </hgroup>
    </section>

    {#if data.episode.carousel?.length}
      <!-- <Carousel slides={data.episode.carousel} label={`Фотографии: ${data.episode.title}`} /> -->

      <section id="sectPin" style:--total-images={data.episode.carousel.length}>
        <div class="pin-wrap-sticky">
          <div class="pin-wrap">
            <blockquote class="h3">
              Прогуливайтесь в своём темпе. <u>Слушайте, смотрите, чувствуйте!</u> И пусть эта прогулка станет для вас не просто экскурсией, а встречей с живой историей…
            </blockquote>
            {#each data.episode.carousel as slide (slide.image)}
              <figure
                class="relpos"
                style={`aspect-ratio: ${slide.width} / ${slide.height};`}>
                <img
                  src={slide.image}
                  alt={slide.alt || slide.caption || ''}
                  width={slide.width || undefined}
                  height={slide.height || undefined}
                  loading="lazy"
                  decoding="async"
                >
                {#if slide.caption}
                  <figcaption>{slide.caption}</figcaption>
                {/if}
              </figure>
            {/each}
          </div>
        </div>
      </section>
    {/if}

    <!-- {#if data.episode.textBlocks.length > 0}
      <section>
        <article class="flow">
          {#each data.episode.textBlocks as paragraph}
            <p style="font-size: 1.25rem;">{paragraph}</p>
          {/each}
        </article>
      </section>
    {/if} -->
  </article>

  <nav class="nav">
    {#if data.prev}
      <a href={`${ROUTE_PREFIX}/${data.prev.slug}`}>← {data.prev.title}</a>
    {/if}
    {#if data.next}
      <a href={`${ROUTE_PREFIX}/${data.next.slug}`}>{data.next.title} →</a>
    {/if}
  </nav>
<!-- </div> -->

<style>
  article:has(.back-link) {
    display: grid;
    gap: 1rem;

    /* overrides */
    padding: unset;
    max-inline-size: unset;
  }

  section {
    min-block-size: 100dvb;

    /* :where(:has(> article)) */
    /* &:has(> .flow) {
      padding-block: 5vmax;
      padding-inline: 5vmax;

      column-count: 2;
    } */
  }

  .back-link {
    position: fixed;
    margin: var(--spacer-2x);
    padding: .5rlh 2ch;
    z-index: 2;

    text-transform: uppercase;
    background-color: color-mix(
      in oklab, rebeccapurple 75%, var(--background) 25%
    );
  }

  .hero {
    display: grid;
    gap: var(--gutter-spacious-md);
    grid-template-columns: repeat(2, minmax(0, 1fr));
    place-items: center;
    padding-inline: 5vmax;

    & figure {
      grid-area: 1/2;
    }

    & :where(figure, picture, img) {
      /* aspect-ratio: 16 / 9;
      overflow: hidden; */

      height: 90dvb;
      width: auto;
    }

    & hgroup {
      grid-area: 1/1;

      inline-size: 100%;
      display: flex;
      flex-direction: column;
      gap: var(--spacer-2x);
    }
  }

  figure:has(> figcaption) {
    display: grid;
    place-content: center;
    gap: 1rlh;

    & > figcaption {
      /* Hover fallbacks: https://codepen.io/miriamsuzanne/pen/BaEKXpV */
    }
  }

  blockquote:where(.h3) {
    /* max-inline-size: 60cqi; */
    border-inline-start: .75rem solid var(--accent, var(--nightglo-ng200));
    padding-inline-start: 1.25rlh;

    line-height: var(--lh-thinest);
    color: hsl(var(--sw-honeydew));
    text-wrap: balance;
    /* text-transform: uppercase; */

    & > u {
      display: block;
      /* text-decoration-line: underline;
      text-decoration-style: wavy;
      text-decoration-thickness: 2px;
      text-decoration-color: var(--nightglo-ng200); */
    }
  }

  /* Ref: https://scroll-driven-animations.style/demos/horizontal-section/css/ */
  @keyframes move {
    to {
      /* Move horizontally so that right edge is aligned against the viewport */
      transform: translateX(calc(-100% + 100vw));
    }
  }

  #sectPin {
    --total-images: 5;

    /* Stretch it out, so that we create room for the horizontal scroll animation */
    height: 500vh;
    overflow: visible; /* To make position sticky work … */

    view-timeline-name: --section-pin-tl;
    view-timeline-axis: block;
  }

  .pin-wrap-sticky {
    /* Stick to Top */
    height: 100vh;
    width: 100vw;
    position: sticky;
    top: 0;

    width: 100vw;
    overflow-x: hidden;
  }

  .pin-wrap {
    --_total-cols: var(--total-images);
    --_slide-wide: 90vmax;
    --_gutter: 5vmax;

    /* display: grid;
    grid-template-columns: repeat(var(--_total-cols), minmax(0,1fr)); */

    display: flex;
    justify-content: flex-start;
    align-items: center;
    gap: var(--_gutter);
    padding-inline: var(--_gutter);

    height: 100vh;
    min-width: 250vmax;
    width: calc(
      var(--_slide-wide) * (var(--_total-cols) + 1) +
      var(--_gutter) * (var(--_total-cols) + 2)
    );
    background-color: #121212;

    /* Hook animation */
    will-change: transform;
    animation: linear move forwards;

    /* Link animation to view-timeline */
    animation-timeline: --section-pin-tl;
    animation-range: contain 0% contain 100%;

    & :where(figure, picture, img) {
      height: 80vh;
      width: auto;
      max-width: 100%;
      object-fit: cover;
      /* background-color: #222; */
    }

    & img { margin: 0 auto }

    & > * {
      min-width: var(--_slide-wide, 60vmax);
    }
  }
</style>
