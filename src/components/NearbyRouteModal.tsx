import React from 'react';
import type { PresetRoute, Waypoint } from '../types';
import { MapPin, Sparkles, Navigation, ArrowRight, X, Gauge, Clock, Compass } from 'lucide-react';

interface NearbyRouteModalProps {
  isOpen: boolean;
  onClose: () => void;
  suggestions: { preset: PresetRoute; distanceKm: number }[];
  userCoords: { lat: number; lng: number } | null;
  onSelectRoute: (preset: PresetRoute, setStartToUserPos: boolean) => void;
}

export const NearbyRouteModal: React.FC<NearbyRouteModalProps> = ({
  isOpen,
  onClose,
  suggestions,
  onSelectRoute,
}) => {
  if (!isOpen) return null;

  return (
    <div id="nearby-modal-backdrop" className="fixed inset-0 z-[2000] bg-[#2D332A]/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white border border-[#E0E0D6] rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-5 text-[#2D332A] max-h-[90vh] flex flex-col justify-between animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#E0E0D6] pb-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[#E9EDC9] text-[#386641] flex items-center justify-center border border-[#CCD5AE]">
              <Navigation className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#2D332A]">MC-ruter i nærheten av deg</h3>
              <p className="text-xs text-[#6B705C]">Forslag sortert etter avstand fra din posisjon i Norge</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-[#6B705C] hover:text-[#2D332A] hover:bg-[#F9F9F7] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List of Suggestions */}
        <div className="space-y-3.5 overflow-y-auto pr-1 flex-1">
          {suggestions.length === 0 ? (
            <div className="text-center py-8 text-[#6B705C] text-xs">
              Ingen ruter funnet i nærheten.
            </div>
          ) : (
            suggestions.map(({ preset, distanceKm }, index) => {
              const isClosest = index === 0;

              return (
                <div
                  key={preset.id}
                  className={`bg-[#F9F9F7] border rounded-2xl p-4 transition shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                    isClosest ? 'border-[#386641] ring-1 ring-[#386641]/20 bg-[#F4F7EE]' : 'border-[#E0E0D6] hover:border-[#A7C957]'
                  }`}
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isClosest && (
                        <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-[#386641] text-white">
                          📍 Nærmest deg ({distanceKm} km)
                        </span>
                      )}
                      {!isClosest && (
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-[#E9EDC9] text-[#5C6B34] border border-[#CCD5AE]">
                          {distanceKm} km unna start
                        </span>
                      )}
                      <span className="text-xs text-[#6B705C] font-mono">{preset.region}</span>
                    </div>

                    <h4 className="text-base font-bold text-[#2D332A]">
                      {preset.title}
                    </h4>

                    <p className="text-xs text-[#6B705C] leading-relaxed">
                      {preset.description}
                    </p>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {preset.highlights.map((hl, i) => (
                        <span
                          key={i}
                          className="text-[10px] font-medium bg-white text-[#2D332A] px-2 py-0.5 rounded-md border border-[#E0E0D6]"
                        >
                          {hl}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col sm:items-end justify-between w-full sm:w-auto gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#E0E0D6]">
                    <div className="text-right text-xs space-y-0.5 hidden sm:block">
                      <div className="font-bold text-[#2D332A] font-mono flex items-center justify-end gap-1">
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
                        className="px-3 py-1.5 rounded-xl bg-white hover:bg-[#E9EDC9] text-[#2D332A] font-bold text-xs border border-[#E0E0D6] transition flex items-center justify-center gap-1"
                      >
                        Standard rute <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
