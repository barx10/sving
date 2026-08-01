import React from 'react';
import type { SavedTour } from '../types';
import { useDismissableOverlay } from '../hooks/useDismissableOverlay';
import { formatDate, formatDuration } from '../utils/format';
import { normalizeProfile } from '../utils/routeProfile';
import { ArrowRight, Bookmark, Clock, Gauge, Mountain, Trash2, X } from 'lucide-react';

interface SavedToursDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  tours: SavedTour[];
  onLoadTour: (tour: SavedTour) => void;
  onDeleteTour: (id: string) => void;
}

const PROFILE_LABEL: Record<SavedTour['profile'], string> = {
  curvy: 'Svingete',
  fastest: 'Raskeste',
};

export const SavedToursDrawer: React.FC<SavedToursDrawerProps> = ({
  isOpen,
  onClose,
  tours,
  onLoadTour,
  onDeleteTour,
}) => {
  useDismissableOverlay(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] bg-[#2D332A]/70 backdrop-blur-sm flex justify-end"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Lagrede MC-turer"
        className="bg-white border-l border-[#E0E0D6] max-w-md w-full h-full p-6 shadow-2xl flex flex-col text-[#2D332A] animate-in slide-in-from-right duration-200"
      >
        <div className="flex items-center justify-between border-b border-[#E0E0D6] pb-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <Bookmark className="w-5 h-5 text-[#386641]" />
            <div>
              <h3 className="text-lg font-bold">Lagrede MC-turer</h3>
              <p className="text-xs text-[#6B705C]">Lagret lokalt på denne enheten</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Lukk"
            className="p-2 rounded-xl text-[#6B705C] hover:text-[#2D332A] hover:bg-[#F9F9F7] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 flex-1 overflow-y-auto pr-1 pt-4">
          {tours.length === 0 ? (
            <div className="py-12 text-center text-[#6B705C] space-y-2">
              <Bookmark className="w-10 h-10 text-[#CCD5AE] mx-auto" />
              <p className="text-sm font-semibold text-[#2D332A]">Ingen lagrede ruter enda.</p>
              <p className="text-xs">Planlegg en rute og bruk «Eksport / GPX» for å lagre den.</p>
            </div>
          ) : (
            tours.map((tour) => (
              <article
                key={tour.id}
                className="bg-[#F9F9F7] border border-[#E0E0D6] hover:border-[#A7C957] rounded-2xl p-4 transition shadow-sm space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold truncate">{tour.title}</h4>
                    <p className="text-[11px] text-[#6B705C] font-mono mt-0.5">
                      {formatDate(tour.createdAt)}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E9EDC9] text-[#5C6B34] border border-[#CCD5AE] shrink-0">
                    {/* Tours saved before the styles merged still say 'scenic'. */}
                    {PROFILE_LABEL[normalizeProfile(tour.profile)]}
                  </span>
                </div>

                {tour.notes && (
                  <p className="text-xs bg-white p-2 rounded-xl border border-[#E0E0D6] italic">
                    {tour.notes}
                  </p>
                )}

                <div className="grid grid-cols-3 gap-2 text-[11px] text-[#6B705C] pt-1">
                  <span className="flex items-center gap-1">
                    <Gauge className="w-3.5 h-3.5 text-[#386641]" />
                    {tour.distanceKm} km
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-[#5C6B34]" />
                    {formatDuration(tour.durationMin)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Mountain className="w-3.5 h-3.5 text-[#386641]" />
                    {/* Older saved tours, and routes saved while the elevation
                        APIs were down, simply have no gain to show. */}
                    {tour.elevationGainM == null ? '–' : `+${tour.elevationGainM} m`}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[#E0E0D6]">
                  <button
                    type="button"
                    onClick={() => onDeleteTour(tour.id)}
                    className="text-xs font-medium text-[#6B705C] hover:text-[#BC4749] transition flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Slett
                  </button>
                  <button
                    type="button"
                    onClick={() => onLoadTour(tour)}
                    className="px-3 py-1.5 rounded-xl bg-[#386641] hover:bg-[#2D332A] text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                  >
                    <span>Last inn rute</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
