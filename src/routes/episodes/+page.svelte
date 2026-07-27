<script lang="ts">
  import episodes from '$lib/content/data.json'

  // /** @type {import('./$types').PageProps} */
  // let { data } = $props();

  const ROUTE_PREFIX = '/episodes'
</script>

<section class="relpos">
  <h2 class="caps">Все серии</h2>

  {#if episodes.length === 0}
    <p>Пока нет опубликованных материалов.</p>
  {:else}
    <ul class="grid-rows-masonry grid w-full place-content-start gap-8">
      {#each episodes as episode (episode.id || episode.title)}
        {@const articleSlug = episode.slug || episode.id}
        <li class="card">
          <figure class="relpos col-span-full overflow-hidden">
            {#if episode.coverUrl}
              <picture>
                <img src={episode.coverUrl} alt={`Обложка: ${episode.title}`}>
              </picture>
            {/if}
          </figure>
          <article>
            <header>
              <!-- Slug is req -->
              {#if articleSlug}
                <a href={`${ROUTE_PREFIX}/${encodeURIComponent(articleSlug)}`}
                  class="h3">{episode.title}</a>
              {:else}
                <span>{episode.title}</span>
              {/if}
            </header>
            <p>{episode.excerpt}</p>
            <p>{episode.duration}</p>
          </article>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  section {
    margin-block: var(--spacer-4x);
    padding-inline: var(--spacer-7x);
    display: grid;
    grid-template-rows: minmax(auto 1fr);
    gap: var(--spacer-3x);
  }

  ul:where(.grid) {
    grid-template-columns: repeat(auto-fit,minmax(clamp(256px,4vw + 1rem,35ch),1fr));
  }
  @media (width>=48rem) {
    ul:where(.grid) {
      grid-template-columns:repeat(var(--cols,2),minmax(25ch,1fr))
    }
    /* :where(html:has([id*=disclosure i]:checked)) :is(ul:where(.grid)) {
      --cols:3
    } */
  }
  @media (width>=80rem) {
    ul:where(.grid) {
      --cols:3
    }
  }

  /* for compact view */
  /* :where(figure, picture, img) {
    aspect-ratio: var(--ar,4/3);
  } */

  .card {
    background-color: var(--surface-2);
    border-radius: 2ch;
    overflow: hidden;

    & > figure:not(:hover) {
      filter: brightness(80%) contrast(125%) saturate(75%);
    }
  }
</style>
