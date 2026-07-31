import React, { useState } from 'react';
import type { HazardReport, MountainPassStatus, PassStatus } from '../types';
import { AlertTriangle, CheckCircle2, ChevronDown, ExternalLink, HelpCircle, Mountain } from 'lucide-react';

interface HazardBannerProps {
  report: HazardReport | null;
}

const STATUS_CHIP: Record<PassStatus, string> = {
  open: 'bg-[#E9EDC9] text-[#386641] border-[#CCD5AE]',
  uncertain: 'bg-amber-50 text-amber-800 border-amber-200',
  closed_seasonal: 'bg-rose-50 text-[#BC4749] border-rose-200',
};

const StatusIcon: React.FC<{ status: PassStatus }> = ({ status }) => {
  if (status === 'closed_seasonal') return <AlertTriangle className="w-3 h-3" aria-hidden="true" />;
  if (status === 'uncertain') return <HelpCircle className="w-3 h-3" aria-hidden="true" />;
  return <CheckCircle2 className="w-3 h-3" aria-hidden="true" />;
};

/**
 * Seasonal status for the mountain passes.
 *
 * The wording matters here. This data is a calendar model, not a live feed from
 * Statens vegvesen, and the UI must not imply otherwise — a rider who trusts a
 * green chip in October and finds a locked gate at 1400 metres has been let down
 * by this app. Every view carries the provenance and a link to the real source.
 */
export const HazardBanner: React.FC<HazardBannerProps> = ({ report }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!report || report.passes.length === 0) return null;

  const needsAttention = report.passes.filter((p) => p.status !== 'open');
  const visiblePasses: MountainPassStatus[] = isExpanded ? report.passes : report.passes.slice(0, 6);

  return (
    <section className="space-y-2" aria-label="Status for fjelloverganger">
      {needsAttention.length > 0 && (
        <div className="bg-white border-l-4 border-l-[#BC4749] border border-[#E0E0D6] rounded-2xl p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-rose-50 text-[#BC4749] shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-bold">
                {needsAttention.length} fjelloverganger er normalt stengt eller usikre nå
              </h4>
              <p className="text-xs text-[#6B705C] mt-0.5">{report.disclaimer}</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {needsAttention.map((pass) => (
                  <span
                    key={pass.id}
                    title={pass.statusDetail}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-bold flex items-center gap-1 ${STATUS_CHIP[pass.status]}`}
                  >
                    <StatusIcon status={pass.status} />
                    {pass.name}
                  </span>
                ))}
              </div>
              <a
                href={report.verifyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-2.5 text-xs font-bold text-[#386641] hover:underline"
              >
                Sjekk sanntidsstatus hos Statens vegvesen
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-[#E0E0D6] rounded-2xl p-3 shadow-sm space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="flex items-center gap-2 text-xs font-bold">
            <Mountain className="w-4 h-4 text-[#386641]" />
            Fjelloverganger – veiledende sesong
          </span>
          {report.passes.length > 6 && (
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              aria-expanded={isExpanded}
              className="text-[11px] font-bold text-[#386641] hover:underline flex items-center gap-1"
            >
              {isExpanded ? 'Vis færre' : `Vis alle (${report.passes.length})`}
              <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>

        <ul className="flex flex-wrap gap-2">
          {visiblePasses.map((pass) => (
            <li
              key={pass.id}
              title={`${pass.road} — ${pass.statusDetail}${pass.note ? ` ${pass.note}` : ''}`}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${STATUS_CHIP[pass.status]}`}
            >
              <StatusIcon status={pass.status} />
              <span>{pass.name}</span>
            </li>
          ))}
        </ul>

        <p className="text-[11px] text-[#6B705C] leading-relaxed">
          Beregnet fra typiske åpnings- og stengedatoer, ikke sanntidsdata.{' '}
          <a
            href={report.verifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-[#386641] hover:underline"
          >
            Sjekk vegvesen.no før avreise
          </a>
          .
        </p>
      </div>
    </section>
  );
};
