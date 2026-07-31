import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { useDismissableOverlay } from '../hooks/useDismissableOverlay';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  /** Tailwind max-width class for the panel, e.g. "max-w-2xl". */
  widthClass?: string;
  children: React.ReactNode;
}

/**
 * Shared dialog shell.
 *
 * Each modal used to reimplement its own backdrop with no way to dismiss it
 * other than the X button — no Escape, no backdrop click, no roles for screen
 * readers, and the page behind kept scrolling. Doing it once here fixes all of
 * them and keeps them consistent.
 */
export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  widthClass = 'max-w-lg',
  children,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useDismissableOverlay(isOpen, onClose);

  useEffect(() => {
    if (isOpen) panelRef.current?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] bg-[#2D332A]/70 backdrop-blur-sm flex items-center justify-center p-4"
      onMouseDown={(event) => {
        // Only dismiss on a press that starts on the backdrop itself, so a drag
        // that ends outside the panel does not close the dialog.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`bg-white border border-[#E0E0D6] rounded-3xl ${widthClass} w-full p-6 shadow-2xl space-y-5 text-[#2D332A] max-h-[90vh] flex flex-col outline-none animate-in fade-in zoom-in-95 duration-150`}
      >
        <div className="flex items-center justify-between border-b border-[#E0E0D6] pb-4 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && (
              <div className="w-10 h-10 rounded-2xl bg-[#E9EDC9] text-[#386641] flex items-center justify-center border border-[#CCD5AE] shrink-0">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h3 id={titleId} className="text-lg font-bold text-[#2D332A] truncate">
                {title}
              </h3>
              {subtitle && <p className="text-xs text-[#6B705C]">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Lukk"
            className="p-2 rounded-xl text-[#6B705C] hover:text-[#2D332A] hover:bg-[#F9F9F7] transition shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 -mx-1 px-1 space-y-5">{children}</div>
      </div>
    </div>
  );
};
