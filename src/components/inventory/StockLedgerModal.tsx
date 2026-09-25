import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  FileText,
  History,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import type { Product, StockConsistencyReport, StockMovement } from '../../types';
import { formatQuantity, formatSaleDateTime } from '../../services/billingService';
import { inventoryService } from '../../services/inventoryService';

interface StockLedgerModalProps {
  product: Product;
  onClose: () => void;
}

export const StockLedgerModal: React.FC<StockLedgerModalProps> = ({ product, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [consistency, setConsistency] = useState<StockConsistencyReport | null>(null);
  const [checkingConsistency, setCheckingConsistency] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLedger = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await inventoryService.getStockLedger({
        product_id: product.id,
        page: 1,
        page_size: 50,
      });
      setMovements(res.movements);
      setTotalCount(res.total_count);

      // Also run consistency check
      const rep = await inventoryService.checkStockConsistency(product.id);
      setConsistency(rep);
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Failed to load stock ledger');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLedger();
  }, [product.id]);

  const handleRunConsistencyCheck = async () => {
    setCheckingConsistency(true);
    try {
      const rep = await inventoryService.checkStockConsistency(product.id);
      setConsistency(rep);
    } catch (err) {
      console.error(err);
    } finally {
      setCheckingConsistency(false);
    }
  };

  const getMovementBadge = (type: string) => {
    switch (type.toUpperCase()) {
      case 'SALE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <ArrowDownRight className="w-3 h-3 text-blue-600" />
            SALE
          </span>
        );
      case 'SALE_RETURN':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <ArrowUpRight className="w-3 h-3 text-emerald-600" />
            RETURN
          </span>
        );
      case 'DAMAGE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <ArrowDownRight className="w-3 h-3 text-rose-600" />
            DAMAGE
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <ArrowDownRight className="w-3 h-3 text-amber-600" />
            EXPIRED
          </span>
        );
      case 'OPENING_STOCK':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
            <ArrowUpRight className="w-3 h-3 text-purple-600" />
            OPENING
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-gray-100 text-gray-700 border border-gray-200">
            {type}
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full border border-gray-200 overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gray-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              type="button"
              className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-400" />
                <h2 className="text-lg font-bold">Stock Ledger Audit Trail</h2>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Product: <span className="font-semibold text-white">{product.name}</span>
                {product.barcode ? ` (${product.barcode})` : ''} • Current Stock:{' '}
                <span className="font-bold text-emerald-400">
                  {formatQuantity(product.stock)} {product.unit}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {consistency && (
              <button
                type="button"
                onClick={handleRunConsistencyCheck}
                disabled={checkingConsistency}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                  consistency.is_consistent
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40 hover:bg-emerald-900/90'
                    : 'bg-rose-950/80 text-rose-300 border-rose-500/40 hover:bg-rose-900/90'
                }`}
                title="Click to re-verify ledger consistency"
              >
                {checkingConsistency ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                    <span>Verifying...</span>
                  </>
                ) : consistency.is_consistent ? (
                  <>
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Ledger Verified</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 text-rose-400" />
                    <span>Discrepancy Detected</span>
                  </>
                )}
              </button>
            )}
            <button
              onClick={loadLedger}
              type="button"
              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition cursor-pointer"
              title="Refresh ledger"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Content Table */}
        <div className="p-6 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="py-20 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
              <p className="text-sm text-gray-500 font-medium">Loading immutable stock movements...</p>
            </div>
          ) : movements.length === 0 ? (
            <div className="py-16 text-center text-gray-500 space-y-2">
              <FileText className="w-10 h-10 text-gray-400 mx-auto" />
              <p className="text-base font-semibold text-gray-700">No stock movements recorded yet</p>
              <p className="text-xs text-gray-400">
                Movements are automatically created upon retail checkout, returns, and manual adjustments.
              </p>
            </div>
          ) : (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-2.5 px-3">Date & Time</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3 text-right">Quantity</th>
                    <th className="py-2.5 px-3 text-right">Before</th>
                    <th className="py-2.5 px-3 text-right">After</th>
                    <th className="py-2.5 px-3">Reference</th>
                    <th className="py-2.5 px-3">Reason / Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-mono">
                  {movements.map((m) => {
                    const { date, time } = formatSaleDateTime(m.created_at);
                    const isPositive = m.quantity > 0;
                    return (
                      <tr key={m.id} className="hover:bg-gray-50/60 transition">
                        <td className="py-2.5 px-3 text-gray-600 whitespace-nowrap">
                          {date} <span className="text-gray-400">{time}</span>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {getMovementBadge(m.movement_type)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold whitespace-nowrap">
                          <span className={isPositive ? 'text-emerald-700' : 'text-rose-700'}>
                            {isPositive ? '+' : ''}
                            {formatQuantity(m.quantity)} {m.unit}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right text-gray-500 whitespace-nowrap">
                          {formatQuantity(m.stock_before)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-gray-900 whitespace-nowrap">
                          {formatQuantity(m.stock_after)}
                        </td>
                        <td className="py-2.5 px-3 text-gray-700 font-sans whitespace-nowrap">
                          {m.reference_id ? (
                            <span className="font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded text-[11px]">
                              {m.reference_id}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-gray-600 font-sans max-w-xs truncate" title={m.reason || ''}>
                          {m.reason || <span className="text-gray-400 italic">No reason specified</span>}
                          {m.notes ? <span className="text-gray-400 text-[10px] block truncate">{m.notes}</span> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            Total Movements Recorded: <span className="font-bold text-gray-900">{totalCount}</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-semibold transition cursor-pointer"
          >
            Close Audit Trail
          </button>
        </div>
      </div>
    </div>
  );
};
