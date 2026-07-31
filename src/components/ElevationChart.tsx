import React from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ElevationPoint, RouteSources, RouteSummary } from '../types';
import { formatDuration } from '../utils/format';
import { ArrowDownRight, ArrowUpRight, Clock, Gauge, Info, Mountain, Waves } from 'lucide-react';

interface ElevationChartProps {
  summary?: RouteSummary;
  elevationPoints: ElevationPoint[];
  sources?: RouteSources;
  notes: string[];
}

/** Rough bands for how twisty a road is, in degrees of heading change per km. */
function describeCurvature(degPerKm: number): string {
  if (degPerKm >= 220) return 'Svært svingete';
  if (degPerKm >= 140) return 'Svingete';
  if (degPerKm >= 70) return 'Litt svingete';
  return 'Stort sett rett';
}

const Stat: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  className?: string;
}> = ({ icon, label, value, className = 'bg-[#F9F9F7] border-[#E0E0D6]' }) => (
  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${className}`}>
    {icon}
    <span className="text-[#6B705C] font-medium">{label}:</span>
    <strong className="font-mono">{value}</strong>
  </div>
);

export const ElevationChart: React.FC<ElevationChartProps> = ({
  summary,
  elevationPoints,
  sources,
  notes,
}) => {
  if (!summary) {
    return (
      <div className="bg-white border border-[#E0E0D6] rounded-2xl p-5 shadow-sm flex flex-col items-center justify-center text-center text-[#6B705C] py-8">
        <Mountain className="w-8 h-8 mb-2" />
        <p className="text-sm font-semibold">Beregn en rute for å se høydeprofil og statistikk.</p>
      </div>
    );
  }

  const hasElevation = elevationPoints.length > 0 && summary.maxElevationM !== null;

  const elevations = elevationPoints.map((p) => p.elevationM);
  const minEle = hasElevation ? Math.max(0, Math.floor((Math.min(...elevations) - 50) / 50) * 50) : 0;
  const rawMax = hasElevation ? Math.ceil((Math.max(...elevations) + 50) / 50) * 50 : 100;
  const maxEle = rawMax <= minEle ? minEle + 100 : rawMax;

  return (
    <div className="bg-white border border-[#E0E0D6] rounded-2xl p-4 shadow-sm flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E0E0D6] pb-3">
        <div className="flex items-center gap-2">
          <Mountain className="w-5 h-5 text-[#386641]" />
          <h3 className="text-base font-bold">Ruteprofil</h3>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
          <Stat
            icon={<Gauge className="w-3.5 h-3.5 text-[#386641]" />}
            label="Distanse"
            value={`${summary.distanceKm} km`}
          />
          <Stat
            icon={<Clock className="w-3.5 h-3.5 text-[#5C6B34]" />}
            label="Est. tid"
            value={formatDuration(summary.durationMin)}
          />
          <Stat
            icon={<Waves className="w-3.5 h-3.5 text-[#386641]" />}
            label="Svingethet"
            value={describeCurvature(summary.curvatureDegPerKm)}
            className="bg-[#E9EDC9] border-[#CCD5AE]"
          />

          {hasElevation && (
            <>
              <Stat
                icon={<Mountain className="w-3.5 h-3.5 text-[#386641]" />}
                label="Maks"
                value={`${summary.maxElevationM} moh`}
              />
              <Stat
                icon={<ArrowUpRight className="w-3.5 h-3.5 text-[#386641]" />}
                label="Stigning"
                value={`+${summary.elevationGainM} m`}
                className="bg-[#E9EDC9] border-[#CCD5AE]"
              />
              <Stat
                icon={<ArrowDownRight className="w-3.5 h-3.5 text-[#BC4749]" />}
                label="Fall"
                value={`-${summary.elevationLossM} m`}
                className="bg-rose-50 border-rose-200"
              />
            </>
          )}
        </div>
      </div>

      {hasElevation ? (
        <div className="w-full h-44 sm:h-52">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={elevationPoints} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="elevationGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#A7C957" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="#E9EDC9" stopOpacity={0.05} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="#E0E0D6" opacity={0.6} />
              <XAxis
                dataKey="distanceKm"
                tickLine={false}
                axisLine={{ stroke: '#CCD5AE' }}
                tick={{ fill: '#6B705C', fontSize: 10 }}
                unit=" km"
              />
              <YAxis
                domain={[minEle, maxEle]}
                tickLine={false}
                axisLine={{ stroke: '#CCD5AE' }}
                tick={{ fill: '#6B705C', fontSize: 10 }}
                unit=" m"
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const point = payload[0].payload as ElevationPoint;
                  return (
                    <div className="bg-white border border-[#E0E0D6] p-2.5 rounded-xl shadow-xl text-xs">
                      <p className="text-[#386641] font-bold mb-1">{point.distanceKm} km</p>
                      <p className="font-mono">
                        <strong className="text-[#5C6B34]">{point.elevationM} moh</strong>
                      </p>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="elevationM"
                stroke="#386641"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#elevationGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-[#6B705C] bg-[#F9F9F7] border border-[#E0E0D6] rounded-xl p-3">
          <Info className="w-4 h-4 shrink-0" />
          <span>
            Høydedata er ikke tilgjengelig for denne ruten akkurat nå. Distanse og kjøretid er beregnet
            som vanlig.
          </span>
        </div>
      )}

      {(notes.length > 0 || sources) && (
        <div className="text-[11px] text-[#6B705C] space-y-1 border-t border-[#E0E0D6] pt-2.5">
          {notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
          {sources && (
            <p>
              Kilder: {sources.routing}
              {sources.elevation ? ` · ${sources.elevation}` : ''}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
