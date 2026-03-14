<script>
  /** @type {import('./$types').PageProps} */
  let { data } = $props();
</script>

<svelte:head>
  {#if data.article?.title}
    <title>{data.article.title} | Истории</title>
  {:else}
    <title>Статья | Истории</title>
  {/if}
</svelte:head>

<!-- <section class="relpos"> -->
  {#if data.error}
    <p style="color: #9b4d00;">Ошибка загрузки: {data.error}</p>
  {:else if !data.article}
    <p>Статья не найдена.</p>
  {:else}
    <article class="article">
      <p class="back-link">
        <a href="/articles">← К ленте</a>
      </p>

      {#if data.article.cover}
        <figure class="relpos overflow-hidden">
          <picture>
            <img src={data.article.cover} alt={`Обложка: ${data.article.title}`}>
          </picture>
        </figure>
      {/if}

      <h1>{data.article.title}</h1>

      {#if data.article.excerpt}
        <p class="excerpt">{data.article.excerpt}</p>
      {/if}

      {#if data.article.textBlocks.length > 0}
        {#each data.article.textBlocks as paragraph}
          <p>{paragraph}</p>
        {/each}
      {/if}
    </article>
  {/if}
<!-- </section> -->

<style>
  .article {
    display: grid;
    gap: 1rem;
  }

  .back-link {
    margin: 0;
  }

  .excerpt {
    font-family: var(--font-serif);
    font-style: italic;
  }
</style>
