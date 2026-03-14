// https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API/Using

// 1. declare types
type MaybePromise<T> = T | Promise<T>;

export interface RunViewTransitionOptions {
  document?: Document;
  respectReducedMotion?: boolean;
  skip?: boolean;
  types?: string[] | null;
}

export interface RunViewTransitionResult {
  didStart: boolean;
  transition: ViewTransition | null;
}

type UpdateCallback = () => MaybePromise<void>;

// 2. get doc safety
function getDocument(input?: Document): Document | undefined {
  if (input) return input;
  if (typeof document === 'undefined') return undefined;
  return document;
}

// 3. check user prefs
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// 3. check API support
export function supportsViewTransition(input?: Document): boolean {
  const doc = getDocument(input);
  return !!doc && typeof doc.startViewTransition === 'function';
}

// 4. animation gate
export async function runViewTransition(
  update: UpdateCallback,
  options: RunViewTransitionOptions = {}
): Promise<RunViewTransitionResult> {
  const doc = getDocument(options.document);
  const reducedMotionEnabled = options.respectReducedMotion ?? true;
  const shouldSkip = options.skip === true || (reducedMotionEnabled && prefersReducedMotion());

  if (!doc || !supportsViewTransition(doc) || shouldSkip) {
    await update();
    return { didStart: false, transition: null };
  }

  let transition: ViewTransition;
  if (options.types && options.types.length > 0) {
    transition = doc.startViewTransition({
      types: options.types,
      update
    });
  } else {
    transition = doc.startViewTransition(update);
  }

  await transition.updateCallbackDone;
  return { didStart: true, transition };
}

// 5. util-wrap
export function withViewTransition<TArgs extends unknown[]>(
  fn: (...args: TArgs) => MaybePromise<void>,
  options:
    | RunViewTransitionOptions
    | ((...args: TArgs) => RunViewTransitionOptions) = {}
): (...args: TArgs) => Promise<RunViewTransitionResult> {
  return (...args: TArgs) => {
    const resolvedOptions = typeof options === 'function' ? options(...args) : options;
    return runViewTransition(() => fn(...args), resolvedOptions);
  };
}
