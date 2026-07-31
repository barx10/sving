import React from 'react';
import type { PresetRoute } from '../types';
import { Modal } from './Modal';
import { ArrowRight, Clock, Gauge, Navigation } from 'lucide-react';

interface NearbyRouteModalProps {
  isOpen: boolean;
  onClose: () => void;
  suggestions: { preset: PresetRoute; distanceKm: number }[];
  onSelectRoute: (preset: PresetRoute, startFromUserPosition: boolean) => void;
}

export const NearbyRouteModal: React.FC<NearbyRouteModalProps> = ({
  isOpen,
  onClose,
  suggestions,
  onSelectRoute,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title="MC-ruter i nærheten"
    subtitle="Sortert etter avstand fra posisjonen din"
    icon={<Navigation className="w-5 h-5" />}
    widthClass="max-w-2xl"
  >
    {suggestions.length === 0 ? (
      <p className="text-center py-8 text-[#6B705C] text-xs">Ingen ruter funnet i nærheten.</p>
    ) : (
      <ul className="space-y-3.5">
        {suggestions.map(({ preset, distanceKm }, index) => {
          const isClosest = index === 0;

          return (
            <li
              key={preset.id}
              className={`bg-[#F9F9F7] border rounded-2xl p-4 transition shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                isClosest
                  ? 'border-[#386641] ring-1 ring-[#386641]/20 bg-[#F4F7EE]'
                  : 'border-[#E0E0D6] hover:border-[#A7C957]'
              }`}
            >
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full ${
                      isClosest
                        ? 'bg-[#386641] text-white'
                        : 'bg-[#E9EDC9] text-[#5C6B34] border border-[#CCD5AE]'
                    }`}
                  >
                    {isClosest ? `Nærmest deg (${distanceKm} km)` : `${distanceKm} km unna start`}
                  </span>
                  <span className="text-xs text-[#6B705C] font-mono">{preset.region}</span>
                </div>

                <h4 className="text-base font-bold">{preset.title}</h4>
                <p className="text-xs text-[#6B705C] leading-relaxed">{preset.description}</p>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {preset.highlights.map((highlight) => (
                    <span
                      key={highlight}
                      className="text-[10px] font-medium bg-white px-2 py-0.5 rounded-md border border-[#E0E0D6]"
                    >
                      {highlight}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-col sm:items-end justify-between w-full sm:w-auto gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#E0E0D6]">
                <div className="text-right text-xs space-y-0.5 hidden sm:block">
                  <div className="font-bold font-mono flex items-center justify-end gap-1">
                    <Gauge className="w-3.5 h-3.5 text-[#386641]" /> {preset.distanceKm} km
                  </div>
                  <div className="text-[#6B705C] font-mono flex items-center justify-end gap-1">
                    <Clock className="w-3.5 h-3.5 text-[#5C6B34]" /> ~{preset.estimatedHours} t
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => onSelectRoute(preset, true)}
                    className="px-3 py-2 rounded-xl bg-[#386641] hover:bg-[#2D332A] text-white font-extrabold text-xs shadow-sm transition flex items-center justify-center gap-1.5"
                  >
                    <Navigation className="w-3.5 h-3.5" /> Start fra min posisjon
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectRoute(preset, false)}
                    className="px-3 py-1.5 rounded-xl bg-white hover:bg-[#E9EDC9] font-bold text-xs border border-[#E0E0D6] transition flex items-center justify-center gap-1"
                  >
                    Standard rute <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    )}
  </Modal>
);
