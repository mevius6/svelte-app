<script lang="ts">
  // TODO declare palette swatches via params
  let palette = {}, {
    // sun1: SUNRISE = 'F4BF77',
    // sun9: SUNSET = 'E2946F',
    // sky1: LIGHTSKY = '',
    // sky9: NIGHTSKY = '',
    // sky6: AFTER_RAIN = '8bc4d1', // SW 9047
  } = palette

  // TODO synchronize with the dynamic color scheme
  // https://evilmartians.com/chronicles/how-to-use-p3-colors-in-svg
  // https://huetone.ardov.me/
  // https://oklch.com
</script>

<!-- See: https://codepen.io/finnhvman/pen/PojJqmq -->
<svg xmlns="http://www.w3.org/2000/svg"
  class="abspos w-full h-full"
  style:background-image='var(--landscape-gradient)'
  aria-hidden="true">
  <defs>
    <linearGradient id="_skybox">
      <stop offset="10%" stop-color="#135" id="sky"/>
      <stop offset="50%" stop-color="#fbc" id="sunset"/>
      <stop offset="90%" stop-color="#135" id="lakeshore"/>
    </linearGradient>
    <radialGradient id="skybox">
      <stop stop-color="#E2946F" offset="10%" id="sun"/>
      <stop stop-color="#95978A" offset="90%" id="sky"/>
    </radialGradient>
  </defs>
  <filter id="b">
    <!-- https://drafts.csswg.org/filter-effects/#feTurbulenceElement -->
    <!-- fractalNoise | turbulence -->
    <feTurbulence type="turbulence"
      baseFrequency=".005 0"
      numOctaves="5"
      seed="6" />
    <feDisplacementMap in="SourceAlpha" scale="99" />
    <feColorMatrix values="0 0 0 0 .01
                           0 0 0 0 .02
                           0 0 0 0 .02
                           0 0 0 -1 1" />
  </filter>
  <!-- <rect id="box"
    viewBox="128 128 0 0"
    class="w-full h-full"
    fill="url(#skybox)" />
  <use
    href="#box"
    y="-100%"
    transform="scale(1 -1)"
    filter="blur(60px)" /> -->
  <use
    href="#a"
    y="-100%"
    transform="scale(1 -1)"
    filter="blur(3px)" />
  <ellipse id="a"
    cx="50%"
    rx="63%"
    ry="43%"
    filter="url(#b)" />
</svg>
