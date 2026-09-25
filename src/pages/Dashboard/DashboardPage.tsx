import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  HardDrive,
  Cpu,
  Layers,
  CheckCircle2,
  ShoppingCart,
  ArrowRight,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { storageService } from '../../services/storageService';
import type { DatabaseStatus, NavigationTab, SystemInfo } from '../../types';

interface DashboardPageProps {
  systemInfo: SystemInfo | null;
  isNative: boolean;
  onNavigate: (tab: NavigationTab) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  systemInfo,
  isNative,
  onNavigate,
}) => {
  const [dbStatus, setDbStatus] = useState<DatabaseStatus | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchStatus() {
      const status = await storageService.getDatabaseStatus();
      if (isMounted) {
        setDbStatus(status);
      }
    }
    fetchStatus();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">
              System Ready & Online
            </span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900">
            Grocery POS Foundation
          </h2>
          <p className="text-sm text-slate-600 mt-1 max-w-xl">
            Offline-first architecture initialized. All data and core operations run directly on this computer with zero internet dependency.
          </p>
        </div>

        <Button
          size="lg"
          variant="primary"
          icon={<ShoppingCart className="w-5 h-5" />}
          onClick={() => onNavigate('billing')}
        >
          Go to Billing (F2)
        </Button>
      </div>

      {/* Architecture Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Layer 1: Native Runtime */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-blue-50 text-blue-700">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Desktop Shell
              </div>
              <div className="text-base font-bold text-slate-900">
                Tauri Native Layer
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            High performance, low-memory Windows application shell with native system and hardware access.
          </p>
          <div className="pt-2 border-t border-slate-100 text-xs font-medium text-slate-700 flex justify-between">
            <span>Status:</span>
            <span className={isNative ? 'text-blue-700 font-semibold' : 'text-slate-500'}>
              {isNative ? 'Connected via IPC' : 'Preview Mode'}
            </span>
          </div>
        </div>

        {/* Layer 2: Frontend UI */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-700">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                User Interface
              </div>
              <div className="text-base font-bold text-slate-900">
                React + TypeScript + Tailwind
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Ultra-fast, modular UI designed specifically for high-speed counter billing and keyboard navigation.
          </p>
          <div className="pt-2 border-t border-slate-100 text-xs font-medium text-slate-700 flex justify-between">
            <span>Styling:</span>
            <span className="text-emerald-700 font-semibold">Tailwind CSS v4</span>
          </div>
        </div>

        {/* Layer 3: Database Engine */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-amber-50 text-amber-700">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Storage Engine
              </div>
              <div className="text-base font-bold text-slate-900">
                SQLite Local Database
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Atomic transactions (ACID), zero cloud dependence, and safe local storage on disk.
          </p>
          <div className="pt-2 border-t border-slate-100 text-xs font-medium text-slate-700 flex justify-between">
            <span>Database:</span>
            <span className={dbStatus?.connected ? 'text-emerald-700 font-semibold flex items-center gap-1' : 'text-amber-700 font-semibold'}>
              {dbStatus?.connected && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500"></span>}
              {dbStatus?.connected ? 'Connected (SQLite)' : 'SQLite (Local)'}
            </span>
          </div>
        </div>
      </div>

      {/* IPC Bridge & Native Diagnostics Box */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-slate-700" />
            <h3 className="text-base font-bold text-slate-900">
              Tauri IPC Bridge Diagnostics
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            Real-time IPC Response
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs">
          <div>
            <div className="text-slate-400 font-medium">Application</div>
            <div className="font-semibold text-slate-800 text-sm mt-0.5">
              {systemInfo?.app_name || 'Loading...'}
            </div>
          </div>
          <div>
            <div className="text-slate-400 font-medium">Version</div>
            <div className="font-semibold text-slate-800 text-sm mt-0.5">
              {systemInfo?.version || '0.1.0'}
            </div>
          </div>
          <div>
            <div className="text-slate-400 font-medium">Platform OS</div>
            <div className="font-semibold text-slate-800 text-sm mt-0.5">
              {systemInfo?.os || 'Windows'} ({systemInfo?.arch || 'x64'})
            </div>
          </div>
          <div>
            <div className="text-slate-400 font-medium">Runtime Status</div>
            <div className="font-semibold text-emerald-700 text-sm mt-0.5 truncate">
              {systemInfo?.status || 'Active'}
            </div>
          </div>
        </div>

        {/* Development Database Status Display */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs">
          <div>
            <div className="text-slate-400 font-medium uppercase tracking-wider text-[10px]">DATABASE</div>
            <div className="font-semibold text-sm mt-0.5 flex items-center gap-1.5">
              <span className={`inline-block w-2 h-2 rounded-full ${dbStatus?.connected ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
              <span className={dbStatus?.connected ? 'text-emerald-700' : 'text-amber-700'}>
                {dbStatus?.connected ? 'Connected' : 'Connecting...'}
              </span>
            </div>
          </div>
          <div>
            <div className="text-slate-400 font-medium uppercase tracking-wider text-[10px]">MIGRATIONS</div>
            <div className="font-semibold text-sm mt-0.5 flex items-center gap-1.5">
              <span className={`inline-block w-2 h-2 rounded-full ${dbStatus?.connected ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
              <span className={dbStatus?.connected ? 'text-emerald-700' : 'text-slate-600'}>
                {dbStatus?.migrations_applied ? 'Up to date' : 'Pending'}
              </span>
            </div>
          </div>
          <div>
            <div className="text-slate-400 font-medium uppercase tracking-wider text-[10px]">SCHEMA TABLES</div>
            <div className="font-semibold text-slate-800 text-sm mt-0.5">
              {dbStatus?.total_tables ?? 0} active ({dbStatus?.wal_enabled ? 'WAL' : 'Standard'})
            </div>
          </div>
          <div className="truncate">
            <div className="text-slate-400 font-medium uppercase tracking-wider text-[10px]">STORAGE LOCATION</div>
            <div className="font-mono text-slate-600 text-[11px] mt-0.5 truncate" title={dbStatus?.file_path || 'Per-user AppData'}>
              {dbStatus?.file_path ? 'AppData (Local)' : 'Resolving...'}
            </div>
          </div>
        </div>
      </div>

      {/* Offline Guarantees Checklist */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
          Offline-First Foundation Principles
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-700">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>Zero cloud dependency — operates 100% without internet access.</span>
          </div>
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>Atomic transactions ensure sales and stock changes never partially write.</span>
          </div>
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>Clean separation between React UI and Native backend logic.</span>
          </div>
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>Keyboard-first design (F1–F8) tailored for local retail shopkeepers.</span>
          </div>
        </div>
      </div>

      {/* Navigation Quick Jump */}
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          onClick={() => onNavigate('billing')}
          className="gap-2"
        >
          <span>Billing Screen</span>
          <ArrowRight className="w-4 h-4 text-slate-400" />
        </Button>
        <Button
          variant="outline"
          onClick={() => onNavigate('products')}
          className="gap-2"
        >
          <span>Products Catalog</span>
          <ArrowRight className="w-4 h-4 text-slate-400" />
        </Button>
        <Button
          variant="outline"
          onClick={() => onNavigate('customers')}
          className="gap-2"
        >
          <span>Customers</span>
          <ArrowRight className="w-4 h-4 text-slate-400" />
        </Button>
        <Button
          variant="outline"
          onClick={() => onNavigate('settings')}
          className="gap-2"
        >
          <span>Settings</span>
          <ArrowRight className="w-4 h-4 text-slate-400" />
        </Button>
      </div>
    </div>
  );
};
