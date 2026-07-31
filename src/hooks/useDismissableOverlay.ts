import { useEffect } from 'react';

/**
 * Shared behaviour for anything that covers the page: close on Escape, stop the
 * content behind from scrolling, and hand focus back where it came from.
 *
 * Every overlay in this app used to be dismissable only by finding its X button,
 * which is a poor deal on a phone and impossible with a keyboard alone.
 */
export function useDismissableOverlay(isOpen: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [isOpen, onClose]);
}
