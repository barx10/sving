import React from 'react';
import type { RidingCondition, WeatherCheckpoint } from '../types';
import { formatTime } from '../utils/format';
import { CloudOff, CloudSun, Droplets, Thermometer, Wind } from 'lucide-react';

interface WeatherWidgetProps {
  checkpoints: WeatherCheckpoint[];
  isLoading?: boolean;
  hasRoute: boolean;
}

/** MET.no symbol codes carry a _day / _night / _polartwilight suffix. */
const SYMBOL_EMOJI: Record<string, string> = {
  clearsky: '☀️',
  fair: '🌤️',
  partlycloudy: '⛅',
  cloudy: '☁️',
  fog: '🌫️',
  lightrain: '🌦️',
  lightrainshowers: '🌦️',
  rain: '🌧️',
  rainshowers: '🌧️',
  heavyrain: '🌧️',
  heavyrainshowers: '🌧️',
  lightsleet: '🌨️',
  sleet: '🌨️',
  heavysleet: '🌨️',
  lightsnow: '❄️',
  snow: '❄️',
  heavysnow: '❄️',
};

function symbolToEmoji(symbolCode: string | null): string {
  if (!symbolCode) return '❓';
  const base = symbolCode.replace(/_(day|night|polartwilight)$/, '');
  if (base.includes('thunder')) return '⛈️';
  return SYMBOL_EMOJI[base] ?? '🌤️';
}

const CONDITION_STYLE: Record<RidingCondition, string> = {
  good: 'bg-[#E9EDC9] text-[#386641] border-[#CCD5AE]',
  fair: 'bg-amber-50 text-amber-800 border-amber-200',
  poor: 'bg-rose-50 text-[#BC4749] border-rose-200',
};

export const WeatherWidget: React.FC<WeatherWidgetProps> = ({ checkpoints, isLoading, hasRoute }) => {
  if (!hasRoute) return null;

  if (isLoading) {
    return (
      <div className="bg-white border border-[#E0E0D6] rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-bold text-[#6B705C]">
          <CloudSun className="w-4 h-4 text-[#386641] animate-pulse" />
          <span>Henter værvarsel fra MET.no...</span>
        </div>
      </div>
    );
  }

  if (checkpoints.length === 0) return null;

  const allFailed = checkpoints.every((c) => c.forecast === null);

  return (
    <div className="bg-white border border-[#E0E0D6] rounded-2xl p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between gap-2 border-b border-[#E0E0D6] pb-2.5 flex-wrap">
        <div className="flex items-center gap-2">
          <CloudSun className="w-5 h-5 text-[#386641]" />
          <h3 className="text-sm font-bold">Vær ved ankomst</h3>
        </div>
        <span className="text-[11px] font-bold text-[#5C6B34] bg-[#E9EDC9] px-2 py-0.5 rounded-full border border-[#CCD5AE]">
          MET.no
        </span>
      </div>

      {allFailed ? (
        <div className="flex items-center gap-2 text-xs text-[#6B705C] py-3">
          <CloudOff className="w-4 h-4 shrink-0" />
          <span>Værvarselet er ikke tilgjengelig akkurat nå. Prøv igjen om litt.</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {checkpoints.map((checkpoint, idx) => {
            const { forecast } = checkpoint;
            const position =
              idx === 0 ? 'START' : idx === checkpoints.length - 1 ? 'MÅL' : `PUNKT ${idx + 1}`;

            return (
              <div
                key={`${checkpoint.lat},${checkpoint.lng},${idx}`}
                className="bg-[#F9F9F7] border border-[#E0E0D6] rounded-xl p-3 flex flex-col gap-2"
              >
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-extrabold text-[#5C6B34] uppercase tracking-wider">
                      {position}
                    </span>
                    {forecast && (
                      <span className="text-[10px] text-[#6B705C] font-mono" title="Beregnet ankomsttid">
                        kl. {formatTime(forecast.requestedTime)}
                      </span>
                    )}
                  </div>
                  <h4 className="text-xs font-bold truncate mt-0.5" title={checkpoint.locationName}>
                    {checkpoint.locationName}
                  </h4>
                </div>

                {forecast ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-xl" aria-hidden="true">
                        {symbolToEmoji(forecast.symbolCode)}
                      </span>
                      <span className="text-lg font-extrabold font-mono flex items-center gap-0.5">
                        <Thermometer className="w-3.5 h-3.5 text-[#BC4749]" />
                        {forecast.tempC === null ? '–' : `${forecast.tempC}°`}
                      </span>
                    </div>

                    <div className="pt-1.5 border-t border-[#E0E0D6] grid grid-cols-2 gap-1 text-[11px] text-[#6B705C]">
                      <span className="flex items-center gap-1" title="Vind (vindkast i parentes)">
                        <Wind className="w-3 h-3 text-[#386641]" />
                        {forecast.windSpeedMs ?? '–'}
                        {forecast.windGustMs !== null && ` (${forecast.windGustMs})`}
                      </span>
                      <span className="flex items-center gap-1 justify-end" title="Nedbør">
                        <Droplets className="w-3 h-3 text-[#5C6B34]" />
                        {forecast.precipitationMm ?? '–'} mm
                      </span>
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md border text-center ${
                        CONDITION_STYLE[forecast.condition]
                      }`}
                    >
                      {forecast.conditionLabel}
                    </span>

                    {forecast.approximate && (
                      <span className="text-[10px] text-[#6B705C] italic">
                        Nærmeste varsel: kl. {formatTime(forecast.time)}
                      </span>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-1.5 text-[11px] text-[#6B705C] py-2">
                    <CloudOff className="w-3.5 h-3.5 shrink-0" />
                    <span>{checkpoint.error || 'Ikke tilgjengelig'}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
