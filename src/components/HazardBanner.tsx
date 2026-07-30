import React from 'react';
import type { RoadHazard } from '../types';
import { AlertTriangle, ShieldCheck, Mountain, CheckCircle2 } from 'lucide-react';

interface HazardBannerProps {
  hazards: RoadHazard[];
}

export const HazardBanner: React.FC<HazardBannerProps> = ({ hazards }) => {
  if (!hazards || hazards.length === 0) return null;

  const closedPasses = hazards.filter((h) => h.status === 'closed');

  return (
    <div id="hazard-banner-container" className="space-y-2">
      {/* Alert for closed mountain passes */}
      {closedPasses.length > 0 && (
        <div className="bg-[#BC4749] border border-[#8B3436] rounded-2xl p-4 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-md">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-white/20 text-white shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Advarsel: {closedPasses.length} Stengte Fjelloverganger i Norge</span>
              </h4>
              <p className="text-xs text-white/90 mt-0.5">
                Statens vegvesen melder at følgende fjelloverganger er stengt for trafikk:
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {closedPasses.map((cp) => (
                  <span
                    key={cp.id}
                    className="px-2.5 py-1 rounded-lg bg-white/20 text-white border border-white/30 text-xs font-bold"
                  >
                    ⛔ {cp.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Accordion / status bar of active key mountain passes */}
      <div className="bg-white border border-[#E0E0D6] rounded-2xl p-3 shadow-sm flex items-center justify-between gap-2 overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-2 shrink-0 pr-2 border-r border-[#E0E0D6]">
          <Mountain className="w-4 h-4 text-[#386641]" />
          <span className="text-xs font-bold text-[#2D332A]">Vegvesen Fjellpass:</span>
        </div>

        <div className="flex items-center gap-2">
          {hazards.slice(0, 6).map((hz) => (
            <div
              key={hz.id}
              className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                hz.status === 'closed'
                  ? 'bg-rose-50 text-[#BC4749] border-rose-200'
                  : 'bg-[#E9EDC9] text-[#386641] border-[#CCD5AE]'
              }`}
            >
              {hz.status === 'closed' ? (
                <AlertTriangle className="w-3 h-3 text-[#BC4749]" />
              ) : (
                <CheckCircle2 className="w-3 h-3 text-[#386641]" />
              )}
              <span>{hz.name.split(' ')[0]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
