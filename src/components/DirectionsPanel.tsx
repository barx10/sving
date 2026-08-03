import React, { useState } from 'react';
import type { RouteStep } from '../types';
import { ChevronDown, CornerUpRight, Flag, MapPin } from 'lucide-react';

interface DirectionsPanelProps {
  steps: RouteStep[];
  hasRoute: boolean;
}

/**
 * Which cues get an eye-catching marker. A rider scanning this at a petrol
 * pump is looking for the turns; the carry-on lines are context between them.
 */
const isTurn = (instruction: string): boolean =>
  instruction !== 'Fortsett rett fram' && instruction !== 'Start' && instruction !== 'Framme';

export const DirectionsPanel: React.FC<DirectionsPanelProps> = ({ steps, hasRoute }) => {
  const [isOpen, setIsOpen] = useState(false);

  const turns = steps.filter((step) => isTurn(step.instruction)).length;

  return (
    <div className="bg-white border border-[#E0E0D6] rounded-2xl shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between gap-3 p-4 hover:bg-[#F9F9F7] transition text-left"
      >
        <span className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-xl bg-[#E9EDC9] flex items-center justify-center shrink-0">
            <CornerUpRight className="w-4 h-4 text-[#386641]" />
          </span>
          <span>
            <span className="block text-sm font-bold">Veibeskrivelse</span>
            <span className="block text-[11px] text-[#6B705C]">
              {hasRoute && steps.length > 0
                ? `${turns} avkjøringer å holde styr på`
                : 'Avkjøringer og veinavn, punkt for punkt'}
            </span>
          </span>
        </span>
        <ChevronDown
          className={`w-4 h-4 text-[#6B705C] shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="border-t border-[#E0E0D6]">
          {!hasRoute ? (
            <p className="p-5 text-xs text-[#6B705C] text-center leading-relaxed">
              Sett to punkter, så kommer veibeskrivelsen her.
            </p>
          ) : steps.length === 0 ? (
            // Said plainly rather than shown as an empty list: the engine that
            // built this route did not return usable instructions, and inventing
            // them from the line on the map is not something this app does.
            <p className="p-5 text-xs text-[#6B705C] text-center leading-relaxed">
              Rutemotoren ga ingen veibeskrivelse for denne ruta. Kartet og GPX-fila er uendret.
            </p>
          ) : (
            <>
              <ol className="max-h-96 overflow-y-auto divide-y divide-[#E0E0D6]">
                {steps.map((step, idx) => (
                  <li
                    key={`${step.distanceKm}_${idx}`}
                    className="flex items-start gap-3 px-4 py-2.5 text-xs"
                  >
                    <span className="font-mono font-bold text-[#386641] w-14 shrink-0 tabular-nums pt-0.5">
                      {step.distanceKm.toFixed(1)}
                    </span>
                    <span className="shrink-0 pt-0.5">
                      {idx === steps.length - 1 ? (
                        <Flag className="w-3.5 h-3.5 text-[#BC4749]" aria-hidden="true" />
                      ) : isTurn(step.instruction) ? (
                        <CornerUpRight className="w-3.5 h-3.5 text-[#386641]" aria-hidden="true" />
                      ) : (
                        <MapPin className="w-3.5 h-3.5 text-[#6B705C]" aria-hidden="true" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className={`block ${isTurn(step.instruction) ? 'font-bold' : ''}`}>
                        {step.instruction}
                      </span>
                      {step.roadName && (
                        <span className="block text-[#6B705C] truncate">{step.roadName}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="px-4 py-2.5 text-[10px] text-[#6B705C] border-t border-[#E0E0D6] leading-relaxed">
                Kilometertallet er avstand fra start til avkjøringen. Rutemotoren beskriver
                bilkjøring — se etter skilting på stedet.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
};
