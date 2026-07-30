import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import type { RouteSummary, ElevationPoint } from '../types';
import { Mountain, ArrowUpRight, ArrowDownRight, Clock, Gauge } from 'lucide-react';

interface ElevationChartProps {
  summary?: RouteSummary;
  elevationPoints: ElevationPoint[];
}

export const ElevationChart: React.FC<ElevationChartProps> = ({
  summary,
  elevationPoints,
}) => {
  if (!elevationPoints || elevationPoints.length === 0) {
    return (
      <div id="elevation-chart-container" className="bg-white border border-[#E0E0D6] rounded-2xl p-5 shadow-sm flex flex-col items-center justify-center text-center text-[#6B705C] py-8">
        <Mountain className="w-8 h-8 text-[#6B705C] mb-2" />
        <p className="text-sm font-semibold">Beregn en rute for å se høydeprofil og stigningsmeter.</p>
      </div>
    );
  }

  // Calculate min and max for nicely scaled Y axis with safety defaults
  const elevations = (elevationPoints || [])
    .map((p) => p.elevationM)
    .filter((e) => typeof e === 'number' && !isNaN(e));

  const rawMin = elevations.length > 0 ? Math.min(...elevations) : 0;
  const rawMax = elevations.length > 0 ? Math.max(...elevations) : 500;

  const minEle = Math.max(0, Math.floor((rawMin - 50) / 50) * 50);
  let maxEle = Math.ceil((rawMax + 50) / 50) * 50;
  if (maxEle <= minEle) {
    maxEle = minEle + 100;
  }

  return (
    <div id="elevation-chart-container" className="bg-white border border-[#E0E0D6] rounded-2xl p-4 shadow-sm flex flex-col gap-4">
      {/* Header & Key Stats Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E0E0D6] pb-3">
        <div className="flex items-center gap-2">
          <Mountain className="w-5 h-5 text-[#386641]" />
          <h3 className="text-base font-bold text-[#2D332A]">Høydeprofil & Statistikk</h3>
        </div>

        {summary && (
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
            {/* Distanse */}
            <div className="flex items-center gap-1.5 bg-[#F9F9F7] px-2.5 py-1 rounded-lg border border-[#E0E0D6]">
              <Gauge className="w-3.5 h-3.5 text-[#386641]" />
              <span className="text-[#6B705C] font-medium">Distanse:</span>
              <strong className="text-[#2D332A] font-mono">{summary.distanceKm} km</strong>
            </div>

            {/* Tid */}
            <div className="flex items-center gap-1.5 bg-[#F9F9F7] px-2.5 py-1 rounded-lg border border-[#E0E0D6]">
              <Clock className="w-3.5 h-3.5 text-[#5C6B34]" />
              <span className="text-[#6B705C] font-medium">Est. Tid:</span>
              <strong className="text-[#2D332A] font-mono">
                {Math.floor(summary.durationMin / 60)}t {summary.durationMin % 60}m
              </strong>
            </div>

            {/* Høyest Punkt */}
            <div className="flex items-center gap-1.5 bg-[#F9F9F7] px-2.5 py-1 rounded-lg border border-[#E0E0D6]">
              <Mountain className="w-3.5 h-3.5 text-[#386641]" />
              <span className="text-[#6B705C] font-medium">Maks:</span>
              <strong className="text-[#2D332A] font-mono">{summary.maxElevationM} moh</strong>
            </div>

            {/* Stigning */}
            <div className="flex items-center gap-1.5 bg-[#E9EDC9] px-2.5 py-1 rounded-lg border border-[#CCD5AE]">
              <ArrowUpRight className="w-3.5 h-3.5 text-[#386641]" />
              <span className="text-[#5C6B34] font-bold">Stigning:</span>
              <strong className="text-[#386641] font-mono">+{summary.elevationGainM}m</strong>
            </div>

            {/* Utforkjøring */}
            <div className="flex items-center gap-1.5 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200">
              <ArrowDownRight className="w-3.5 h-3.5 text-[#BC4749]" />
              <span className="text-[#BC4749] font-bold">Tap:</span>
              <strong className="text-[#BC4749] font-mono">-{summary.elevationLossM}m</strong>
            </div>
          </div>
        )}
      </div>

      {/* Elevation Area Chart */}
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
                if (active && payload && payload.length) {
                  const data = payload[0].payload as ElevationPoint;
                  return (
                    <div className="bg-white border border-[#E0E0D6] p-2.5 rounded-xl shadow-xl text-xs font-sans">
                      <p className="text-[#386641] font-bold mb-1">
                        Distanse: {data.distanceKm} km
                      </p>
                      <p className="text-[#2D332A] font-mono">
                        Høyde over havet: <strong className="text-[#5C6B34]">{data.elevationM} moh</strong>
                      </p>
                    </div>
                  );
                }
                return null;
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
    </div>
  );
};
