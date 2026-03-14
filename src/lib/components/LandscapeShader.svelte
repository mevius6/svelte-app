<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  import landscapeVertexSource   from '$lib/shaders/landscape.vert?raw';
  import landscapeFragmentSource from '$lib/shaders/landscape.frag?raw';
  import rippleShaderSource      from '$lib/shaders/ripple.frag?raw';

  import bushesVertexSource      from '$lib/shaders/bushes.vert?raw';
  import bushesFragmentSource    from '$lib/shaders/bushes.frag?raw';

  export let projectName: string = 'dummy';

  // '/foliage-atlas.png'
  export const ATLAS_SRC = '/RobiniaViscosa_2_basecolor-1K.png';

  // ─────────────────────────────────────────────────
  // #MARK:- Types
  // ─────────────────────────────────────────────────

  type RippleFBO = { fbo: WebGLFramebuffer; tex: WebGLTexture };

  type RippleState = {
    program:  WebGLProgram;
    fbos:     [RippleFBO, RippleFBO];
    readIdx:  0 | 1;
    size:     number;
    texelSize: number;
    uniforms: {
      u_state:        WebGLUniformLocation | null;
      u_texelSize:    WebGLUniformLocation | null;
      u_dropPos:      WebGLUniformLocation | null;
      u_dropRadius:   WebGLUniformLocation | null;
      u_dropStrength: WebGLUniformLocation | null;
      u_dropActive:   WebGLUniformLocation | null;
    };
  };

  type LandscapeUniforms = {
    u_resolution:  WebGLUniformLocation | null;
    u_time:        WebGLUniformLocation | null;
    u_scroll:      WebGLUniformLocation | null;
    u_textTex:     WebGLUniformLocation | null;
    u_textRect:    WebGLUniformLocation | null;
    u_rippleTex:   WebGLUniformLocation | null;
    u_rippleTexel: WebGLUniformLocation | null;
  };

  type BushesUniforms = {
    u_horizon:      WebGLUniformLocation | null;
    u_resolution:   WebGLUniformLocation | null;
    u_time:         WebGLUniformLocation | null;
    u_foliageAtlas: WebGLUniformLocation | null;
  };

  type GLState = {
    gl: WebGL2RenderingContext;

    quadVAO: WebGLVertexArrayObject;
    quadBuffer: WebGLBuffer;

    landscapeProgram: WebGLProgram;
    landscapeUniforms: LandscapeUniforms;

    bushesProgram: WebGLProgram;
    bushesVAO: WebGLVertexArrayObject;
    bushesInstanceCount: number;
    bushesUniforms: BushesUniforms;
    foliageAtlas: WebGLTexture | null;

    textTexture: WebGLTexture;
    textTexSize: { w: number; h: number };
    ripple: RippleState | null;

    ro: ResizeObserver;
    scrollHandler: () => void;
  } | null;

  // ─────────────────────────────────────────────────
  // #MARK:- Module state
  // ─────────────────────────────────────────────────

  let canvas: HTMLCanvasElement;
  let glState: GLState = null;
  let animFrameId = 0;
  let scrollNorm  = 0;

  let pendingDrop: { x: number; y: number } | null = null;
  let lastDropMs  = 0;
  const DROP_THROTTLE_MS = 45;

  // ─────────────────────────────────────────────────
  // #MARK:- WebGL helpers
  // ─────────────────────────────────────────────────

  function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
    const s = gl.createShader(type); if (!s) return null;
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('Shader compile:', gl.getShaderInfoLog(s));
      gl.deleteShader(s); return null;
    }
    return s;
  }

  function createProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram | null {
    const vs = compileShader(gl, gl.VERTEX_SHADER,   vsSrc);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    const prog = gl.createProgram(); if (!prog) return null;
    gl.attachShader(prog, vs); gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('Program link:', gl.getProgramInfoLog(prog));
      gl.deleteProgram(prog); return null;
    }
    return prog;
  }

  function resizeCanvas(gl: WebGL2RenderingContext, canvas: HTMLCanvasElement) {
    const dpr = window.devicePixelRatio || 1;
    const r   = canvas.getBoundingClientRect();
    const w   = Math.max(1, Math.floor(r.width  * dpr));
    const h   = Math.max(1, Math.floor(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }

  function updateScrollNorm() {
    const max = document.body.scrollHeight - window.innerHeight;
    scrollNorm = max > 0 ? Math.min(Math.max(window.scrollY/max,0),1) : 0;
  }

  // ─────────────────────────────────────────────────
  // #MARK:- Text texture
  // ─────────────────────────────────────────────────

  function createTextTexture(
    gl: WebGL2RenderingContext, text: string
  ): { texture: WebGLTexture; w: number; h: number } | null {
    const off = document.createElement('canvas');
    const ctx = off.getContext('2d'); if (!ctx) return null;

    const fontSize = 96;
    const fontStr  = `300 ${fontSize}px "Georgia", "Times New Roman", serif`;
    const display  = text.toUpperCase();

    if ('letterSpacing' in ctx)
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '8px';
    ctx.font = fontStr;
    const textW = ctx.measureText(display).width;
    const pad   = fontSize * 0.85;

    off.width  = Math.ceil(textW + pad * 2);
    off.height = Math.ceil(fontSize * 1.3 + pad * 2);

    ctx.font = fontStr;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx)
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '8px';

    const cx = off.width/2, cy = off.height/2;
    ctx.shadowColor='rgba(255,195,120,0.55)'; ctx.shadowBlur=56;
    ctx.fillStyle='rgba(255,255,255,0.85)'; ctx.fillText(display,cx,cy);
    ctx.shadowColor='rgba(255,225,170,0.80)'; ctx.shadowBlur=20;
    ctx.fillStyle='rgba(255,255,255,0.95)'; ctx.fillText(display,cx,cy);
    ctx.shadowBlur=0; ctx.shadowColor='transparent';
    ctx.fillStyle='#ffffff'; ctx.fillText(display,cx,cy);

    const texture = gl.createTexture(); if (!texture) return null;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,off);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D,null);
    return { texture, w: off.width, h: off.height };
  }

  // ─────────────────────────────────────────────────
  // #MARK:- Ripple FBO
  // ─────────────────────────────────────────────────

  function createRippleFBO(gl: WebGL2RenderingContext, size: number): RippleFBO | null {
    const tex = gl.createTexture(); if (!tex) return null;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RG16F,size,size,0,gl.RG,gl.HALF_FLOAT,null);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer(); if (!fbo) { gl.deleteTexture(tex); return null; }
    gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);
    gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    gl.bindTexture(gl.TEXTURE_2D,null);
    return { fbo, tex };
  }

  function initRipple(gl: WebGL2RenderingContext): RippleState | null {
    if (!gl.getExtension('EXT_color_buffer_float')) {
      console.warn('LandscapeShader: EXT_color_buffer_float unavailable — ripple disabled');
      return null;
    }
    const size = 512;
    const fbo0 = createRippleFBO(gl, size);
    const fbo1 = createRippleFBO(gl, size);
    if (!fbo0 || !fbo1) return null;
    const prog = createProgram(gl, landscapeVertexSource, rippleShaderSource);
    if (!prog) return null;
    return {
      program: prog, fbos: [fbo0,fbo1], readIdx: 0,
      size, texelSize: 1.0/size,
      uniforms: {
        u_state:        gl.getUniformLocation(prog,'u_state'),
        u_texelSize:    gl.getUniformLocation(prog,'u_texelSize'),
        u_dropPos:      gl.getUniformLocation(prog,'u_dropPos'),
        u_dropRadius:   gl.getUniformLocation(prog,'u_dropRadius'),
        u_dropStrength: gl.getUniformLocation(prog,'u_dropStrength'),
        u_dropActive:   gl.getUniformLocation(prog,'u_dropActive'),
      },
    };
  }

  // ─────────────────────────────────────────────────
  // #MARK:- Pointer → ripple UV
  // ─────────────────────────────────────────────────

  function pointerToRippleUV(
    clientX: number, clientY: number
  ): { x: number; y: number } | null {
    const normX = clientX / window.innerWidth;
    const normY = clientY / window.innerHeight;
    if (normY < 0.5) return null;
    const ry = (normY - 0.5) * 2.0;
    return {
      x: Math.max(0.001, Math.min(0.999, normX)),
      y: Math.max(0.001, Math.min(0.999, ry)),
    };
  }

  // ─────────────────────────────────────────────────
  // #MARK:- Init
  // ─────────────────────────────────────────────────

  async function initScene() {
    if (!canvas) return;
    const gl = canvas.getContext('webgl2');
    if (!gl) { console.warn('WebGL2 not supported'); return; }

    // Fullscreen quad
    const quadVAO = gl.createVertexArray(); if (!quadVAO) return;
    gl.bindVertexArray(quadVAO);
    const quadBuffer = gl.createBuffer(); if (!quadBuffer) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1,-1, 1,-1, -1,1,
      -1, 1, 1,-1, 1, 1,
    ]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
    gl.bindVertexArray(null);

    const landscapeProgram = createProgram(gl, landscapeVertexSource, landscapeFragmentSource);
    if (!landscapeProgram) return;

    const landscapeUniforms: LandscapeUniforms = {
      u_resolution:  gl.getUniformLocation(landscapeProgram,'u_resolution'),
      u_time:        gl.getUniformLocation(landscapeProgram,'u_time'),
      u_scroll:      gl.getUniformLocation(landscapeProgram,'u_scroll'),
      u_textTex:     gl.getUniformLocation(landscapeProgram,'u_textTex'),
      u_textRect:    gl.getUniformLocation(landscapeProgram,'u_textRect'),
      u_rippleTex:   gl.getUniformLocation(landscapeProgram,'u_rippleTex'),
      u_rippleTexel: gl.getUniformLocation(landscapeProgram,'u_rippleTexel'),
    };

    const bushesProgram = createProgram(gl, bushesVertexSource, bushesFragmentSource);
    if (!bushesProgram) return;

    // #region WIP Bushes VAO
    const bushesVAO = gl.createVertexArray(); if (!bushesVAO) return;
    gl.bindVertexArray(bushesVAO);

    const cardBuffer = gl.createBuffer(); if (!cardBuffer) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, cardBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -0.5, 0.0,
         0.5, 0.0,
        -0.5, 1.0,
        -0.5, 1.0,
         0.5, 0.0,
         0.5, 1.0,
      ]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const BUSH_COUNT = 6;
    const CARDS_PER_BUSH = 3;
    const INSTANCE_COUNT = BUSH_COUNT * CARDS_PER_BUSH;

    const instancePos   = new Float32Array(INSTANCE_COUNT * 2);
    const instanceScale = new Float32Array(INSTANCE_COUNT * 2);
    const instanceType  = new Float32Array(INSTANCE_COUNT);
    const cardIndex     = new Float32Array(INSTANCE_COUNT);
    const instanceRand  = new Float32Array(INSTANCE_COUNT * 2);

    for (let b = 0; b < BUSH_COUNT; b++) {
      const baseX = 0.18 + (b / (BUSH_COUNT - 1)) * 0.64;
      const baseH = 0.06 + Math.random() * 0.05;
      const baseW = 0.05 + Math.random() * 0.03;
      const bushType = Math.random() < 0.5 ? 0 : 1;

      for (let c = 0; c < CARDS_PER_BUSH; c++) {
        const i = b * CARDS_PER_BUSH + c;
        instancePos[i*2+0]   = baseX + (Math.random() - 0.5) * 0.01;
        instancePos[i*2+1]   = 0.0;
        instanceScale[i*2+0] = baseW * (0.9 + Math.random() * 0.2);
        instanceScale[i*2+1] = baseH * (0.9 + Math.random() * 0.2);
        instanceType[i]      = bushType;
        cardIndex[i]         = c;
        instanceRand[i*2+0]  = Math.random();
        instanceRand[i*2+1]  = Math.random();
      }
    }

    function makeInstanceBuffer(data: Float32Array, loc: number, size: number) {
      const buf = gl.createBuffer(); if (!buf) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(loc, 1);
    }

    makeInstanceBuffer(instancePos,   1, 2);
    makeInstanceBuffer(instanceScale, 2, 2);
    makeInstanceBuffer(instanceType,  3, 1);
    makeInstanceBuffer(cardIndex,     4, 1);
    makeInstanceBuffer(instanceRand,  5, 2);

    gl.bindVertexArray(null);

    const bushesUniforms: BushesUniforms = {
      u_horizon:      gl.getUniformLocation(bushesProgram, 'u_horizon'),
      u_resolution:   gl.getUniformLocation(bushesProgram, 'u_resolution'),
      u_time:         gl.getUniformLocation(bushesProgram, 'u_time'),
      u_foliageAtlas: gl.getUniformLocation(bushesProgram, 'u_foliageAtlas'),
    };
    // #endregion

    // Text texture
    const textResult = createTextTexture(gl, projectName);
    if (!textResult) return;

    // TODO Foliage atlas texture
    // See:
    // - https://www.artstation.com/blogs/mickaelthierry/PbWL/foliage-art-blog-01-a-blog-exploration-about-foliage-this-week-atlas-texture
    // - https://devforum.roblox.com/t/texture-atlases-creating-foliage-texture-and-meshes/3171224
    async function loadTexture(url: string): Promise<WebGLTexture | null> {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const tex = gl.createTexture();
          if (!tex) { resolve(null); return; }
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
          gl.generateMipmap(gl.TEXTURE_2D);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.bindTexture(gl.TEXTURE_2D, null);
          resolve(tex);
        };
        img.onerror = () => resolve(null);
        img.src = url;
      });
    }

    const foliageAtlas = await loadTexture(ATLAS_SRC);

    const ripple = initRipple(gl);

    let dummyTex: WebGLTexture | null = null;
    if (!ripple) {
      dummyTex = gl.createTexture();
      if (dummyTex) {
        gl.bindTexture(gl.TEXTURE_2D,dummyTex);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RG8,1,1,0,gl.RG,gl.UNSIGNED_BYTE,new Uint8Array([0,0]));
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
        gl.bindTexture(gl.TEXTURE_2D,null);
      }
    }

    const ro = new ResizeObserver(() => resizeCanvas(gl, canvas));
    ro.observe(canvas);
    const scrollHandler = () => updateScrollNorm();
    window.addEventListener('scroll', scrollHandler, { passive: true });

    const onPointerDown = (e: PointerEvent) => {
      const uv = pointerToRippleUV(e.clientX, e.clientY);
      if (uv) { pendingDrop = uv; lastDropMs = performance.now(); }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pressure === 0 && e.pointerType === 'mouse') return;
      const now = performance.now();
      if (now - lastDropMs < DROP_THROTTLE_MS) return;
      const uv = pointerToRippleUV(e.clientX, e.clientY);
      if (uv) { pendingDrop = uv; lastDropMs = now; }
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);

    updateScrollNorm();
    resizeCanvas(gl, canvas);

    glState = {
      gl,
      quadVAO,
      quadBuffer,
      landscapeProgram,
      landscapeUniforms,
      bushesProgram,
      bushesVAO,
      bushesInstanceCount: INSTANCE_COUNT,
      bushesUniforms,
      foliageAtlas,
      textTexture: textResult.texture,
      textTexSize: textResult,
      ripple,
      ro,
      scrollHandler,
    };

    (glState as any)._pd   = onPointerDown;
    (glState as any)._pm   = onPointerMove;
    (glState as any)._dTex = dummyTex;

    const render = (timeMs: number) => {
      if (!glState) return;
      const {
        gl,
        quadVAO,
        landscapeProgram: lp,
        landscapeUniforms: lu,
        textTexture,
        textTexSize,
        ripple,
        bushesProgram,
        bushesVAO,
        bushesInstanceCount,
        bushesUniforms,
        foliageAtlas,
      } = glState;

      const t = timeMs * 0.001;

      // Pass 1: ripple
      if (ripple) {
        const writeIdx = (ripple.readIdx ^ 1) as 0 | 1;
        gl.bindFramebuffer(gl.FRAMEBUFFER, ripple.fbos[writeIdx].fbo);
        gl.viewport(0, 0, ripple.size, ripple.size);
        gl.useProgram(ripple.program);
        gl.bindVertexArray(quadVAO);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, ripple.fbos[ripple.readIdx].tex);
        gl.uniform1i(ripple.uniforms.u_state, 0);
        gl.uniform2f(ripple.uniforms.u_texelSize, ripple.texelSize, ripple.texelSize);

        const drop = pendingDrop; pendingDrop = null;
        if (drop) {
          gl.uniform2f(ripple.uniforms.u_dropPos, drop.x, drop.y);
          gl.uniform1f(ripple.uniforms.u_dropRadius,   0.032);
          gl.uniform1f(ripple.uniforms.u_dropStrength, 0.38);
          gl.uniform1f(ripple.uniforms.u_dropActive,   1.0);
        } else {
          gl.uniform1f(ripple.uniforms.u_dropActive, 0.0);
        }

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.bindVertexArray(null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        ripple.readIdx = writeIdx;
      }

      // Pass 2: landscape
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(lp);
      gl.bindVertexArray(quadVAO);

      gl.uniform2f(lu.u_resolution, canvas.width, canvas.height);
      gl.uniform1f(lu.u_time,   t);
      gl.uniform1f(lu.u_scroll, scrollNorm);

      const aspect = canvas.width / canvas.height;
      const hw = 0.22;
      const hh = hw * aspect * (textTexSize.h / textTexSize.w);
      gl.uniform4f(lu.u_textRect, 0.5, 0.67, hw, hh);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, textTexture);
      gl.uniform1i(lu.u_textTex, 0);

      const ripTex = ripple
        ? ripple.fbos[ripple.readIdx].tex
        : (glState as any)._dTex as WebGLTexture;
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, ripTex);
      gl.uniform1i(lu.u_rippleTex, 1);
      gl.uniform1f(lu.u_rippleTexel, ripple ? ripple.texelSize : 0.0);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindVertexArray(null);

      // Pass 3: bushes
      const horizon = 0.5;
      gl.useProgram(bushesProgram);
      gl.bindVertexArray(bushesVAO);

      if (bushesUniforms.u_horizon) {
        gl.uniform1f(bushesUniforms.u_horizon, horizon);
      }
      if (bushesUniforms.u_resolution) {
        gl.uniform2f(bushesUniforms.u_resolution, canvas.width, canvas.height);
      }
      if (bushesUniforms.u_time) {
        gl.uniform1f(bushesUniforms.u_time, t);
      }
      if (foliageAtlas && bushesUniforms.u_foliageAtlas) {
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, foliageAtlas);
        gl.uniform1i(bushesUniforms.u_foliageAtlas, 2);
      }

      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, bushesInstanceCount);
      gl.bindVertexArray(null);

      animFrameId = requestAnimationFrame(render);
    };

    animFrameId = requestAnimationFrame(render);
  }

  // ─────────────────────────────────────────────────
  // Dispose
  // ─────────────────────────────────────────────────

  function disposeScene() {
    if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = 0; }
    if (glState) {
      const {
        gl,
        quadVAO,
        quadBuffer,
        landscapeProgram,
        textTexture,
        ripple,
        ro,
        scrollHandler,
        bushesProgram,
        bushesVAO,
        foliageAtlas,
      } = glState;

      ro.disconnect();
      window.removeEventListener('scroll',      scrollHandler);
      window.removeEventListener('pointerdown', (glState as any)._pd);
      window.removeEventListener('pointermove', (glState as any)._pm);

      gl.deleteBuffer(quadBuffer);
      gl.deleteVertexArray(quadVAO);
      gl.deleteProgram(landscapeProgram);
      gl.deleteTexture(textTexture);

      gl.deleteProgram(bushesProgram);
      gl.deleteVertexArray(bushesVAO);
      if (foliageAtlas) gl.deleteTexture(foliageAtlas);

      if (ripple) {
        gl.deleteProgram(ripple.program);
        ripple.fbos.forEach(f => {
          gl.deleteFramebuffer(f.fbo);
          gl.deleteTexture(f.tex);
        });
      }
      const dt = (glState as any)._dTex;
      if (dt) gl.deleteTexture(dt);
    }
    glState = null;
  }

  onMount(() => { initScene(); });
  onDestroy(() => { disposeScene(); });
</script>

<canvas bind:this={canvas} class="landscape-shader-canvas"></canvas>

<style>
  .landscape-shader-canvas {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    pointer-events: none;
  }
</style>
