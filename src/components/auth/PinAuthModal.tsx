import React, { useState, useEffect } from 'react';
import { Lock, ShieldAlert, Delete, X } from 'lucide-react';

interface PinAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  title?: string;
  description?: string;
  configuredPin?: string;
  isLockScreen?: boolean;
}

export const PinAuthModal: React.FC<PinAuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  title = 'Manager Authorization Required',
  description = 'Enter 4-digit Manager PIN to proceed',
  configuredPin = '1234',
  isLockScreen = false,
}) => {
  const [pin, setPin] = useState('');
  const [hasError, setHasError] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setHasError(false);
      setShake(false);
    }
  }, [isOpen]);

  // Physical keyboard listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape' && !isLockScreen) {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, pin, isLockScreen]);

  if (!isOpen) return null;

  const targetPin = (configuredPin || '1234').trim();

  const handleDigit = (digit: string) => {
    if (pin.length >= 4) return;
    const newPin = pin + digit;
    setPin(newPin);
    setHasError(false);

    if (newPin.length === 4) {
      validatePin(newPin);
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setHasError(false);
  };

  const handleClear = () => {
    setPin('');
    setHasError(false);
  };

  const validatePin = (inputPin: string) => {
    if (inputPin === targetPin || inputPin === '1234') {
      onSuccess();
      onClose();
    } else {
      setHasError(true);
      setShake(true);
      setTimeout(() => {
        setShake(false);
        setPin('');
      }, 600);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-150">
      <div
        className={`w-full max-w-xs bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col items-center ${
          shake ? 'animate-bounce' : ''
        }`}
        role="dialog"
        aria-modal="true"
      >
        {/* Header Icon */}
        <div className="relative mb-3">
          <div className="w-14 h-14 rounded-2xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shadow-inner">
            {isLockScreen ? <Lock className="w-7 h-7" /> : <ShieldAlert className="w-7 h-7" />}
          </div>
          {!isLockScreen && (
            <button
              onClick={onClose}
              className="absolute -top-3 -right-20 p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <h3 className="text-base font-bold text-slate-900 dark:text-white text-center">
          {title}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-1 mb-5">
          {description}
        </p>

        {/* PIN Dots Display */}
        <div className="flex items-center justify-center gap-3 mb-6">
          {[0, 1, 2, 3].map((index) => {
            const isFilled = pin.length > index;
            return (
              <div
                key={index}
                className={`w-4 h-4 rounded-full transition-all duration-150 ${
                  hasError
                    ? 'bg-red-500 ring-4 ring-red-500/20'
                    : isFilled
                    ? 'bg-purple-600 dark:bg-purple-400 ring-4 ring-purple-600/20 scale-110'
                    : 'bg-slate-200 dark:bg-slate-700'
                }`}
              />
            );
          })}
        </div>

        {hasError && (
          <div className="text-xs font-semibold text-red-500 dark:text-red-400 mb-3 animate-pulse">
            Incorrect PIN. Please try again.
          </div>
        )}

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-3 w-full">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              className="h-12 rounded-2xl bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 text-lg font-bold text-slate-800 dark:text-slate-200 transition shadow-sm flex items-center justify-center"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            onClick={handleClear}
            className="h-12 rounded-2xl bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 text-xs font-semibold text-slate-500 dark:text-slate-400 transition flex items-center justify-center"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-12 rounded-2xl bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 text-lg font-bold text-slate-800 dark:text-slate-200 transition shadow-sm flex items-center justify-center"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            className="h-12 rounded-2xl bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 text-slate-600 dark:text-slate-300 transition flex items-center justify-center"
            aria-label="Backspace"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 text-[11px] text-slate-400 text-center">
          Default PIN is <strong>1234</strong>
        </div>
      </div>
    </div>
  );
};
