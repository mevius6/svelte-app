import ArrowCloseLeftIcon from './ArrowCloseLeftIcon.svelte';
import ArrowLeftIcon from './ArrowLeftIcon.svelte';
import ArrowOpenRightIcon from './ArrowOpenRightIcon.svelte';
import ArrowRightIcon from './ArrowRightIcon.svelte';
import CloseCircleIcon from './CloseCircleIcon.svelte';
import CloseSmallIcon from './CloseSmallIcon.svelte';
import CogIcon from './CogIcon.svelte';
import ConfirmCircleIcon from './ConfirmCircleIcon.svelte';
import FilterIcon from './FilterIcon.svelte';
import Grid3Icon from './Grid3Icon.svelte';
import HomeIcon from './HomeIcon.svelte';
import MenuFoldLeftIcon from './MenuFoldLeftIcon.svelte';
import MenuIcon from './MenuIcon.svelte';
import MenuToCloseIcon from './MenuToCloseIcon.svelte';
import SearchIcon from './SearchIcon.svelte';
import SkyTrigramIcon from './SkyTrigramIcon.svelte';
import SpinnerIcon from './SpinnerIcon.svelte';

export const icons = {
  arrowCloseLeft: ArrowCloseLeftIcon,
  arrowLeft: ArrowLeftIcon,
  arrowOpenRight: ArrowOpenRightIcon,
  arrowRight: ArrowRightIcon,
  closeCircle: CloseCircleIcon,
  closeSmall: CloseSmallIcon,
  cogLoop: CogIcon,
  menu: MenuIcon,
  menuFoldLeft: MenuFoldLeftIcon,
  menuToClose: MenuToCloseIcon,
  home: HomeIcon,
  cog: CogIcon,
  confirmCircle: ConfirmCircleIcon,
  filter: FilterIcon,
  grid3: Grid3Icon,
  search: SearchIcon,
  skyTrigram: SkyTrigramIcon,
  spinner: SpinnerIcon
} as const;

export type IconName = keyof typeof icons;
