import React from 'react';
import type { PresetRoute } from '../types';
import { PRESET_ROUTES } from '../data/presetRoutes';
import { Modal } from './Modal';
import { ArrowRight, Clock, Gauge, Sparkles } from 'lucide-react';

interface PresetRoutesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPreset: (preset: PresetRoute) => void;
}

export const PresetRoutesModal: React.FC<PresetRoutesModalProps> = ({
  isOpen,
  onClose,
  onSelectPreset,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title="Norges beste MC-ruter"
    subtitle="Klassiske svingete ruter gjennom fjell- og fjordlandskap"
    icon={<Sparkles className="w-5 h-5" />}
    widthClass="max-w-2xl"
  >
    <ul className="space-y-3.5">
      {PRESET_ROUTES.map((route) => (
        <li
          key={route.id}
          className="bg-[#F9F9F7] border border-[#E0E0D6] hover:border-[#A7C957] rounded-2xl p-4 transition shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group"
        >
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-[#E9EDC9] text-[#5C6B34] border border-[#CCD5AE]">
                {route.region}
              </span>
              <span className="text-xs text-[#6B705C] font-mono">{route.waypoints.length} stopp</span>
            </div>

            <h4 className="text-base font-bold group-hover:text-[#386641] transition">{route.title}</h4>
            <p className="text-xs text-[#6B705C] leading-relaxed">{route.description}</p>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {route.highlights.map((highlight) => (
                <span
                  key={highlight}
                  className="text-[10px] font-medium bg-white px-2 py-0.5 rounded-md border border-[#E0E0D6]"
                >
                  {highlight}
                </span>
              ))}
            </div>
          </div>

          <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#E0E0D6]">
            <div className="text-right text-xs space-y-0.5">
              <div className="font-bold font-mono flex items-center justify-end gap-1">
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
              <span>Velg rute</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </li>
      ))}
    </ul>
  </Modal>
);
