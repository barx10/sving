import React from 'react';
import type { Notice } from '../types';
import { AlertCircle, Info, X } from 'lucide-react';

interface NoticeStackProps {
  notices: Notice[];
  onDismiss: (id: string) => void;
}

/**
 * In-app messages, replacing the native alert() calls this app used to make.
 * alert() blocks the whole page, cannot be styled, and on a phone in a tank bag
 * it is genuinely awkward to dismiss with gloves on.
 */
export const NoticeStack: React.FC<NoticeStackProps> = ({ notices, onDismiss }) => {
  if (notices.length === 0) return null;

  return (
    <div className="space-y-2" role="status" aria-live="polite">
      {notices.map((notice) => {
        const isError = notice.tone === 'error';
        return (
          <div
            key={notice.id}
            className={`p-4 rounded-2xl flex items-center justify-between gap-3 text-sm shadow-md border ${
              isError
                ? 'bg-[#BC4749] border-[#8B3436] text-white'
                : 'bg-[#E9EDC9] border-[#CCD5AE] text-[#2D332A]'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {isError ? (
                <AlertCircle className="w-5 h-5 shrink-0" />
              ) : (
                <Info className="w-5 h-5 shrink-0 text-[#386641]" />
              )}
              <span>{notice.message}</span>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(notice.id)}
              aria-label="Lukk melding"
              className={`p-1.5 rounded-lg transition shrink-0 ${
                isError ? 'hover:bg-white/20 text-white' : 'hover:bg-white/60 text-[#2D332A]'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
