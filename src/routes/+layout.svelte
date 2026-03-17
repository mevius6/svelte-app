<script lang="ts">
  import { onNavigate } from '$app/navigation';
  import '../app.css';
  import favicon from '$lib/assets/favicon.svg';
  import Navigation from '$lib/components/Navigation.svelte';
  import { runViewTransition } from '$lib';

  let { children } = $props();

  // const BRAND_NAME_RU = 'Чистые пруды';
  // const YYYY = new Date(Date.now()).getFullYear();
  const HOME_ROUTE_ID = '/';
  const ARTICLES_ROUTE_PREFIX = '/articles';

  const isArticlesRoute = (routeId: string | null | undefined): routeId is string =>
    typeof routeId === 'string' && routeId.startsWith(ARTICLES_ROUTE_PREFIX);

  onNavigate((navigation) => {
    if (navigation.willUnload) return;

    const fromRouteId = navigation.from?.route?.id;
    const toRouteId = navigation.to?.route?.id;
    const shouldAnimate = fromRouteId === HOME_ROUTE_ID && isArticlesRoute(toRouteId);

    if (!shouldAnimate) return;

    return new Promise<void>((resolve) => {
      void runViewTransition(
        async () => {
          resolve();
          await navigation.complete;
        },
        {
          types: ['home-to-article']
        }
      ).catch(() => {
        resolve();
      });
    });
  });
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

<div class="page" itemscope itemtype="https://schema.org/WebPage">
  <aside id="sidenav-open">
    <Navigation />
  </aside>

  <!-- <header id="banner" class="fixpos inset-start zi-40" itemscope itemType="https://schema.org/WPHeader">
    <PageBanner />
  </header> -->

  <main class="grid place-items-center">
    {@render children()}
  </main>

  <!-- <footer class="fixpos inset-end zi-40">
    <ThemeSelect />
    <small class="copr caps fvar micro">
      <span itemprop="name">{BRAND_NAME_RU}</span>
      &nbsp;&copy;&nbsp;
      <time datetime={`${YYYY}`} itemprop="copyrightYear">{YYYY}</time>
    </small>
  </footer> -->
</div>

<style>
  :global(:root) {
    --font-ornaments: "fern";
    --font-sans: "forma", Helvetica;
    --font-serif: "roslindale", Times;

    --shadow-layer: 0 35px 60px -15px rgba(0, 0, 0, 0.3);
  }

  /* :global(body) { font-family: var(--font-system-ui) } */

  :global(.fvar) {
    font-variation-settings:
      "opsz" var(--opsz, 40),
      "wght" var(--wght, 400),
      "ital" var(--ital, 0);

    &.micro {
      --opsz: 8;
      /* --wght: 403.45; */
      --wght: 526.669;
    }
    &.deck {
      --opsz: 40;
      --wght: 400;
    }
    &.text-500 {
      --opsz: 24;
      --wght: 500;
    }
  }

  :global(::view-transition-group(root)) {
    animation-duration: 420ms;
    animation-timing-function: cubic-bezier(0.22, 0.8, 0.24, 1);
  }

  :global(::view-transition-old(root)) {
    animation: page-frame-out 240ms ease-in both;
  }

  :global(::view-transition-new(root)) {
    animation: page-frame-in 420ms cubic-bezier(0.22, 0.8, 0.24, 1) both;
  }

  @keyframes page-frame-out {
    to {
      opacity: 0;
      transform: translateY(-8px) scale(0.985);
      filter: blur(2px);
    }
  }

  @keyframes page-frame-in {
    from {
      opacity: 0;
      transform: translateY(12px) scale(1.01);
      filter: blur(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
      filter: blur(0);
    }
  }

  /* .page {
    max-inline-size: 960px;
    min-block-size: 100dvh;
    margin: 0 auto;
    padding: 0 1rem 2rem;

    display: grid;
    grid-template:
      min-content [head]
      1fr [main]
      min-content [foot] / auto;
  } */
</style>
