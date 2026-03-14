<script lang="ts">
  import { page } from '$app/state';

  // https://svelte.dev/docs/kit/$app-navigation

  type NavItem = {
    href: string;
    label: string;
  };

  const navItems: NavItem[] = [
    { href: '/', label: 'Главная' },
    { href: '/articles', label: 'Истории' }
  ];

  const isActive = (href: string, pathname: string): boolean =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);
</script>

<nav id="Nav" class="nav" aria-label="Основная навигация" role="doc-toc">
  <ul itemscope itemtype="SiteNavigationElement">
    {#each navItems as item}
      <li>
        <a
          href={item.href}
          class:active={isActive(item.href, page.url.pathname)}
          aria-current={isActive(item.href, page.url.pathname) ? 'page' : undefined}
          itemprop="url"
        >
          <span itemprop="name">{item.label}</span>
        </a>
      </li>
    {/each}
  </ul>
</nav>
<!-- svelte-ignore a11y_invalid_attribute -->
<a href="#" id="sidenav-close" title="Close Menu" aria-label="Закрыть меню"></a>

<style>
  .nav {
    padding: 1rem 0;
  }

  ul {
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin: 0;
    padding: 0;
  }

  a {
    display: inline-block;
    border-radius: 1e3px;
    /* corner-shape: superellipse(1.25); */
    /* padding: 0.35rem 0.8rem; */
    padding-inline: .3lh;
    padding-block: .2lh .1lh;
    border: 1px solid #0000;

    /* transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease; */
  }

  a:hover {
    border-color: hsl(var(--c-teal));
  }

  a.active {
    /* background: hsl(197 58% 32%); */
    border-color: hsl(var(--c-teal));
    color: hsl(var(--c-teal));
  }
</style>
