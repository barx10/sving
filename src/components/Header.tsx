import React, { useState, useEffect } from 'react';
import { Navigation, Bookmark, Sparkles, Download, WifiOff, Share2 } from 'lucide-react';

interface HeaderProps {
  onOpenPresets: () => void;
  onOpenSavedTours: () => void;
  onOpenExport: () => void;
  savedToursCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenPresets,
  onOpenSavedTours,
  onOpenExport,
  savedToursCount,
}) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleInstallPWA = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  return (
    <header id="app-header" className="bg-[#2D332A] text-[#F4F4EF] border-b border-[#3E4739] sticky top-0 z-30 px-4 py-3.5 shadow-md">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#A7C957] flex items-center justify-center text-[#2D332A] font-black shadow-inner">
            <Navigation className="w-6 h-6 rotate-45 text-[#2D332A]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black tracking-tight text-[#F4F4EF] font-sans">
                Sving<span className="text-[#A7C957]">.no</span>
              </h1>
              {isOffline && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-[#BC4749]/20 text-[#BC4749] border border-[#BC4749]/40">
                  <WifiOff className="w-3 h-3" /> Offline
                </span>
              )}
            </div>
            <p className="text-xs font-medium text-[#E0E0D6] opacity-90 hidden sm:block">
              Norsk MC-turplanlegger for svingete og naturskjønne veier
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Preset Routes Picker */}
          <button
            id="btn-preset-routes"
            onClick={onOpenPresets}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#3E4739] hover:bg-[#4A5544] text-[#F4F4EF] text-xs sm:text-sm font-bold border border-[#525D4C] transition shadow-sm"
          >
            <Sparkles className="w-4 h-4 text-[#A7C957]" />
            <span className="hidden md:inline">Forhåndsdefinerte</span> Turer
          </button>

          {/* Saved Tours Drawer Button */}
          <button
            id="btn-saved-tours"
            onClick={onOpenSavedTours}
            className="relative inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#3E4739] hover:bg-[#4A5544] text-[#F4F4EF] text-xs sm:text-sm font-bold border border-[#525D4C] transition shadow-sm"
          >
            <Bookmark className="w-4 h-4 text-[#A7C957]" />
            <span className="hidden sm:inline">Lagrede</span>
            {savedToursCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-extrabold bg-[#A7C957] text-[#2D332A]">
                {savedToursCount}
              </span>
            )}
          </button>

          {/* Routes go both ways through here, so unlike the export it used to
              be, this stays reachable before there is a route to export — the
              import behind it is exactly what an empty planner needs. */}
          <button
            id="btn-export-route"
            onClick={onOpenExport}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#A7C957] hover:bg-[#b8d865] text-[#2D332A] text-xs sm:text-sm font-black shadow-md transition"
          >
            <Share2 className="w-4 h-4" />
            <span>GPX og deling</span>
          </button>

          {/* Install PWA Prompt */}
          {deferredPrompt && (
            <button
              id="btn-install-pwa"
              onClick={handleInstallPWA}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#386641] hover:bg-[#2D332A] text-white text-xs font-bold shadow-sm transition border border-[#525D4C]"
            >
              <Download className="w-3.5 h-3.5" /> Installer App
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
