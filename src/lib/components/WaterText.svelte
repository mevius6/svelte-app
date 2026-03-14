<script lang="ts">
  import { onMount } from 'svelte';

  export let variant: 'distort' | 'live' | 'architectural' | 'horizon' | 'cinematic' = 'distort';

  let turbulenceEl: SVGFETurbulenceElement | null = null;

  function updateTextDistortion(timeSec: number): void {
    if (!turbulenceEl) return;

    const freq1 = 0.015 + Math.sin(timeSec * 0.5) * 0.005;
    const freq2 = 0.01 + Math.cos(timeSec * 0.3) * 0.003;

    turbulenceEl.setAttribute('baseFrequency', `${freq1} ${freq2}`);
  }

  // RAF loop
  onMount(() => {
    let rafId = 0;
    const startMs = performance.now();

    const loop = (nowMs: number) => {
      if (variant === 'distort') {
        const timeSec = (nowMs - startMs) / 1000;
        updateTextDistortion(timeSec);
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(rafId);
  });
</script>

<!--
MARK:- Markup
-->

<section class="relpos grid items-center">
  <h2 class="text-center caps fvar">
    <span class="block title">Чистые пруды</span>
  </h2>

  <div class="waterline"></div>

  <p class="h2 text-center caps fvar" aria-hidden="true">
    <span
      class="block clone"
      style:--svg-filter='url(#water-{variant})'
    >
      &nbsp;Чистые пруды&nbsp;
    </span>
  </p>

  <!-- See: https://codepen.io/josetxu/pen/XJmqgKd -->
  <!-- <div class="progressive-blur">
    <div></div>
    <div></div>
    <div></div>
    <div></div>
    <div></div>
    <div></div>
  </div> -->
</section>

<!--
MARK:- SVG Filters
TODO ?? move into separate file (as a component)
- https://yoksel.github.io/svg-filters/#/presets/waves
- https://www.stefanjudis.com/today-i-learned/svgs-filters-can-be-inlined-in-css/

- https://mini.gmshaders.com/p/turbulence
-->

<svg aria-hidden="true" width="0" height="0"
  xmlns="http://www.w3.org/2000/svg">

  <!--
  MARK:- Motion variants
  -->

  <!-- #region 0. Basic fluid surface
  ================================ -->
  <defs>
    <filter id="water-distort"
            x="-30%" y="-30%" width="160%" height="160%">
      <feTurbulence
        bind:this={turbulenceEl}
        type="fractalNoise"
        baseFrequency="0.015 0.01"
        numOctaves="2"
        seed="5"
        result="noise" />
      <feDisplacementMap
        id="displace"
        in="SourceGraphic"
        in2="noise"
        scale="8"
        xChannelSelector="R"
        yChannelSelector="A" />
    </filter>
  </defs>
  <!-- #endregion -->


  <!-- #region 1. Chromatic (rgb-shift)
  -->
  <filter id="f1" x="0" y="0">
    <feMorphology operator="erode" radius="5" />
    <feDropShadow id="shadow"
      dx="2" dy="2"
      stdDeviation="1"
      flood-color="#FF0000"
      flood-opacity="1" />
    <feDisplacementMap id="displacement"
      in="SourceGraphic"
      in2="shadow"
      scale="8"
      xChannelSelector="R"
      yChannelSelector="G" />
    <feDropShadow
      dx="3" dy="3"
      stdDeviation="0.5"
      flood-color="#DD0000"
      flood-opacity="1" />
    <feDropShadow
      dx="-3" dy="-3"
      stdDeviation="0.5"
      flood-color="#00DD00"
      flood-opacity="1" />
    <feDropShadow
      dx="3" dy="-3"
      stdDeviation="0.5"
      flood-color="#0000DD"
      flood-opacity="1" />
  </filter>
  <!-- #endregion -->


  <!--
  MARK:- Static variants
  -->

  <!-- #region 0. Live (inline-anim)
  ================================ -->
  <filter id="water-live"
          x="-25%" y="-25%" width="150%" height="150%">

    <!-- ===============================
        Layer 1 — Heavy Mass
    ================================ -->

    <feTurbulence
      type="fractalNoise"
      baseFrequency="0.004 0.018"
      numOctaves="2"
      seed="2"
      result="noiseLarge">

      <!-- Soft motion via seed -->
      <animate
        attributeName="seed"
        from="2"
        to="40"
        dur="40s"
        repeatCount="indefinite"/>
    </feTurbulence>

    <feDisplacementMap
      in="SourceGraphic"
      in2="noiseLarge"
      scale="8"
      xChannelSelector="R"
      yChannelSelector="A"
      result="displacedLarge"/>

    <!-- ===============================
        Layer 2 — Horizontal Wind
    ================================ -->

    <feTurbulence
      type="fractalNoise"
      baseFrequency="0.008 0.002"
      numOctaves="1"
      seed="8"
      result="noiseWind">

      <!-- Another phase, another tempo -->
      <animate
        attributeName="seed"
        from="8"
        to="60"
        dur="22s"
        repeatCount="indefinite"/>
    </feTurbulence>

    <feComponentTransfer in="noiseWind" result="noiseWindContrast">
      <feFuncR type="linear" slope="1.15" intercept="-0.08"/>
      <feFuncG type="linear" slope="1.15" intercept="-0.08"/>
      <feFuncB type="linear" slope="1.15" intercept="-0.08"/>
    </feComponentTransfer>

    <feGaussianBlur
      stdDeviation="0.7"
      in="noiseWindContrast"
      result="noiseWindFinal"/>

    <feDisplacementMap
      in="displacedLarge"
      in2="noiseWindFinal"
      scale="4"
      xChannelSelector="R"
      yChannelSelector="A"/>

  </filter>
  <!-- #endregion -->


  <!-- #region 1. Architectural
  ================================ -->
  <filter id="water-architectural"
          x="-20%" y="-20%" width="140%" height="140%">

    <feTurbulence
      type="fractalNoise"
      baseFrequency="0.006 0.002"
      numOctaves="1"
      seed="3"
      result="noise"/>

    <feComponentTransfer in="noise" result="noiseContrast">
      <feFuncR type="linear" slope="1.15" intercept="-0.07"/>
      <feFuncG type="linear" slope="1.15" intercept="-0.07"/>
      <feFuncB type="linear" slope="1.15" intercept="-0.07"/>
    </feComponentTransfer>

    <feDisplacementMap
      in="SourceGraphic"
      in2="noiseContrast"
      scale="6"
      xChannelSelector="R"
      yChannelSelector="A"/>
  </filter>
  <!-- #endregion -->


  <!-- #region 2. Horizon
  ================================ -->
  <filter id="water-horizon"
          x="-25%" y="-25%" width="150%" height="150%">

    <!-- Масса -->
    <feTurbulence
      type="fractalNoise"
      baseFrequency="0.004 0.018"
      numOctaves="2"
      seed="4"
      result="noiseLarge"/>

    <feDisplacementMap
      in="SourceGraphic"
      in2="noiseLarge"
      scale="8"
      xChannelSelector="R"
      yChannelSelector="A"
      result="displacedLarge"/>

    <!-- Горизонтальный ветер -->
    <feTurbulence
      type="fractalNoise"
      baseFrequency="0.008 0.002"
      numOctaves="1"
      seed="8"
      result="noiseWind"/>

    <feComponentTransfer in="noiseWind" result="noiseWindContrast">
      <feFuncR type="linear" slope="1.2" intercept="-0.1"/>
      <feFuncG type="linear" slope="1.2" intercept="-0.1"/>
      <feFuncB type="linear" slope="1.2" intercept="-0.1"/>
    </feComponentTransfer>

    <feGaussianBlur
      stdDeviation="0.6"
      in="noiseWindContrast"
      result="noiseWindFinal"/>

    <feDisplacementMap
      in="displacedLarge"
      in2="noiseWindFinal"
      scale="4"
      xChannelSelector="R"
      yChannelSelector="A"/>
  </filter>
  <!-- #endregion -->


  <!-- #region 3. Cinematic
  ================================ -->
  <filter id="water-cinematic"
          x="-30%" y="-30%" width="160%" height="160%">

    <feTurbulence
      type="fractalNoise"
      baseFrequency="0.005 0.015"
      numOctaves="2"
      seed="5"
      result="noiseLarge"/>

    <feDisplacementMap
      in="SourceGraphic"
      in2="noiseLarge"
      scale="10"
      xChannelSelector="R"
      yChannelSelector="A"
      result="displacedLarge"/>

    <feTurbulence
      type="fractalNoise"
      baseFrequency="0.01 0.003"
      numOctaves="1"
      seed="9"
      result="noiseWind"/>

    <feComponentTransfer in="noiseWind" result="noiseWindGamma">
      <feFuncR type="gamma" amplitude="1" exponent="1.5" offset="0"/>
      <feFuncG type="gamma" amplitude="1" exponent="1.5" offset="0"/>
      <feFuncB type="gamma" amplitude="1" exponent="1.5" offset="0"/>
    </feComponentTransfer>

    <feGaussianBlur
      stdDeviation="0.8"
      in="noiseWindGamma"
      result="noiseWindFinal"/>

    <feDisplacementMap
      in="displacedLarge"
      in2="noiseWindFinal"
      scale="5"
      xChannelSelector="R"
      yChannelSelector="A"/>
  </filter>
  <!-- #endregion -->

</svg>

<!--
MARK:- Styling
-->

<style>
  #displace {
    animation: displaceStrength linear both;
    animation-composition: add;
    animation-timeline: scroll(root block);
    animation-range: 40% 80%;
  }

  /* .landscape, .filter-depth {
    filter: contrast(.9) brightness(.95)
  } */

  section {
    grid-template-rows: auto minmax(0, min-content) auto;
    place-items: center;
  }

  .waterline {
    --_hsl: var(--sw-carnelian);
    --_hsl: var(--sw-cascades);

    /* block-size: min(var(--line-hair), var(--line-thin)); */
    block-size: var(--line-thin);
    /* inline-size: 100%; */
    inline-size: 100dvi;

    background: radial-gradient(
      circle at center,
      /* #0000, */
      hsl(var(--_hsl) / .10),
      hsl(var(--_hsl) / .125) 12.5%,
      hsl(var(--_hsl) / .25) 25%,
      hsl(var(--_hsl) / .50) 50%,
      hsl(var(--_hsl) / .75) 75%,
      hsl(var(--_hsl) / .50) 87.5%,
      /* hsl(var(--_hsl) / .25) 90%, */
      hsl(var(--_hsl) / .15) 100%
      /* #0000 100% */
    );
    /* background:
      radial-gradient(ellipse at top, hsl(var(--sw-carnelian)), #0000),
      radial-gradient(ellipse at bottom, hsl(var(--sw-cascades)), #0000),linear-gradient(
        to bottom,
        hsl(0 0% 100% / .15),
        hsl(0 0% 0% / .10)
      ); */

    opacity: .64;
    pointer-events: none;
  }

  :is(h2, .h2) {
    --font-headliner: var(--font-serif);
    --head-wrap-mode: nowrap;

    padding-block: .125rlh;
    padding-inline: 2ex;
    overflow: clip;

    color: var(--nightglo-ng200);
    line-height: var(--lh-eighty);

    > span:last-child {
      font-size: 8cqi;
      font-family: var(--font-headliner);
      font-variation-settings: 'wght' 900;
    }
  }

  .title {
    transform: translateY(100%);
    opacity: 0;

    /* text-shadow:
      0 0 8px hsl(32 100% 85% / .15),
      0 0 20px hsl(27 100% 74% / .05); */
    text-shadow:
      0 0 8px lch(92.35% 44.04 95.53 / .15),
      0 0 20px lch(92% 11.26 79.7 / .05);

    /* retro vibe */
    filter: brightness(1.05) contrast(1.02);
  }

  .clone {
    transform: translateY(-100%) scaleY(-1.05) skewX(.25deg);
    opacity: 0;

    mask-image: linear-gradient(
      to bottom,
      oklch(0% 0 0 / 0.8) 0%,
      oklch(0% 0 0 / 0.6) 20%,
      /* oklch(0% 0 0 / 0.4) 40%, */
      oklch(0% 0 0 / 0.3) 50%,
      oklch(0% 0 0 / 0) 100%
    );

    filter:
      blur(1.5px)
      contrast(.90)
      brightness(.95)
      /* brightness(1.2) */
      var(--svg-filter);

    pointer-events: none;
  }

  @supports (animation-timeline: scroll(root block)) {
    @media (prefers-reduced-motion: no-preference) {
      .title {
        animation: rise linear both;
        animation-timeline: scroll(root block);
        animation-composition: add;
      }

      .clone {
        animation: rise 1s ease-in both, reflect linear both;
        animation-timeline: scroll(root block);
        animation-composition: add;
      }
    }
  }

  /* #region- Scroll-driven keyframes
  */
  @keyframes rise {
    0% {
      /* transform: translateY(100%); */
      opacity: 0;
      scale: 1;
    }
    /* overshoot */
    /* 80% {
      transform: translateY(-105%);
      opacity: .9;
      scale: 1;
    } */
    100% {
      transform: translateY(-100%);
      opacity: 1;
      scale: 1.1;
    }
  }

  @keyframes reflect {
    from { opacity: 0; }
    to   { opacity: .32; }
  }

  @keyframes waterDrift {
    0%   { transform: translateX(0px); }
    50%  { transform: translateX(-10px); }
    100% { transform: translateX(0px); }
  }

  @keyframes displaceStrength {
    /* from { scale: 0; } */
    to { scale: 10; }
  }
  /* #endregion */

  @media (prefers-reduced-motion: reduce) {
    .title,
    .clone {
      --svg-filter: none;
      transform: translateY(-100%);
      opacity: 1;
    }
  }
</style>
