import React, { useState, useEffect, useRef } from 'react';
import { WifiOff, ShieldCheck, Monitor, Clock, User, ChevronDown, Lock, Shield } from 'lucide-react';
import { Badge } from './ui/Badge';
import { formatDate, formatTime } from '../utils/formatters';
import type { SystemInfo, ShopProfile } from '../types';
import { authService, PRESET_USERS, type CashierUser, type AuthState } from '../services/authService';
import { PinAuthModal } from './auth/PinAuthModal';
import { billingService } from '../services/billingService';

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
  const [authState, setAuthState] = useState<AuthState>(authService.getState());
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pendingUser, setPendingUser] = useState<CashierUser | null>(null);
  const [shopProfile, setShopProfile] = useState<ShopProfile | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsub = authService.subscribe(setAuthState);
    billingService.getShopProfile().then(setShopProfile).catch(() => {});
    return unsub;
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectUser = (user: CashierUser) => {
    setIsUserMenuOpen(false);
    if (user.id === authState.currentUser.id) return;

    if (user.role === 'MANAGER') {
      setPendingUser(user);
      setIsPinModalOpen(true);
    } else {
      authService.switchUser(user);
    }
  };

  const handlePinSuccess = () => {
    if (pendingUser) {
      authService.switchUser(pendingUser);
      setPendingUser(null);
    }
  };

  const isManager = authState.currentUser.role === 'MANAGER' || authState.managerSessionUnlocked;

  return (
    <>
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 shadow-xs">
        {/* Brand & Store Name */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-700 flex items-center justify-center text-white font-bold text-lg shadow-sm">
            GP
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-900 tracking-tight">
                {shopProfile?.shop_name || 'Grocery POS'}
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

        {/* System Status Indicators & User Controls */}
        <div className="flex items-center gap-3">
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

          {/* Cashier / User Switcher */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-semibold transition"
            >
              <span className={`w-2 h-2 rounded-full ${isManager ? 'bg-purple-600' : 'bg-blue-600'}`} />
              <div className="flex items-center gap-1">
                {isManager ? <Shield className="w-3 h-3 text-purple-600" /> : <User className="w-3 h-3 text-blue-600" />}
                <span>{authState.currentUser.name}</span>
              </div>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {isUserMenuOpen && (
              <div className="absolute right-0 mt-1 w-48 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 text-xs">
                <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Switch Active Cashier
                </div>
                {PRESET_USERS.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleSelectUser(u)}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-slate-50 transition ${
                      authState.currentUser.id === u.id ? 'font-bold text-emerald-600 bg-emerald-50/50' : 'text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${u.role === 'MANAGER' ? 'bg-purple-600' : 'bg-blue-600'}`} />
                      <span>{u.name}</span>
                    </div>
                    {u.role === 'MANAGER' && (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-purple-100 text-purple-700 font-semibold">
                        PIN
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick Lock Button */}
          <button
            type="button"
            onClick={() => authService.lockTerminal()}
            className="p-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition"
            title="Lock POS Terminal (Requires PIN to resume)"
          >
            <Lock className="w-3.5 h-3.5" />
          </button>

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

      {/* Manager Elevation PIN Modal */}
      <PinAuthModal
        isOpen={isPinModalOpen}
        onClose={() => {
          setIsPinModalOpen(false);
          setPendingUser(null);
        }}
        onSuccess={handlePinSuccess}
        title="Manager Login"
        description="Enter Manager PIN to switch to Manager role"
        configuredPin={shopProfile?.manager_pin || '1234'}
      />
    </>
  );
};
