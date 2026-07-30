import React from 'react';
import type { WeatherPoint } from '../types';
import { CloudSun, Wind, Droplets, Thermometer, Compass } from 'lucide-react';

interface WeatherWidgetProps {
  weatherPoints: WeatherPoint[];
  isLoading?: boolean;
}

export const WeatherWidget: React.FC<WeatherWidgetProps> = ({ weatherPoints, isLoading }) => {
  if (isLoading) {
    return (
      <div id="weather-widget-container" className="bg-white border border-[#E0E0D6] rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-bold text-[#6B705C] mb-1">
          <CloudSun className="w-4 h-4 text-[#386641] animate-pulse" />
          <span>Henter tidsbasert værvarsel fra MET.no...</span>
        </div>
      </div>
    );
  }

  if (!weatherPoints || weatherPoints.length === 0) return null;

  return (
    <div id="weather-widget-container" className="bg-white border border-[#E0E0D6] rounded-2xl p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between border-b border-[#E0E0D6] pb-2.5">
        <div className="flex items-center gap-2">
          <CloudSun className="w-5 h-5 text-[#386641]" />
          <h3 className="text-sm font-bold text-[#2D332A]">Værvarsel langs ruten (MET.no)</h3>
        </div>
        <span className="text-[11px] font-bold text-[#5C6B34] bg-[#E9EDC9] px-2 py-0.5 rounded-full border border-[#CCD5AE]">
          Offisiell Yr / MET.no API
        </span>
      </div>

      {/* Grid of weather cards along route checkpoints */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
        {weatherPoints.map((wx, idx) => (
          <div
            key={idx}
            className="bg-[#F9F9F7] border border-[#E0E0D6] hover:border-[#A7C957] rounded-xl p-3 flex flex-col justify-between gap-2 transition shadow-sm"
          >
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-extrabold text-[#5C6B34] uppercase tracking-wider truncate">
                  {idx === 0 ? 'START' : idx === weatherPoints.length - 1 ? 'MÅL' : `PUNKT ${idx + 1}`}
                </span>
                <span className="text-[10px] text-[#6B705C] font-mono">
                  {new Date(wx.time).toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <h4 className="text-xs font-bold text-[#2D332A] truncate mt-0.5" title={wx.locationName}>
                {wx.locationName}
              </h4>
            </div>

            <div className="flex items-center justify-between my-1">
              <span className="text-xl">🌤️</span>
              <div className="text-right">
                <div className="text-lg font-extrabold text-[#2D332A] font-mono flex items-center justify-end gap-0.5">
                  <Thermometer className="w-3.5 h-3.5 text-[#BC4749]" />
                  <span>{wx.temp}°C</span>
                </div>
              </div>
            </div>

            <div className="pt-1.5 border-t border-[#E0E0D6] grid grid-cols-2 gap-1 text-[11px] text-[#6B705C]">
              <div className="flex items-center gap-1">
                <Wind className="w-3 h-3 text-[#386641]" />
                <span>{wx.windSpeed} m/s</span>
              </div>
              <div className="flex items-center gap-1 justify-end">
                <Droplets className="w-3 h-3 text-[#5C6B34]" />
                <span>{wx.precipitation} mm</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
