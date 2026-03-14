<script lang="ts" context="module">
  // import map from '$lib/assets/fedm/ripple.jpg';

  export type ASCIIShiftOptions = Partial<ASCIIShiftConfig>;

  type ASCIIShiftConfig = {
    dur: number;
    chars: string;
    preserveSpaces: boolean;
    spread: number;
  };

  // https://ascii.co.uk/
  // https://velvetyne.fr/news/about-ascii-art-and-jgs-font/
  const DEFAULT_CFG: ASCIIShiftConfig = {
    dur: 700,
    // https://input.djr.com/info/
    // chars: '.‗_▁▂▃▄▅▆▇█▉▊▋▌▍░▒▓█▌▄▀▙▜▞▚♥♪&$@0≈*~⎯✓°˚·.',
    chars: '.:-~=<www>^\s‗_▁▂▃▄▅▆▇█▓▒░░▒▓#♥♪@0123456789≈~✓',

    // chars: ".,:;!|/\\_-+=*^~<>[]{}()!?017LTXYVUCJQ0OZmwqpdbkhao#MW&8%B@$",
    // chars: "..,::;;!!--~~^^==++__<>[]{}()/\\|1iIlLttffrrxxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
    // chars: ".,;:!|/\\-_=+?tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",

    // dirty VHS
    // chars: " .'`.,:;!|/\\_-~^=+*?tfjrxnuvczXYUJCLQ0OZmwqpdbkhao#MW8%B@$",

    // clean neon-terminal
    // chars: " .,:-~=+<>|/\\()[]{}1ilIjtfrxnvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",

    preserveSpaces: false,
    spread: 1.15
    // spread: 0.3
  };

  // Constants for wave animation behavior
  const WAVE_THRESH = 3;
  const CHAR_MULT = 3;
  const ANIM_STEP = 40;
  const WAVE_BUF = 5;
  const MOVE_WAVE_INTERVAL = 40;

  type Instance = {
    updateTxt: (newTxt: string) => void;
    resetToOrig: () => void;
    destroy: () => void;
  };

  export const createASCIIShift = (el: HTMLElement, opts: ASCIIShiftOptions = {}): Instance => {
    // State variables
    let origTxt = el.textContent ?? "";
    let origChars = Array.from(origTxt);
    let isAnim = false;
    let cursorPos = 0;
    let waves: Array<{ startPos: number; startTime: number; id: number }> = [];
    let animId: number | null = null;
    let isHover = false;
    let origW: number | null = null;
    let lastMoveWaveAt = -Infinity;

    const mergedCfg: ASCIIShiftConfig = { ...DEFAULT_CFG, ...opts };
    const cfg: ASCIIShiftConfig = {
      ...mergedCfg,
      dur: Number.isFinite(mergedCfg.dur) && mergedCfg.dur > 0 ? mergedCfg.dur : DEFAULT_CFG.dur,
      spread:
        Number.isFinite(mergedCfg.spread) && mergedCfg.spread > 0 ? mergedCfg.spread : DEFAULT_CFG.spread
    };

    const updateCursorPos = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const len = origTxt.length;
      const pos = Math.round((x / rect.width) * len);
      cursorPos = Math.max(0, Math.min(pos, len - 1));
    };

    const startWave = (startTime = performance.now()) => {
      waves.push({
        startPos: cursorPos,
        startTime,
        id: Math.random()
      });

      if (!isAnim) start();
    };

    const cleanupWaves = (t: number) => {
      waves = waves.filter((w) => t - w.startTime < cfg.dur);
    };

    const calcWaveEffect = (charIdx: number, t: number) => {
      let shouldAnim = false;
      let resultChar = origChars[charIdx];

      for (const w of waves) {
        const age = t - w.startTime;
        const prog = Math.min(age / cfg.dur, 1);
        const dist = Math.abs(charIdx - w.startPos);
        const maxDist = Math.max(w.startPos, origChars.length - w.startPos - 1);
        const rad = (prog * (maxDist + WAVE_BUF)) / cfg.spread;

        if (dist <= rad) {
          shouldAnim = true;
          const intens = Math.max(0, rad - dist);

          if (intens <= WAVE_THRESH && intens > 0) {
            // v0
            // const idx = (dist * CHAR_MULT + Math.floor(age / ANIM_STEP)) % cfg.chars.length;

            // v1
            // const step = Math.floor(age / ANIM_STEP);
            // const idx = (dist + step) % cfg.chars.length;

            // v2
            const step = Math.floor(age / ANIM_STEP);
            const idx = dist + step; // без %

            if (idx < cfg.chars.length) {
              resultChar = cfg.chars[idx];
            }
            // если idx >= длины chars -> оставляем исходный символ без подмены (resultChar уже origChars[charIdx])
          }
        }
      }

      return { shouldAnim, char: resultChar };
    };

    const genScrambledTxt = (t: number) =>
      origChars
        .map((char, i) => {
          if (cfg.preserveSpaces && char === " ") return " ";
          const res = calcWaveEffect(i, t);
          return res.shouldAnim ? res.char : char;
        })
        .join("");

    const stop = () => {
      el.textContent = origTxt;
      el.classList.remove("as");
      animId = null;

      if (origW !== null) {
        el.style.width = "";
        origW = null;
      }
      isAnim = false;
    };

    const start = () => {
      if (isAnim) return;

      if (origW === null) {
        origW = el.getBoundingClientRect().width;
        el.style.width = `${origW}px`;
      }

      isAnim = true;
      el.classList.add("as");

      const animate = () => {
        const t = performance.now();
        cleanupWaves(t);

        if (waves.length === 0) {
          stop();
          return;
        }

        el.textContent = genScrambledTxt(t);
        animId = requestAnimationFrame(animate);
      };

      animId = requestAnimationFrame(animate);
    };

    const handleEnter = (e: MouseEvent) => {
      isHover = true;
      updateCursorPos(e);
      const now = performance.now();
      startWave(now);
      lastMoveWaveAt = now;
    };

    const handleMove = (e: MouseEvent) => {
      if (!isHover) return;
      const old = cursorPos;
      updateCursorPos(e);
      if (cursorPos !== old) {
        const now = performance.now();
        if (now - lastMoveWaveAt >= MOVE_WAVE_INTERVAL) {
          startWave(now);
          lastMoveWaveAt = now;
        }
      }
    };

    const handleLeave = () => {
      isHover = false;
    };

    const init = () => {
      el.addEventListener("mouseenter", handleEnter);
      el.addEventListener("mousemove", handleMove);
      el.addEventListener("mouseleave", handleLeave);
    };

    const resetToOrig = () => {
      waves = [];
      if (animId !== null) {
        cancelAnimationFrame(animId);
        animId = null;
      }

      if (origW !== null) {
        el.style.width = "";
        origW = null;
      }

      stop();
    };

    const updateTxt = (newTxt: string) => {
      origTxt = newTxt;
      origChars = Array.from(newTxt);
      if (!isAnim) el.textContent = newTxt;
    };

    const destroy = () => {
      resetToOrig();
      el.removeEventListener("mouseenter", handleEnter);
      el.removeEventListener("mousemove", handleMove);
      el.removeEventListener("mouseleave", handleLeave);
    };

    init();
    return { updateTxt, resetToOrig, destroy };
  };

  // Svelte action
  export const asciiShift = (node: HTMLElement, opts: ASCIIShiftOptions = {}) => {
    let inst = createASCIIShift(node, opts);

    return {
      update(next: ASCIIShiftOptions) {
        inst.destroy();
        inst = createASCIIShift(node, next);
      },
      destroy() {
        inst.destroy();
      }
    };
  };

  type Item = { label: string; ariaLabel?: string };

  const items: Item[] = [
    { label: "Пролог • Вступление" },
    { label: "Добыча глины для кирпичных заводов" },
    { label: "Довоенный город" },
    { label: "Восстановление Новгорода" },
    { label: "Анатолий Александрович Нестеров" },
    { label: "Начало благоустройства карьеров" },
    { label: "Георгий Барков и 1-й проект гидропарка" },
    { label: "Сейчас" },
  ];
