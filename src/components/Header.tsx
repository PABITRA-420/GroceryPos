import React, { useState, useEffect } from 'react';
import { WifiOff, ShieldCheck, Monitor, Clock } from 'lucide-react';
import { Badge } from './ui/Badge';
import { formatDate, formatTime } from '../utils/formatters';
import type { SystemInfo } from '../types';

interface HeaderProps {
  systemInfo: SystemInfo | null;
  isNative: boolean;
  isLoading: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  systemInfo,
  isNative,
  isLoading,
}) => {
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 shadow-xs">
      {/* Brand & Store Name */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-emerald-700 flex items-center justify-center text-white font-bold text-lg shadow-sm">
          GP
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-slate-900 tracking-tight">
              Grocery POS
            </h1>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
              v0.1.0
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Fast Offline Retail & Billing System
          </p>
        </div>
      </div>

      {/* System Status Indicators */}
      <div className="flex items-center gap-4">
        {/* Offline Badge */}
        <Badge
          variant="success"
          icon={<WifiOff className="w-3.5 h-3.5 text-emerald-700" />}
        >
          100% OFFLINE-FIRST
        </Badge>

        {/* Native Bridge Indicator */}
        <Badge
          variant={isNative ? 'info' : 'neutral'}
          icon={
            isNative ? (
              <ShieldCheck className="w-3.5 h-3.5 text-blue-700" />
            ) : (
              <Monitor className="w-3.5 h-3.5 text-slate-600" />
            )
          }
        >
          {isLoading
            ? 'Connecting...'
            : isNative
              ? `Tauri Native (${systemInfo?.os || 'Windows'})`
              : 'Web Preview Mode'}
        </Badge>

        {/* Live Clock */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium tabular-nums">
          <Clock className="w-3.5 h-3.5 text-slate-500" />
          <span>{formatDate(currentTime)}</span>
          <span className="text-slate-300">|</span>
          <span className="font-semibold text-slate-900">
            {formatTime(currentTime)}
          </span>
        </div>
      </div>
    </header>
  );
};
