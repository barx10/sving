import React, { useState } from 'react';
import type { Waypoint, RouteProfile, RouteSummary, ElevationPoint } from '../types';
import {
  downloadGpxFile,
  buildGoogleMapsUrl,
  buildAppleMapsUrl,
} from '../utils/exportUtils';
import {
  X,
  Download,
  ExternalLink,
  MapPin,
  BookmarkPlus,
  Copy,
  Check,
  Smartphone,
  CheckCircle2,
  Navigation,
} from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  waypoints: Waypoint[];
  polyline: [number, number][];
  elevationPoints: ElevationPoint[];
  summary?: RouteSummary;
  profile: RouteProfile;
  onSaveTour: (title: string, notes: string) => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  waypoints,
  polyline,
  elevationPoints,
  summary,
  profile,
  onSaveTour,
}) => {
  const [tourTitle, setTourTitle] = useState(`${waypoints[0]?.name || 'Start'} til ${waypoints[waypoints.length - 1]?.name || 'Mål'}`);
  const [notes, setNotes] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const googleMapsUrl = buildGoogleMapsUrl(polyline, waypoints);
  const appleMapsUrl = buildAppleMapsUrl(polyline, waypoints);

  const handleDownloadGpx = () => {
    downloadGpxFile(tourTitle, polyline, elevationPoints, waypoints);
  };

  const handleCopyGoogleLink = () => {
    navigator.clipboard.writeText(googleMapsUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleSaveToDevice = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveTour(tourTitle || 'Norsk MC-tur', notes);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <div id="export-modal-backdrop" className="fixed inset-0 z-[2000] bg-[#2D332A]/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white border border-[#E0E0D6] rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 text-[#2D332A] animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#E0E0D6] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#E9EDC9] text-[#386641] flex items-center justify-center border border-[#CCD5AE]">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#2D332A]">Eksport & Navigasjon</h3>
              <p className="text-xs text-[#6B705C]">Ingen navigasjon i appen — eksporter ruten direkte</p>
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

        {/* Tour Title Input */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-[#6B705C] uppercase tracking-wider">Navn på MC-Turen</label>
          <input
            type="text"
            value={tourTitle}
            onChange={(e) => setTourTitle(e.target.value)}
            className="w-full bg-[#F9F9F7] border border-[#E0E0D6] focus:border-[#A7C957] rounded-xl px-3.5 py-2.5 text-sm text-[#2D332A] font-semibold focus:outline-none transition"
            placeholder="Navngi turen..."
          />
        </div>

        {/* Export Buttons Grid */}
        <div className="space-y-2.5">
          <label className="text-[10px] font-bold text-[#6B705C] uppercase tracking-wider">Eksport-metoder</label>

          {/* 1. Google Maps Deep Link (With Smart Waypoint Reduction) */}
          <div className="p-3.5 rounded-2xl bg-[#F9F9F7] border border-[#E0E0D6] flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#E9EDC9] text-[#386641] flex items-center justify-center font-black">
                G
              </div>
              <div>
                <h4 className="text-sm font-bold text-[#2D332A]">Åpne i Google Maps App</h4>
                <p className="text-xs text-[#6B705C]">Med smart waypoint-reduksjon for svingete trasé</p>
              </div>
            </div>
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#386641] hover:bg-[#2D332A] text-white text-xs font-bold shadow-sm transition shrink-0"
            >
              <span>Åpne</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* 2. Apple Maps Link */}
          <div className="p-3.5 rounded-2xl bg-[#F9F9F7] border border-[#E0E0D6] flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#E0E0D6] text-[#2D332A] flex items-center justify-center font-black">
                🍎
              </div>
              <div>
                <h4 className="text-sm font-bold text-[#2D332A]">Åpne i Apple Maps App</h4>
                <p className="text-xs text-[#6B705C]">Direkte navigasjon på iOS og Mac</p>
              </div>
            </div>
            <a
              href={appleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#F4F4EF] hover:bg-[#E0E0D6] text-[#2D332A] text-xs font-bold border border-[#E0E0D6] transition shrink-0"
            >
              <span>Åpne</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* 3. Pure GPX File Download */}
          <div className="p-3.5 rounded-2xl bg-[#F9F9F7] border border-[#E0E0D6] flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#A7C957] text-[#2D332A] flex items-center justify-center font-extrabold text-xs">
                GPX
              </div>
              <div>
                <h4 className="text-sm font-bold text-[#2D332A]">Last ned GPX-fil</h4>
                <p className="text-xs text-[#6B705C]">For Garmin Zumo, OsmAnd, BMW ConnectedApp m.m.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDownloadGpx}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#386641] hover:bg-[#2D332A] text-white text-xs font-extrabold shadow-sm transition shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Last ned</span>
            </button>
          </div>
        </div>

        {/* Save to Local Device Form */}
        <form onSubmit={handleSaveToDevice} className="pt-3 border-t border-[#E0E0D6] space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold text-[#6B705C] uppercase tracking-wider">Lagre rute lokalt (IndexedDB)</label>
            {savedSuccess && (
              <span className="text-xs font-bold text-[#386641] flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Lagret på enheten!
              </span>
            )}
          </div>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notater (valgfritt: f.eks. 'Stopp for vaffel på Dalsnibba')"
            className="w-full bg-[#F9F9F7] border border-[#E0E0D6] focus:border-[#A7C957] rounded-xl px-3.5 py-2 text-xs text-[#2D332A] placeholder-[#6B705C] focus:outline-none transition"
          />
          <button
            type="submit"
            className="w-full py-2.5 rounded-xl bg-[#F9F9F7] hover:bg-[#E9EDC9] text-[#2D332A] text-xs font-bold border border-[#E0E0D6] transition flex items-center justify-center gap-2"
          >
            <BookmarkPlus className="w-4 h-4 text-[#386641]" />
            <span>Lagre Rute i Minne</span>
          </button>
        </form>
      </div>
    </div>
  );
};
