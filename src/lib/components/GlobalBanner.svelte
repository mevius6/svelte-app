<script lang="ts">
  import type { HTMLAnchorAttributes } from 'svelte/elements';
  import Icon from '$lib/components/Icon.svelte';
  import type { IconName } from '$lib/components/icons';

  // Global Site Header (site-wide banner)

  type DockItem = {
    id: number;
    text: string;
    href: string;
    icon: IconName;
    attr?: HTMLAnchorAttributes;
  };

  const items: DockItem[] = [
    {
      id: 0,
      text: 'Открыть меню',
      href: '#sidenav-open',
      icon: 'menu',
      attr: { id: 'sidenav-button' }
    },
    {
      id: 1,
      text: 'Главная',
      href: '/',
      icon: 'home'
    },
    {
      id: 2,
      text: 'Контент-студия',
      href: '/admin',
      icon: 'cog',
      attr: {
        target: '_blank',
        rel: 'noopener noreferrer'
      }
    }
  ];
</script>

<!-- <header id="banner" class="pointer-events-none fixed top-0 z-40 flex min-h-11 w-full items-center justify-end"></header> -->

<ul class="fixpos flex w-full items-center justify-center">
  {#each items as item}
    <li>
      <a
        class="link"
        href={item.href}
        title={item.text}
        aria-label={item.text}
        {...item.attr}
      >
        <Icon name={item.icon} class="dock-icon" />
      </a>
    </li>
  {/each}
</ul>

<style>
  ul {
    pointer-events: none;
    inset-block-start: 0;
    inset-inline-start: 0;

    > li { pointer-events: auto }

    @media (width < 30em) {
      display: static;
      margin-inline-end: var(--spacer-4x);
      width: auto;
      height: auto;
      gap: var(--spacer-3x);
    }
  }

  a {
    display: inline-grid;
    place-items: center;
    inline-size: 2.75rem;
    block-size: 2.75rem;
  }

  :global(.dock-icon) {
    inline-size: 1.25rem;
    block-size: 1.25rem;
  }
</style>
