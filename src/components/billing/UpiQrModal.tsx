import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode, CheckCircle, Copy, Check, X, AlertCircle } from 'lucide-react';

interface UpiQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  upiId?: string | null;
  shopName: string;
  amount: number;
  invoiceNumber?: string;
  onPaymentConfirmed: () => void;
}

export const UpiQrModal: React.FC<UpiQrModalProps> = ({
  isOpen,
  onClose,
  upiId,
  shopName,
  amount,
  invoiceNumber,
  onPaymentConfirmed,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);

  const cleanUpi = upiId?.trim() || '';
  const cleanAmount = Math.max(0, amount).toFixed(2);
  const note = invoiceNumber ? `Bill ${invoiceNumber}` : 'Grocery Purchase';

  // Construct NPCI standard UPI payment string
  const upiUri = cleanUpi
    ? `upi://pay?pa=${encodeURIComponent(cleanUpi)}&pn=${encodeURIComponent(
        shopName || 'Grocery Store'
      )}&am=${cleanAmount}&cu=INR&tn=${encodeURIComponent(note)}`
    : '';

  useEffect(() => {
    if (!isOpen || !cleanUpi || !canvasRef.current) return;

    QRCode.toCanvas(
      canvasRef.current,
      upiUri,
      {
        width: 240,
        margin: 1,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      },
      (error) => {
        if (error) {
          console.error('Failed to generate UPI QR code:', error);
          setQrError('Failed to generate QR code.');
        } else {
          setQrError(null);
        }
      }
    );
  }, [isOpen, cleanUpi, upiUri]);

  if (!isOpen) return null;

  const handleCopyUpi = () => {
    if (cleanUpi) {
      navigator.clipboard.writeText(cleanUpi);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upi-qr-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h2 id="upi-qr-title" className="text-sm font-bold text-slate-900 dark:text-white">
                Scan &amp; Pay via UPI
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                GPay, PhonePe, Paytm, BHIM
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            aria-label="Close UPI QR modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col items-center text-center">
          {cleanUpi ? (
            <>
              {/* Amount Display */}
              <div className="mb-3">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  Amount to Pay:
                </span>
                <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
                  ₹{cleanAmount}
                </div>
              </div>

              {/* QR Code Container */}
              <div className="p-3 bg-white rounded-2xl border-2 border-slate-200 shadow-sm flex items-center justify-center">
                {qrError ? (
                  <div className="w-[240px] h-[240px] flex items-center justify-center text-xs text-rose-500">
                    {qrError}
                  </div>
                ) : (
                  <canvas ref={canvasRef} />
                )}
              </div>

              {/* UPI ID Pill with Copy */}
              <div className="mt-3.5 flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  UPI ID: {cleanUpi}
                </span>
                <button
                  type="button"
                  onClick={handleCopyUpi}
                  className="text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 transition"
                  title="Copy UPI ID"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* Accepted Apps Badges */}
              <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px] font-semibold text-slate-500">
                <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/50">
                  GPay
                </span>
                <span className="px-2 py-0.5 rounded bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border border-purple-200/50">
                  PhonePe
                </span>
                <span className="px-2 py-0.5 rounded bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 border border-sky-200/50">
                  Paytm
                </span>
                <span className="px-2 py-0.5 rounded bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 border border-orange-200/50">
                  BHIM
                </span>
              </div>
            </>
          ) : (
            <div className="py-6 px-4 text-center space-y-3">
              <div className="mx-auto w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Shop UPI ID Not Configured
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs">
                To generate instant UPI QR codes for customers, please configure your shop UPI ID (e.g., yourname@paytm or mobilenumber@upi) in <strong>Settings &rarr; Shop Profile</strong>.
              </p>
              <div className="pt-2 text-2xl font-bold text-slate-900 dark:text-white">
                Amount: ₹{cleanAmount}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onPaymentConfirmed();
              onClose();
            }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 rounded-xl shadow-lg shadow-emerald-600/20 transition"
          >
            <CheckCircle className="w-4 h-4" />
            Payment Received
          </button>
        </div>
      </div>
    </div>
  );
};
