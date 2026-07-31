import React from 'react';
import type { RouteResult } from '../types';
import { Modal } from './Modal';
import { ArrowRight, Gauge, Loader2, MapPin, Repeat, RouteIcon } from 'lucide-react';

const RADIUS_OPTIONS_KM = [20, 40, 60, 80] as const;

interface NearbyLoopModalProps {
  isOpen: boolean;
  onClose: () => void;
  radiusKm: number;
  onRadiusChange: (radiusKm: number) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  /** The last loop generated in this session, so the rider can see what they got before committing. */
  result: RouteResult | null;
  onShowPresetsInstead: () => void;
}

export const NearbyLoopModal: React.FC<NearbyLoopModalProps> = ({
  isOpen,
  onClose,
  radiusKm,
  onRadiusChange,
  onGenerate,
  isGenerating,
  result,
  onShowPresetsInstead,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title="Rundtur fra posisjonen din"
    subtitle="Velg hvor langt du vil kjøre — vi finner en svingete vei tilbake til start"
    icon={<MapPin className="w-5 h-5" />}
  >
    <div className="space-y-2">
      <span className="text-xs font-bold text-[#6B705C]">Radius</span>
      <div className="flex flex-wrap gap-2">
        {RADIUS_OPTIONS_KM.map((km) => (
          <button
            key={km}
            type="button"
            onClick={() => onRadiusChange(km)}
            disabled={isGenerating}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold border transition disabled:opacity-60 ${
              radiusKm === km
                ? 'bg-[#386641] text-white border-[#386641]'
                : 'bg-[#F9F9F7] text-[#5C6B34] border-[#E0E0D6] hover:border-[#A7C957]'
            }`}
          >
            {km} km
          </button>
        ))}
      </div>
    </div>

    <button
      type="button"
      onClick={onGenerate}
      disabled={isGenerating}
      className="w-full py-2.5 px-3 rounded-xl bg-[#386641] hover:bg-[#2D332A] text-white font-extrabold text-xs shadow-sm transition flex items-center justify-center gap-2 disabled:opacity-60"
    >
      {isGenerating ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" /> Genererer rundtur...
        </>
      ) : (
        <>
          <RouteIcon className="w-4 h-4" /> {result ? 'Prøv en annen rundtur' : 'Generer rundtur'}
        </>
      )}
    </button>

    {result && (
      <div className="bg-[#F4F7EE] border border-[#CCD5AE] rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap gap-4 text-xs font-mono">
          <span className="flex items-center gap-1.5 font-bold">
            <Gauge className="w-3.5 h-3.5 text-[#386641]" /> {result.summary.distanceKm} km
          </span>
          <span className="text-[#6B705C]">~{Math.round(result.summary.durationMin / 60)} t</span>
          <span className="text-[#6B705C]">{result.summary.curvatureDegPerKm}° sving/km</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2 px-3 rounded-xl bg-white hover:bg-[#E9EDC9] font-bold text-xs border border-[#E0E0D6] transition flex items-center justify-center gap-1.5"
        >
          Bruk denne ruten <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    )}

    <button
      type="button"
      onClick={onShowPresetsInstead}
      className="w-full text-xs font-bold text-[#6B705C] hover:text-[#386641] transition flex items-center justify-center gap-1.5 pt-1"
    >
      <Repeat className="w-3.5 h-3.5" /> Se faste MC-turer i nærheten i stedet
    </button>
  </Modal>
);
