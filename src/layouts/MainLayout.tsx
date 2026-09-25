import React, { useEffect } from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  Truck,
  Receipt,
  BarChart3,
  Settings,
} from 'lucide-react';
import { Header } from '../components/Header';
import type { NavigationTab, SystemInfo } from '../types';

interface MainLayoutProps {
  currentTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
  systemInfo: SystemInfo | null;
  isNative: boolean;
  isLoading: boolean;
  children: React.ReactNode;
}

interface NavItem {
  id: NavigationTab;
  label: string;
  icon: React.ElementType;
  shortcut: string;
  isHighlight?: boolean;
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, shortcut: 'F1' },
  {
    id: 'billing',
    label: 'New Bill (POS)',
    icon: ShoppingCart,
    shortcut: 'F2',
    isHighlight: true,
  },
  { id: 'products', label: 'Products', icon: Package, shortcut: 'F3' },
  { id: 'customers', label: 'Customers', icon: Users, shortcut: 'F4' },
  { id: 'purchases', label: 'Purchases', icon: Truck, shortcut: 'F5' },
  { id: 'sales', label: 'Sales History', icon: Receipt, shortcut: 'F6' },
  { id: 'reports', label: 'Reports', icon: BarChart3, shortcut: 'F7' },
  { id: 'settings', label: 'Settings', icon: Settings, shortcut: 'F8' },
];

export const MainLayout: React.FC<MainLayoutProps> = ({
  currentTab,
  onTabChange,
  systemInfo,
  isNative,
  isLoading,
  children,
}) => {
  // Global Function key handler (F1-F8) for fast shopkeeper navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const keyMap: Record<string, NavigationTab> = {
        F1: 'dashboard',
        F2: 'billing',
        F3: 'products',
        F4: 'customers',
        F5: 'purchases',
        F6: 'sales',
        F7: 'reports',
        F8: 'settings',
      };

      if (keyMap[e.key]) {
        e.preventDefault();
        onTabChange(keyMap[e.key]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onTabChange]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-100 text-slate-900 select-none">
      {/* Top Header */}
      <Header
        systemInfo={systemInfo}
        isNative={isNative}
        isLoading={isLoading}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Navigation */}
        <aside className="w-56 bg-slate-900 text-white flex flex-col justify-between shrink-0 shadow-md">
          <div className="py-3 px-2 space-y-1">
            <div className="px-3 py-1.5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
              Main Menu
            </div>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer text-left ${
                    isActive
                      ? item.isHighlight
                        ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                        : 'bg-slate-800 text-white font-semibold'
                      : item.isHighlight
                        ? 'text-emerald-400 hover:bg-slate-800/80'
                        : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive
                          ? 'text-white'
                          : item.isHighlight
                            ? 'text-emerald-400'
                            : 'text-slate-400'
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </div>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                      isActive
                        ? 'bg-black/20 text-white'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {item.shortcut}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Bottom Native Status & Info */}
          <div className="p-3 border-t border-slate-800 text-slate-400 text-xs">
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
              <span>DB Mode</span>
              <span className="text-emerald-400 font-medium">SQLite (Local)</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Tauri IPC</span>
              <span className={isNative ? 'text-blue-400 font-medium' : 'text-amber-400 font-medium'}>
                {isNative ? 'Active' : 'Preview'}
              </span>
            </div>
          </div>
        </aside>

        {/* Content Workspace */}
        <main className="flex-1 flex flex-col overflow-auto bg-slate-50">
          {children}
        </main>
      </div>
    </div>
  );
};
