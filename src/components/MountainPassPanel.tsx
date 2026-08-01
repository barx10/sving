import React, { useEffect, useMemo, useRef } from 'react';
import type { HazardReport, MountainPassStatus, PassStatus } from '../types';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Crosshair,
  ExternalLink,
  HelpCircle,
  Mountain,
} from 'lucide-react';

interface MountainPassPanelProps {
  report: HazardReport | null;
  isOpen: boolean;
  onToggle: () => void;
  focusedPassId: string | null;
  onFocusPass: (id: string | null) => void;
}

const STATUS_CHIP: Record<PassStatus, string> = {
  open: 'bg-[#E9EDC9] text-[#386641] border-[#CCD5AE]',
  uncertain: 'bg-amber-50 text-amber-800 border-amber-200',
  closed_seasonal: 'bg-rose-50 text-[#BC4749] border-rose-200',
};

/** Stengt og usikkert først — det er de som endrer en tur. */
const STATUS_ORDER: Record<PassStatus, number> = {
  closed_seasonal: 0,
  uncertain: 1,
  open: 2,
};

const StatusIcon: React.FC<{ status: PassStatus }> = ({ status }) => {
  if (status === 'closed_seasonal') return <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />;
  if (status === 'uncertain') return <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />;
  return <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />;
};

/**
 * Seasonal status for the mountain passes, folded away until asked for.
 *
 * The wording matters here. This data is a calendar model, not a live feed from
 * Statens vegvesen, and the UI must not imply otherwise — a rider who trusts a
 * green chip in October and finds a locked gate at 1400 metres has been let down
 * by this app. Every view carries the provenance and a link to the real source.
 */
export const MountainPassPanel: React.FC<MountainPassPanelProps> = ({
  report,
  isOpen,
  onToggle,
  focusedPassId,
  onFocusPass,
}) => {
  const listRef = useRef<HTMLUListElement>(null);
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const passes = useMemo<MountainPassStatus[]>(() => {
    if (!report) return [];
    return [...report.passes].sort(
      (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name, 'no')
    );
  }, [report]);

  // A pass picked on the map should not stay hidden further down the list.
  // Only the list itself scrolls — scrollIntoView would drag the whole page
  // along and push the map the rider is looking at off the screen.
  useEffect(() => {
    if (!isOpen || !focusedPassId) return;

    const list = listRef.current;
    const row = rowRefs.current[focusedPassId];
    if (!list || !row) return;

    const top = row.offsetTop;
    const bottom = top + row.offsetHeight;

    if (top < list.scrollTop) {
      list.scrollTo({ top, behavior: 'smooth' });
    } else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTo({ top: bottom - list.clientHeight, behavior: 'smooth' });
    }
  }, [isOpen, focusedPassId]);

  if (!report || passes.length === 0) return null;

  const needsAttention = passes.filter((p) => p.status !== 'open').length;

  return (
    <section className="bg-white border border-[#E0E0D6] rounded-2xl shadow-sm overflow-hidden">
      <h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls="mountain-pass-list"
          className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-[#F9F9F7] transition"
        >
          <span className="p-2 rounded-xl bg-[#E9EDC9] text-[#386641] shrink-0">
            <Mountain className="w-4 h-4" aria-hidden="true" />
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold">Fjelloverganger</span>
              {needsAttention > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-rose-50 text-[#BC4749] border border-rose-200 text-[10px] font-extrabold">
                  {needsAttention} stengt/usikre
                </span>
              )}
            </span>
            <span className="block text-[11px] text-[#6B705C] mt-0.5">
              {isOpen
                ? 'Trykk på en overgang for å se den i kartet.'
                : `Se veiledende sesongstatus for ${passes.length} overganger`}
            </span>
          </span>

          <ChevronDown
            aria-hidden="true"
            className={`w-4 h-4 shrink-0 text-[#6B705C] transition-transform duration-300 motion-reduce:transition-none ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </button>
      </h2>

      {/* 0fr → 1fr animates the height without measuring anything in JS. */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
          isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden" inert={!isOpen}>
          <div className="border-t border-[#E0E0D6] p-3 space-y-2.5">
            {/* `relative` makes this the offsetParent the scroll maths above assumes. */}
            <ul
              id="mountain-pass-list"
              ref={listRef}
              className="relative space-y-1.5 max-h-72 overflow-y-auto pr-0.5"
            >
              {passes.map((pass) => {
                const isFocused = pass.id === focusedPassId;

                return (
                  <li key={pass.id}>
                    <button
                      type="button"
                      ref={(node) => {
                        rowRefs.current[pass.id] = node;
                      }}
                      onClick={() => onFocusPass(isFocused ? null : pass.id)}
                      aria-pressed={isFocused}
                      className={`group w-full text-left rounded-xl border px-2.5 py-2 flex items-center gap-2.5 transition ${
                        isFocused
                          ? 'bg-[#E9EDC9] border-[#A7C957] ring-1 ring-[#A7C957]'
                          : 'bg-[#F9F9F7] border-[#E0E0D6] hover:bg-white hover:border-[#A7C957]'
                      }`}
                    >
                      <span
                        className={`w-7 h-7 shrink-0 rounded-lg border flex items-center justify-center ${
                          STATUS_CHIP[pass.status]
                        }`}
                      >
                        <StatusIcon status={pass.status} />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-bold truncate">{pass.name}</span>
                        <span className="block text-[11px] text-[#6B705C] truncate">
                          {pass.road}
                          {pass.summitM ? ` · ${pass.summitM} moh` : ''} · {pass.statusLabel}
                        </span>
                      </span>

                      <Crosshair
                        aria-hidden="true"
                        className={`w-3.5 h-3.5 shrink-0 transition ${
                          isFocused
                            ? 'text-[#386641]'
                            : 'text-[#6B705C] opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
                        }`}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>

            <p className="text-[11px] text-[#6B705C] leading-relaxed">
              Beregnet fra typiske åpnings- og stengedatoer, ikke sanntidsdata.{' '}
              <a
                href={report.verifyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-[#386641] hover:underline inline-flex items-center gap-1"
              >
                Sjekk vegvesen.no før avreise
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