</script>

<article class="abspos zi-10">
  <ol class="list">
    {#each items as item, index (item.label)}
      <li style:--animation-order={index}>
        <a
          href="/"
          use:asciiShift={{ dur: 1000, spread: 1 }}
          aria-label={item.ariaLabel ?? item.label}
        >
          {item.label}
        </a>
      </li>
    {/each}
  </ol>
</article>

<style>
  article {
    inset-inline-start: 50%;
    inset-block-end: var(--spacer-16x);
    inline-size: min(56ch, 65ch);

    color: var(--nightglo-ng200);

    transform-origin: 0% 105%;
    transform: perspective(500px) translateX(-50%) rotateX(30deg);

    /* filter: url(#water-distort); */

    & ol {
      list-style-type: date-list;
      list-style-position: inside;

      > li {
        animation-name: animateIn;
        /* animation-name: scale; */
        animation-duration: 350ms;
        animation-delay: calc(var(--animation-order) * 50ms);
        animation-fill-mode: both;
        animation-timing-function: ease-in-out;
        animation-timeline: scroll(root block);
      }
    }

    & ol {
      @media (hover) and (prefers-reduced-motion: no-preference) {
        & > li {
          transition:
            filter .3s var(--ease-3),
            font-weight .3s var(--ease-3);
          filter: blur(1px);

          &:hover {
            filter: blur(0);
            font-weight: 500;

            &::marker {
              font-weight: 800;
              /* content: '->' ' '; */
            }
          }
        }

        &:hover > li:not(:hover) {
          /* opacity: .25; */
          filter: blur(2px);
        }
      }
    }

    & a { all: unset }
  }

  @keyframes animateIn {
    0% {
      opacity: 0;
      transform: scale(0.6) translateY(-8px) translateX(-8px);
      filter: blur(10px);
    }

    50% {
      opacity: 0;
      transform: scale(0.6) translateY(-8px) translateX(-8px);
      filter: blur(5px);
    }

    100% {
      opacity: 1;
    }
  }

  @keyframes scale {
    0% {
      transform: scaleY(0);
    }
    100% {
      transform: scaleY(1);
    }
  }

  @counter-style custom {
    system: extends decimal;
    /* suffix: ". "; */
    /* prefix: "~ "; */
    prefix: "-> ";
  }
  @counter-style date-list {
    system: cyclic;
    symbols:
      "XXXX–2026"
      "1893–1935"
      "1935–1946"
      "1946–1960"
      "1975–1990"
      "1983–1989"
      "1989–1990"
      "2026–XXXX";
    prefix: "~ ";
    suffix: " -> ";
  }
</style>
