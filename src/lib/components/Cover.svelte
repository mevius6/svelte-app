<script lang="ts">
  import StarFrame from "./StarFrame.svelte";

  //#region presets
  const preset1 = `\
    SSSSSwSSSSS\n
    SSSIThRPSSS\n
    SSSSTjRSSSS\n
    SOSQThRESOS\n
    SFFFSLSGGGS\n
    ayuyPwIuyud\n
    SRRRSOSTTTS\n
    SLSZGjFCSLS\n
    SSSSGhFSSSS\n
    SSSIGjFPSSS\n
    SSSSSxSSSSS`
  const preset2 = `\
    RHJTRHJTRHJT\n
    hrtjhrtjhrtj\n
    jfghjfghjfgh\n
    FJHGFJHGFJHG\n
    RHJTRHJTRHJT\n
    hrtjhrtjhrtj\n
    jfghjfghjfgh\n
    FJHGFJHGFJHG\n
    RHJTRHJTRHJT\n
    hrtjhrtjhrtj\n
    jfghjfghjfgh\n
    FJHGFJHGFJHG`
  const preset3 = `\
    RFRFRFRFRFRF
    TGTGTGTGTGTG
    RFRFRFRFRFRF
    TGTGTGTGTGTG
    RFRFRFRFRFRF
    TGTGTGTGTGTG
    RFRFRFRFRFRF
    TGTGTGTGTGTG
    RFRFRFRFRFRF
    TGTGTGTGTGTG
    RFRFRFRFRFRF
    TGTGTGTGTGTG`
  const preset4 = `\
    QWWWWWWWWWWE
    AVOOOOOOOOBD
    AIRTYURTYUPD
    AIUYFGUYFGPD
    AIYURTYURTPD
    AIFGUYFGUYPD
    AIRTYURTYUPD
    AIUYFGUYFGPD
    AIYURTYURTPD
    AIFGUYFGUYPD
    ABLLLLLLLLVD
    ZXXXXXXXXXXC`
  const preset5ext = `\
    SqwwwwwwwweS
    qQWWWWWWWWEe
    aAvvvvbbbbDd
    aAvvvvbbbbDd
    aAvvvvbbbbDd
    aAvvvvbbbbDd
    aAbbbbvvvvDd
    aAbbbbvvvvDd
    aAbbbbvvvvDd
    aAbbbbvvvvDd
    zZXXXXXXXXCc
    SzxxxxxxxxcS`
  const preset5min = `\
    QWWWWWWWWE
    AvvvvbbbbD
    AvvvvbbbbD
    AvvvvbbbbD
    AvvvvbbbbD
    AbbbbvvvvD
    AbbbbvvvvD
    AbbbbvvvvD
    AbbbbvvvvD
    ZXXXXXXXXC`
  const preset6 = `\
    qyuyuyuyuyuyuyuyuyuyuyue
    jRTRTRTRTRTRTRTRTRTRTRTh
    hFGFGFGFGFGFGFGFGFGFGFGj
    jRTRTRTRTRTRTRTRTRTRTRTh
    hFGFGFGFGFGFGFGFGFGFGFGj
    jRTRTRTRTRTRTRTRTRTRTRTh
    hFGFGFGFGFGFGFGFGFGFGFGj
    jRTRTRTRTRTRTRTRTRTRTRTh
    hFGFGFGFGFGFGFGFGFGFGFGj
    jRTRTRTRTRTRTRTRTRTRTRTh
    hFGFGFGFGFGFGFGFGFGFGFGj
    jRTRTRTRTRTRTRTRTRTRTRTh
    hFGFGFGFGFGFGFGFGFGFGFGj
    jRTRTRTRTRTRTRTRTRTRTRTh
    hFGFGFGFGFGFGFGFGFGFGFGj
    jRTRTRTRTRTRTRTRTRTRTRTh
    hFGFGFGFGFGFGFGFGFGFGFGj
    jRTRTRTRTRTRTRTRTRTRTRTh
    hFGFGFGFGFGFGFGFGFGFGFGj
    jRTRTRTRTRTRTRTRTRTRTRTh
    hFGFGFGFGFGFGFGFGFGFGFGj
    jRTRTRTRTRTRTRTRTRTRTRTh
    hFGFGFGFGFGFGFGFGFGFGFGj
    zuyuyuyuyuyuyuyuyuyuyuyc`
  const preset7 = `\
    SqwwwwwwwweS
    qQWWWWWWWWEe
    aAvvvvbbbbDd
    aAbbbbvvvvDd
    aAvvvvbbbbDd
    aAbbbbvvvvDd
    aAvvvvbbbbDd
    aAbbbbvvvvDd
    aAvvvvbbbbDd
    aAbbbbvvvvDd
    zZXXXXXXXXCc
    SzxxxxxxxxcS`
  const divider = `\
    QFFYFPwIYFwGFwGFwGFwGUPwIGUGGE\n
    ZRRURPxIURxTRxTRxTRxTYPxITYTTC`
  //#endregion
  const pattern = preset5min
