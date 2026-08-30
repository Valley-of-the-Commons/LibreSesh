import logoOneline from '../assets/brand/logo-oneline.svg';
import logoOnelineReversed from '../assets/brand/logo-oneline-reversed.svg';
import logoStacked from '../assets/brand/logo.svg';
import logoStackedReversed from '../assets/brand/logo-reversed.svg';

export interface LogoProps {
  /** `stacked` carries the "open source scheduling" tagline beneath the
   *  wordmark; `oneline` is the wordmark alone, for a header that already has
   *  something else to say beside it. */
  variant?: 'stacked' | 'oneline';
  /** Size it by height — the SVGs carry their own aspect ratio. */
  className?: string;
}

/** The brand mark. Each variant ships as two files rather than one tinted with
 *  `currentColor`, because the artwork is three colours, not one: dark mode
 *  lightens the wordmark and *darkens* the calendar cells. So the theme swaps
 *  the file. Only one is ever displayed, and `display: none` keeps the other
 *  out of the accessibility tree, so both may carry the same alt text. */
export function Logo({ variant = 'stacked', className = '' }: LogoProps) {
  const [light, dark] =
    variant === 'stacked'
      ? [logoStacked, logoStackedReversed]
      : [logoOneline, logoOnelineReversed];

  return (
    <>
      <img src={light} alt="LibreSesh" className={`${className} dark:hidden`} />
      <img src={dark} alt="LibreSesh" className={`hidden ${className} dark:block`} />
    </>
  );
}
