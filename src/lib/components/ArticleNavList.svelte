<svelte:options runes={true} />

<script lang="ts">
  import { segmentText, type SplitBy } from '$lib/utils/text-segmentation';

  export type ArticleNavItem = {
    href: string;
    label: string;
    ariaLabel?: string;
  };

  type Props = {
    items?: ArticleNavItem[];
    splitBy?: SplitBy;
  };

  let {
    items = [],
    splitBy = 'chars'
  }: Props = $props();

  const toDisplayText = (value: string) => value.replaceAll(' ', '\u00A0');
</script>

<ol class="list wave">
  {#each items as item, rowIndex (`${item.href}-${rowIndex}`)}
    {@const segments = segmentText(item.label, { splitBy })}
    <li
      style:--animation-order={rowIndex}
      style:--row={rowIndex}
      style:--row-r={items.length - 1 - rowIndex}
    >
      <a href={item.href} aria-label={item.ariaLabel ?? item.label}>
        <span class="sr-only">{item.label}</span>

        <span class="label-fallback" aria-hidden="true">
          <span class="label label-enhanced">
            {#each segments as segment (`${rowIndex}-${segment.i}`)}
              <span class="char" style:--i={segment.i}>
                {toDisplayText(segment.value)}
              </span>
            {/each}
          </span>
        </span>
      </a>
    </li>
  {/each}
</ol>

<style>
  @counter-style date-list {
    system: cyclic;
    symbols:
      "XXXX-2026"
      "1893-1935"
      "1935-1946"
      "1946-1960"
      "1975-1990"
      "1983-1989"
      "1989-1990"
      "2026-XXXX";
    prefix: "~ ";
    suffix: " ->";
  }

  ol.list {
    list-style-type: date-list;
    list-style-position: inside;
  }

  @media (hover) and (prefers-reduced-motion: no-preference) {
    ol.list > li::marker {
      transition: font-weight .25s var(--ease-3);
      font-weight: var(--marker-wght, 300);
    }

    ol.list > li:hover {
      --marker-wght: 900;
    }

    ol.list:hover > li:not(:hover) {
      --marker-wght: 100;
    }
  }
</style>