</script>

<div class="pile m-auto" style="aspect-ratio: 1;">
  <StarFrame />

  <div aria-hidden="true" class="ornament self-center text-center">
    {pattern}
  </div>

  <hgroup class="m-auto flex flex-col items-center justify-between text-center">
    <h1 class="text-center w-full">
      <span class="block fvar">Прогулка</span>
      <span class="block fvar"> в </span>
      <span class="block fvar">прошлое</span>
    </h1>

    <p class="lead self-center caps" role="doc-subtitle">
      Познакомьтесь с историей парка<br/>
      через рассказы местных жителей.
    </p>
  </hgroup>
</div>

<style>
  :where(.ornament) {
    /* --ornament-color: var(--sw-pale-moss); */
    --ornament-color: var(--bm-misted-fern);
    /* --ornament-color: var(--bm-bed-of-ferns); */

    /* TODO color: light-dark(var(--day-fern), var(--night-fern)) */

    place-self: center;
    max-inline-size: min-content;
    margin: 1ch;

    font-family: var(--font-ornaments);
    font-size: clamp(1.5rem,4vw + 1rem,3.5rem);
    line-height: var(--lh-equals);
    text-align: center;
    color: var(--ornament-color);

    /* TODO staggered pattern anim */
    transition: opacity 2.5s ease-in;
    @starting-style { opacity: 0 }
  }

  hgroup {
    margin-block: 3.5rem;
    block-size: calc(100lvh - var(--star-size) * 4);

    h1 {
      place-self: start center;
      width: 100%;

      text-align: center;
      text-transform: lowercase;
      color: light-dark(
        hsl(var(--sw-carnelian)),
        var(--sw-chinchilla)
      );

      > .block { display: contents !important }

      > span:nth-of-type(1) {
        --wght: 250;
        --opsz: 56;
        --opsz: 72;
      }

      > span:nth-of-type(2) {
        --wght: 250;
        --opsz: 48;
        --ital: 1;

        font-family: var(--font-serif);
        color: light-dark(var(--sw-antiq-brown), var(--sw-pale-moss));
      }

      > span:last-child {
        /* --wght: 250; */
        --wght: 200;
        --opsz: 48;
        --ital: 1;

        font-family: var(--font-serif);
        color: light-dark(var(--sw-antiq-brown), var(--sw-pale-moss));
      }
    }

    h1 + p:is(.lead) { /* :is(.lede, .lead) */
      max-inline-size: 35ch;
      padding-block-end: 1rlh;
      opacity: .72;
      --tracking: var(--letter-spacing-0);

      /* font-variation-settings: var(--forma-300-micro); */
      color: light-dark(
        hsl(var(--sw-carnelian)),
        var(--sw-chinchilla)
      );
    }

    @media (width >= 48rem) {
      gap: 1rlh;
      aspect-ratio: 1;

      h1 {--px-size: 72}
    }

    @media (width >= 64rem) {
      h1 {--px-size: 96}
    }
  }

  /*  TODO Add CQs */
  .pile { /* :where(.pile:has(> .star)) {…} */
    --star-size: 2.75rem;
    --frame-size: calc(100% - var(--star-size) - var(--spacer));

    max-inline-size: var(--frame-size);
    max-block-size: var(--frame-size);
    aspect-ratio: var(--ratio-square);
  }
</style>
