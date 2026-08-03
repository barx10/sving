import React, { useEffect, useRef, useState } from 'react';
import type { Notice, RouteProfile, RouteResult, Waypoint } from '../types';
import { buildAppleMapsUrl, buildGoogleMapsUrl, downloadGpxFile } from '../utils/exportUtils';
import { buildShareUrl } from '../utils/routeLink';
import { hasCoords } from '../utils/geo';
import { Modal } from './Modal';
import { GpxImportError, parseGpx, type ImportedRoute } from '../utils/gpxImport';
import { BookmarkPlus, Check, CheckCircle2, Copy, Download, ExternalLink, Share2, Upload } from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  waypoints: Waypoint[];
  route: RouteResult | null;
  profile: RouteProfile;
  avoidHighways: boolean;
  onSaveTour: (title: string, notes: string) => Promise<void>;
  onNotify: (tone: Notice['tone'], message: string) => void;
  /** Hands an imported file's points to the planner, which routes between them. */
  onImportRoute: (imported: ImportedRoute) => void;
  /** How many points the planner can hold, so thinning happens before it sees them. */
  maxWaypoints: number;
}

const ExportRow: React.FC<{
  badge: React.ReactNode;
  title: string;
  description: string;
  action: React.ReactNode;
}> = ({ badge, title, description, action }) => (
  <div className="p-3.5 rounded-2xl bg-[#F9F9F7] border border-[#E0E0D6] flex items-center justify-between gap-3">
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black shrink-0 bg-[#E9EDC9] text-[#386641]">
        {badge}
      </div>
      <div className="min-w-0">
        <h4 className="text-sm font-bold">{title}</h4>
        <p className="text-xs text-[#6B705C]">{description}</p>
      </div>
    </div>
    <div className="shrink-0">{action}</div>
  </div>
);

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  waypoints,
  route,
  profile,
  avoidHighways,
  onSaveTour,
  onNotify,
  onImportRoute,
  maxWaypoints,
}) => {
  const [tourTitle, setTourTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Reads the file here rather than on the server: a GPX is the rider's own
   * track, and this app has no business seeing it. Nothing leaves the browser.
   */
  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Clearing it now means picking the same file twice in a row still fires.
    event.target.value = '';
    if (!file) return;

    try {
      onImportRoute(parseGpx(await file.text(), maxWaypoints));
      onClose();
    } catch (err) {
      onNotify(
        'error',
        err instanceof GpxImportError ? err.message : 'Kunne ikke lese GPX-fila.'
      );
    }
  };

  const placed = waypoints.filter(hasCoords);

  // Reset the suggested name each time the dialog opens, so it reflects the
  // route the rider is actually looking at.
  useEffect(() => {
    if (!isOpen) return;
    const from = placed[0]?.name || 'Start';
    const to = placed[placed.length - 1]?.name || 'Mål';
    setTourTitle(`${from} – ${to}`);
    setSavedSuccess(false);
    setCopiedShareLink(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const polyline = route?.polyline ?? [];
  const shareUrl = buildShareUrl(placed, profile, avoidHighways);

  const handleShare = async () => {
    if (!shareUrl) return;

    // On a phone this opens the native share sheet, which is how a route
    // actually gets into a club's group chat.
    if (navigator.share) {
      try {
        await navigator.share({ title: tourTitle || 'MC-tur', url: shareUrl });
        return;
      } catch {
        // The rider dismissed the sheet, or sharing is unavailable — fall through to copy.
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedShareLink(true);
      setTimeout(() => setCopiedShareLink(false), 2000);
    } catch {
      onNotify('error', 'Kunne ikke kopiere lenken. Kopier den fra adressefeltet i stedet.');
    }
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await onSaveTour(tourTitle || 'MC-tur', notes);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch {
      onNotify('error', 'Kunne ikke lagre turen på enheten.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Del, eksporter og hent inn"
      subtitle="Ta ruten med til GPS, mobil eller kompisen — eller hent inn en GPX"
      icon={<Download className="w-5 h-5" />}
    >
      <div className="space-y-1.5">
        <label htmlFor="tour-title" className="text-[10px] font-bold text-[#6B705C] uppercase tracking-wider">
          Navn på turen
        </label>
        <input
          id="tour-title"
          type="text"
          value={tourTitle}
          onChange={(e) => setTourTitle(e.target.value)}
          className="w-full bg-[#F9F9F7] border border-[#E0E0D6] focus:border-[#A7C957] rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:outline-none transition"
          placeholder="Navngi turen..."
        />
      </div>

      <div className="space-y-2.5">
        <span className="text-[10px] font-bold text-[#6B705C] uppercase tracking-wider">Del og eksporter</span>

        <ExportRow
          badge={<Share2 className="w-5 h-5" />}
          title="Del lenke til ruten"
          description="Mottakeren får hele ruten – ingen konto nødvendig"
          action={
            <button
              type="button"
              onClick={handleShare}
              disabled={!shareUrl}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#386641] hover:bg-[#2D332A] text-white text-xs font-bold shadow-sm transition disabled:opacity-40"
            >
              {copiedShareLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedShareLink ? 'Kopiert' : 'Del'}</span>
            </button>
          }
        />

        <ExportRow
          badge="GPX"
          title="Last ned GPX-fil"
          description="For Garmin Zumo, OsmAnd, BMW ConnectedRide m.m."
          action={
            <button
              type="button"
              onClick={() => downloadGpxFile(tourTitle, polyline, route?.elevationPoints ?? [], placed)}
              disabled={polyline.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#386641] hover:bg-[#2D332A] text-white text-xs font-extrabold shadow-sm transition disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Last ned</span>
            </button>
          }
        />

        <ExportRow
          badge="G"
          title="Åpne i Google Maps"
          description="Med utvalgte veipunkter så den svingete traseen beholdes"
          action={
            <a
              href={buildGoogleMapsUrl(polyline, placed)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-[#E9EDC9] text-xs font-bold border border-[#E0E0D6] transition"
            >
              <span>Åpne</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          }
        />

        <ExportRow
          badge="🍎"
          title="Åpne i Apple Maps"
          description="Start og mål – Apple Maps støtter ikke via-punkter i lenker"
          action={
            <a
              href={buildAppleMapsUrl(polyline, placed)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-[#E9EDC9] text-xs font-bold border border-[#E0E0D6] transition"
            >
              <span>Åpne</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          }
        />
        <ExportRow
          badge={<Upload className="w-5 h-5" />}
          title="Hent inn GPX-fil"
          description="Åpne en tur fra en kompis eller et forum, med vær og bensin langs den"
          action={
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#F9F9F7] hover:bg-[#E9EDC9] text-xs font-bold border border-[#E0E0D6] transition"
            >
              <Upload className="w-3.5 h-3.5 text-[#386641]" />
              <span>Velg fil</span>
            </button>
          }
        />

        <input
          ref={fileInputRef}
          type="file"
          accept=".gpx,application/gpx+xml,application/xml,text/xml"
          onChange={handleImportFile}
          className="hidden"
        />
      </div>

      <form onSubmit={handleSave} className="pt-3 border-t border-[#E0E0D6] space-y-3">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="tour-notes" className="text-[10px] font-bold text-[#6B705C] uppercase tracking-wider">
            Lagre på denne enheten
          </label>
          {savedSuccess && (
            <span className="text-xs font-bold text-[#386641] flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Lagret
            </span>
          )}
        </div>
        <input
          id="tour-notes"
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notat (valgfritt), f.eks. «stopp for vaffel på Dalsnibba»"
          className="w-full bg-[#F9F9F7] border border-[#E0E0D6] focus:border-[#A7C957] rounded-xl px-3.5 py-2 text-xs focus:outline-none transition"
        />
        <button
          type="submit"
          disabled={!route}
          className="w-full py-2.5 rounded-xl bg-[#F9F9F7] hover:bg-[#E9EDC9] text-xs font-bold border border-[#E0E0D6] transition flex items-center justify-center gap-2 disabled:opacity-40"
        >
          <BookmarkPlus className="w-4 h-4 text-[#386641]" />
          <span>Lagre turen</span>
        </button>
      </form>
    </Modal>
  );
};
