<script>
  // https://strapi.io/integrations/svelte-cms

  /** @type {import('./$types').PageProps} */
  let { data } = $props();
</script>

<!-- Post Feed -->
<section class="relpos">
  {#if data.error}
    <p style="color: #9b4d00;">Ошибка загрузки: {data.error}</p>
  {:else if data.articles.length === 0}
    <p>Пока нет опубликованных статей.</p>
  {:else}
    <ul class="grid-rows-masonry grid w-full place-content-start gap-8">
	      {#each data.articles as article (article.documentId || article.title)}
	        {@const articleSlug = article.slug || article.documentId}
	        <li>
	          <figure class="relpos col-span-full overflow-hidden">
	            {#if article.cover}
	              <picture>
	                <img src={article.cover} alt={`Обложка: ${article.title}`}>
	              </picture>
	            {/if}
	          </figure>
	          <article>
	            <header>
	              {#if articleSlug}
	                <a href={`/articles/${encodeURIComponent(articleSlug)}`}>{article.title}</a>
	              {:else}
	                <span>{article.title}</span>
	              {/if}
	            </header>
	            <p>{article.excerpt}</p>
	            <!-- Keep SSR markup deterministic: avoid render-time timestamps. -->
	          </article>
	        </li>
	      {/each}
	    </ul>
	  {/if}
</section>

<style>
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
  /* :where(figure, picture, img, svg) {
    aspect-ratio: var(--ar,4/3);
  } */
</style>
