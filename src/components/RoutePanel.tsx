import React, { useEffect, useMemo, useRef } from 'react';
import type {
  HazardReport,
  MountainPassStatus,
  PassStatus,
  PointOfInterest,
  PoiCategory,
} from '../types';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Crosshair,
  ExternalLink,
  Fuel,
  HelpCircle,
  Loader2,
  Mountain,
  RotateCcw,
  Route,
  TreePine,
} from 'lucide-react';

export type RouteLayer = 'passes' | 'fuel' | 'rest_area';

export type PoiStatus = 'idle' | 'loading' | 'ready' | 'error';

interface RoutePanelProps {
  report: HazardReport | null;
  pois: PointOfInterest[];
  poiStatus: PoiStatus;
  poiError: string | null;
  hasRoute: boolean;
  isOpen: boolean;
  onToggle: () => void;
  activeLayer: RouteLayer;
  onLayerChange: (layer: RouteLayer) => void;
  focusedId: string | null;
  onFocusItem: (id: string | null) => void;
  onRetryPois: () => void;
}

const STATUS_CHIP: Record<PassStatus, string> = {
  open: 'bg-[#E9EDC9] text-[#386641] border-[#CCD5AE]',
  uncertain: 'bg-amber-50 text-amber-800 border-amber-200',
  closed_seasonal: 'bg-rose-50 text-[#BC4749] border-rose-200',
};

/** Stengt og usikkert først — det er de som endrer en tur. */
const STATUS_ORDER: Record<PassStatus, number> = {
  closed_seasonal: 0,
  uncertain: 1,
  open: 2,
};

const TABS: { id: RouteLayer; label: string; icon: React.ReactNode }[] = [
  { id: 'passes', label: 'Fjelloverganger', icon: <Mountain className="w-3.5 h-3.5" /> },
  { id: 'fuel', label: 'Bensin', icon: <Fuel className="w-3.5 h-3.5" /> },
  { id: 'rest_area', label: 'Rasteplasser', icon: <TreePine className="w-3.5 h-3.5" /> },
];

const StatusIcon: React.FC<{ status: PassStatus }> = ({ status }) => {
  if (status === 'closed_seasonal') return <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />;
  if (status === 'uncertain') return <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />;
  return <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />;
};

/** One row of the list, whichever layer it belongs to. */
const ItemRow: React.FC<{
  id: string;
  title: string;
  subtitle: string;
  badge: React.ReactNode;
  badgeClass: string;
  isFocused: boolean;
  onFocus: (id: string | null) => void;
  rowRef: (node: HTMLButtonElement | null) => void;
}> = ({ id, title, subtitle, badge, badgeClass, isFocused, onFocus, rowRef }) => (
  <li>
    <button
      type="button"
      ref={rowRef}
      onClick={() => onFocus(isFocused ? null : id)}
      aria-pressed={isFocused}
      className={`group w-full text-left rounded-xl border px-2.5 py-2 flex items-center gap-2.5 transition ${
        isFocused
          ? 'bg-[#E9EDC9] border-[#A7C957] ring-1 ring-[#A7C957]'
          : 'bg-[#F9F9F7] border-[#E0E0D6] hover:bg-white hover:border-[#A7C957]'
      }`}
    >
      <span className={`w-7 h-7 shrink-0 rounded-lg border flex items-center justify-center ${badgeClass}`}>
        {badge}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold truncate">{title}</span>
        <span className="block text-[11px] text-[#6B705C] truncate">{subtitle}</span>
      </span>

      <Crosshair
        aria-hidden="true"
        className={`w-3.5 h-3.5 shrink-0 transition ${
          isFocused
            ? 'text-[#386641]'
            : 'text-[#6B705C] opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
        }`}
      />
    </button>
  </li>
);

const EmptyState: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-xs text-[#6B705C] text-center py-6 px-3 leading-relaxed">{children}</p>
);

/**
 * Everything worth knowing about the road ahead, in one panel the rider opens
 * when they want it.
 *
 * The mountain pass season is a calendar model, not a live feed from Statens
 * vegvesen, and the UI must not imply otherwise — a rider who trusts a green
 * chip in October and finds a locked gate at 1400 metres has been let down by
 * this app. Fuel and rest areas are the opposite: live OpenStreetMap data,
 * which is current but only as complete as whoever mapped that valley.
 */
