import React from 'react';
import type { PresetRoute } from '../types';
import { PRESET_ROUTES } from '../data/presetRoutes';
import { X, Sparkles, MapPin, ArrowRight, Mountain, Gauge, Clock } from 'lucide-react';

interface PresetRoutesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPreset: (preset: PresetRoute) => void;
}

export const PresetRoutesModal: React.FC<PresetRoutesModalProps> = ({
  isOpen,
  onClose,
  onSelectPreset,
}) => {
  if (!isOpen) return null;

  return (
    <div id="preset-modal-backdrop" className="fixed inset-0 z-[2000] bg-[#2D332A]/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white border border-[#E0E0D6] rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-5 text-[#2D332A] max-h-[90vh] flex flex-col justify-between animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E0E0D6] pb-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#E9EDC9] text-[#386641] flex items-center justify-center border border-[#CCD5AE]">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#2D332A]">Norges Beste MC-Ruter</h3>
              <p className="text-xs text-[#6B705C]">Klassiske svingete ruter med fjell- og fjordlandskap</p>
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

        {/* Preset Cards List */}
        <div className="space-y-3.5 overflow-y-auto pr-1 flex-1">
          {PRESET_ROUTES.map((route) => (
            <div
              key={route.id}
              className="bg-[#F9F9F7] border border-[#E0E0D6] hover:border-[#A7C957] rounded-2xl p-4 transition shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group"
            >
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-[#E9EDC9] text-[#5C6B34] border border-[#CCD5AE]">
                    {route.region}
                  </span>
                  <span className="text-xs text-[#6B705C] font-mono">
                    {route.waypoints.length} stopp
                  </span>
                </div>
                <h4 className="text-base font-bold text-[#2D332A] group-hover:text-[#386641] transition">
                  {route.title}
                </h4>
                <p className="text-xs text-[#6B705C] leading-relaxed">
                  {route.description}
                </p>

                {/* Highlights tags */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {route.highlights.map((h, idx) => (
                    <span
                      key={idx}
                      className="text-[10px] font-medium bg-white text-[#2D332A] px-2 py-0.5 rounded-md border border-[#E0E0D6]"
                    >
                      ✨ {h}
                    </span>
                  ))}
                </div>
              </div>

              {/* Stats & Select Action */}
              <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#E0E0D6]">
                <div className="text-right text-xs space-y-0.5">
                  <div className="font-bold text-[#2D332A] font-mono flex items-center justify-end gap-1">
                    <Gauge className="w-3.5 h-3.5 text-[#386641]" /> {route.distanceKm} km
                  </div>
                  <div className="text-[#6B705C] font-mono flex items-center justify-end gap-1">
                    <Clock className="w-3.5 h-3.5 text-[#5C6B34]" /> ~{route.estimatedHours} t
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onSelectPreset(route)}
                  className="px-4 py-2 rounded-xl bg-[#386641] hover:bg-[#2D332A] text-white font-extrabold text-xs shadow-sm transition flex items-center gap-1.5 shrink-0"
                >
                  <span>Velg Rute</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
