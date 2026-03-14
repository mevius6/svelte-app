<svg class="star w-11" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg"><use href="#star" /></svg>
<svg class="star w-11" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg"><use href="#star" /></svg>
<svg class="star w-11" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg"><use href="#star" /></svg>
<svg class="star w-11" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg"><use href="#star" /></svg>
<span class="line h-px"></span>
<span class="line w-px"></span>
<span class="line h-px"></span>
<span class="line w-px"></span>

<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="0" height="0" class="sr-only">
  <desc>Shapes</desc>
  <defs><path id="star" d="M7.62939e-06 19C16.5984 17.0462 16.9706 16.674 18.6081 0.391927C20.3014 16.6554 20.6736 17.0275 37.2162 19C20.6736 20.377 20.3014 20.7492 18.6081 37.6081C16.952 20.7492 16.5798 20.377 7.62939e-06 19Z" fill="currentColor" style="color: var(--frame-star-color, currentcolor);"></path></defs>
</svg>

<style>
  .star {
    --frame-star-color: hsl(var(--sw-honeydew));

    inline-size: var(--star-size);
    aspect-ratio: 1;
    translate: var(--tx) var(--ty);

    &:nth-of-type(1) {
      place-self: start start;
      --tx: -50%;
      --ty: -50%;
    }
    &:nth-of-type(2) {
      place-self: start end;
      --tx: 50%;
      --ty: -50%;
    }
    &:nth-of-type(3) {
      place-self: end end;
      --tx: 50%;
      --ty: 50%;
    }
    &:nth-of-type(4) {
      place-self: end start;
      --tx: -50%;
      --ty: 50%;
    }
  }

  .line {
    --_size: calc(100% - 2.75rem * 3);

    translate: var(--tx, 0) var(--ty, 0);

    background-color: var(--sw-jogging-path);
    /* background-color: #273E3E; */

    &:nth-of-type(2n) {
      block-size: var(--_size);
    }
    &:nth-of-type(2n+1) {
      inline-size: var(--_size);
    }

    &:nth-of-type(1) { place-self: start center; --ty: -50% }
    &:nth-of-type(2) { place-self: center start; --tx: -50% }
    &:nth-of-type(3) { place-self: end center; --ty: 50% }
    &:nth-of-type(4) { place-self: center end; --tx: 50% }
  }
</style>