export const RoutePanel: React.FC<RoutePanelProps> = ({
  report,
  pois,
  poiStatus,
  poiError,
  hasRoute,
  isOpen,
  onToggle,
  activeLayer,
  onLayerChange,
  focusedId,
  onFocusItem,
  onRetryPois,
}) => {
  const listRef = useRef<HTMLUListElement>(null);
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const passes = useMemo<MountainPassStatus[]>(() => {
    if (!report) return [];
    return [...report.passes].sort(
      (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name, 'no')
    );
  }, [report]);

  const visiblePois = useMemo(
    () => pois.filter((poi) => poi.category === (activeLayer as PoiCategory)),
    [pois, activeLayer]
  );

  // A place picked on the map should not stay hidden further down the list.
  // Only the list itself scrolls — scrollIntoView would drag the whole page
  // along and push the map the rider is looking at off the screen.
  useEffect(() => {
    if (!isOpen || !focusedId) return;

    const list = listRef.current;
    const row = rowRefs.current[focusedId];
    if (!list || !row) return;

    const top = row.offsetTop;
    const bottom = top + row.offsetHeight;

    if (top < list.scrollTop) {
      list.scrollTo({ top, behavior: 'smooth' });
    } else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTo({ top: bottom - list.clientHeight, behavior: 'smooth' });
    }
  }, [isOpen, focusedId, activeLayer]);

  const needsAttention = passes.filter((p) => p.status !== 'open').length;

  return (
    <section className="bg-white border border-[#E0E0D6] rounded-2xl shadow-sm overflow-hidden">
      <h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls="route-panel-list"
          className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-[#F9F9F7] transition"
        >
          <span className="p-2 rounded-xl bg-[#E9EDC9] text-[#386641] shrink-0">
            <Route className="w-4 h-4" aria-hidden="true" />
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold">Langs ruta</span>
              {needsAttention > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-rose-50 text-[#BC4749] border border-rose-200 text-[10px] font-extrabold">
                  {needsAttention} stengt/usikre
                </span>
              )}
            </span>
            <span className="block text-[11px] text-[#6B705C] mt-0.5">
              {isOpen
                ? 'Trykk på et sted for å se det i kartet.'
                : 'Fjelloverganger, bensin og rasteplasser'}
            </span>
          </span>

          <ChevronDown
            aria-hidden="true"
            className={`w-4 h-4 shrink-0 text-[#6B705C] transition-transform duration-300 motion-reduce:transition-none ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </button>
      </h2>

      {/* 0fr → 1fr animates the height without measuring anything in JS. */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
          isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden" inert={!isOpen}>
          <div className="border-t border-[#E0E0D6] p-3 space-y-2.5">
            <div
              className="flex items-center gap-1 bg-[#F9F9F7] p-1 rounded-xl border border-[#E0E0D6]"
              role="tablist"
              aria-label="Hva som vises langs ruta"
            >
              {TABS.map(({ id, label, icon }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={activeLayer === id}
                  onClick={() => onLayerChange(id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-bold transition ${
                    activeLayer === id
                      ? 'bg-white text-[#386641] shadow-sm border border-[#CCD5AE]'
                      : 'text-[#6B705C] hover:text-[#2D332A]'
                  }`}
                >
                  {icon}
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </div>

            <ul
              id="route-panel-list"
              ref={listRef}
              className="relative space-y-1.5 max-h-72 overflow-y-auto pr-0.5"
            >
              {activeLayer === 'passes' &&
                passes.map((pass) => (
                  <ItemRow
                    key={pass.id}
                    id={pass.id}
                    title={pass.name}
                    subtitle={`${pass.road}${pass.summitM ? ` · ${pass.summitM} moh` : ''} · ${pass.statusLabel}`}
                    badge={<StatusIcon status={pass.status} />}
                    badgeClass={STATUS_CHIP[pass.status]}
                    isFocused={pass.id === focusedId}
                    onFocus={onFocusItem}
                    rowRef={(node) => {
                      rowRefs.current[pass.id] = node;
                    }}
                  />
                ))}

              {activeLayer !== 'passes' &&
                visiblePois.map((poi) => (
                  <ItemRow
                    key={poi.id}
                    id={poi.id}
                    title={poi.name}
                    subtitle={describePoi(poi)}
                    badge={
                      poi.category === 'fuel' ? (
                        <Fuel className="w-3.5 h-3.5" aria-hidden="true" />
                      ) : (
                        <TreePine className="w-3.5 h-3.5" aria-hidden="true" />
                      )
                    }
                    badgeClass="bg-[#E9EDC9] text-[#386641] border-[#CCD5AE]"
                    isFocused={poi.id === focusedId}
                    onFocus={onFocusItem}
                    rowRef={(node) => {
                      rowRefs.current[poi.id] = node;
                    }}
                  />
                ))}

              {activeLayer === 'passes' && passes.length === 0 && (
                <EmptyState>Henter status for fjellovergangene...</EmptyState>
              )}

              {activeLayer !== 'passes' && !hasRoute && (
                <EmptyState>
                  Beregn en rute først, så finner vi{' '}
                  {activeLayer === 'fuel' ? 'bensinstasjoner' : 'rasteplasser'} langs den.
                </EmptyState>
              )}

              {activeLayer !== 'passes' && hasRoute && poiStatus === 'loading' && (
                <p className="text-xs text-[#6B705C] flex items-center justify-center gap-2 py-6">
                  <Loader2 className="w-4 h-4 animate-spin text-[#386641]" />
                  Søker langs ruta...
                </p>
              )}

              {activeLayer !== 'passes' && hasRoute && poiStatus === 'error' && (
                <div className="py-5 px-3 text-center space-y-2">
                  <p className="text-xs text-[#BC4749] leading-relaxed">
                    {poiError || 'Kunne ikke søke langs ruta.'}
                  </p>
                  <button
                    type="button"
                    onClick={onRetryPois}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F9F9F7] hover:bg-[#E9EDC9] border border-[#E0E0D6] text-[11px] font-bold transition"
                  >
                    <RotateCcw className="w-3 h-3 text-[#386641]" /> Prøv igjen
                  </button>
                </div>
              )}

              {activeLayer !== 'passes' &&
                hasRoute &&
                poiStatus === 'ready' &&
                visiblePois.length === 0 && (
                  <EmptyState>
                    Fant ingen {activeLayer === 'fuel' ? 'bensinstasjoner' : 'rasteplasser'} langs
                    denne ruta i OpenStreetMap.
                  </EmptyState>
                )}
            </ul>

            {activeLayer === 'passes' ? (
              <p className="text-[11px] text-[#6B705C] leading-relaxed">
                Beregnet fra typiske åpnings- og stengedatoer, ikke sanntidsdata.{' '}
                {report && (
                  <a
                    href={report.verifyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-[#386641] hover:underline inline-flex items-center gap-1"
                  >
                    Sjekk vegvesen.no før avreise
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </a>
                )}
              </p>
            ) : (
              <p className="text-[11px] text-[#6B705C] leading-relaxed">
                Fra OpenStreetMap, innen {activeLayer === 'fuel' ? '2,5' : '1,5'} km fra ruta. Så
                komplett som kartet er der du kjører — regn med at små steder mangler, og stol ikke
                på åpningstidene alene sent på kvelden.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

/** The line under a fuel or rest area name: where it is, then what it is. */
function describePoi(poi: PointOfInterest): string {
  const parts: string[] = [];

  if (poi.distanceAlongKm !== undefined) parts.push(`${poi.distanceAlongKm} km ut i ruta`);
  if (poi.detourKm !== undefined && poi.detourKm >= 0.3) parts.push(`${poi.detourKm} km av veien`);
  if (poi.brand && poi.brand !== poi.name) parts.push(poi.brand);
  if (poi.openingHours) parts.push(poi.openingHours);
  if (poi.hasToilets) parts.push('WC');

  return parts.join(' · ') || 'Fra OpenStreetMap';
}
