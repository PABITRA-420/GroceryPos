import React, { useState } from 'react';
import { AlertCircle, ArrowLeft, Loader2, Package, Sliders } from 'lucide-react';
import type { Product, StockAdjustmentInput, StockMovement } from '../../types';
import { formatInventoryErrorMessage, inventoryService } from '../../services/inventoryService';
import { formatQuantity } from '../../services/billingService';

interface StockAdjustmentModalProps {
  product: Product;
  onClose: () => void;
  onAdjusted: (movement: StockMovement) => void;
}

const ADJUSTMENT_TYPES = [
  { id: 'DAMAGE', label: 'Damaged / Broken', sign: -1, desc: 'Goods damaged in transit or broken in shop' },
  { id: 'EXPIRED', label: 'Expired / Spoiled', sign: -1, desc: 'Perishables or goods past expiry date' },
  { id: 'MANUAL_ADJUSTMENT', label: 'Stock Audit / Correction', sign: 0, desc: 'Physical audit count discrepancy' },
  { id: 'OPENING_STOCK', label: 'Stock Inward / Opening', sign: 1, desc: 'Add initial or unrecorded stock' },
];

export const StockAdjustmentModal: React.FC<StockAdjustmentModalProps> = ({
  product,
  onClose,
  onAdjusted,
}) => {
  const [adjustmentType, setAdjustmentType] = useState<string>('DAMAGE');
  const [direction, setDirection] = useState<'ADD' | 'REDUCE'>('REDUCE');
  const [quantity, setQuantity] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-set direction based on type default if not manual
  const handleTypeSelect = (typeId: string) => {
    setAdjustmentType(typeId);
    if (typeId === 'DAMAGE' || typeId === 'EXPIRED') {
      setDirection('REDUCE');
    } else if (typeId === 'OPENING_STOCK') {
      setDirection('ADD');
    }
  };

  const parsedQty = parseFloat(quantity) || 0;
  const isReducing = direction === 'REDUCE';
  const qtyDelta = isReducing ? -Math.abs(parsedQty) : Math.abs(parsedQty);
  const newStock = product.stock + qtyDelta;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (parsedQty <= 0) {
      setError('Please enter a valid quantity greater than zero.');
      return;
    }

    if (isReducing && parsedQty > product.stock) {
      setError(`Cannot reduce by ${parsedQty} ${product.unit}. Current stock is only ${product.stock} ${product.unit}. Negative stock is prohibited.`);
      return;
    }

    if (!reason.trim()) {
      setError('Adjustment reason is required.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const input: StockAdjustmentInput = {
      product_id: product.id,
      adjustment_type: adjustmentType,
      quantity_change: qtyDelta,
      reason: reason.trim(),
      notes: notes.trim() || null,
    };

    try {
      const movement = await inventoryService.createStockAdjustment(input);
      onAdjusted(movement);
    } catch (err) {
      setError(formatInventoryErrorMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-gray-200 overflow-hidden flex flex-col my-auto">
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
                <Sliders className="w-5 h-5 text-indigo-400" />
                <h2 className="text-lg font-bold">Manual Stock Adjustment</h2>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Audit Trail Recorded • Prevents Negative Stock
              </p>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Adjustment blocked</p>
                <p className="mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* Product Banner */}
          <div className="flex items-center justify-between bg-indigo-50/60 border border-indigo-100 p-3.5 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-sm leading-tight">{product.name}</h3>
                <div className="text-xs text-gray-500 mt-0.5">
                  Category: {product.category || 'General'}
                  {product.barcode ? ` • ${product.barcode}` : ''}
                </div>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-gray-500 block">Current Stock</span>
              <span className="text-base font-black text-gray-950">
                {formatQuantity(product.stock)} {product.unit}
              </span>
            </div>
          </div>

          {/* Reason Type Grid */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-2">
              Adjustment Type <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ADJUSTMENT_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleTypeSelect(t.id)}
                  className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                    adjustmentType === t.id
                      ? 'border-indigo-600 bg-indigo-50/50 text-indigo-950 ring-1 ring-indigo-500'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700 bg-white'
                  }`}
                >
                  <div className="font-bold text-xs">{t.label}</div>
                  <div className="text-[10px] text-gray-500 mt-0.5 leading-snug">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Direction & Quantity */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                Direction <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDirection('REDUCE')}
                  className={`py-2 text-xs font-bold rounded-lg border text-center transition cursor-pointer ${
                    direction === 'REDUCE'
                      ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  - Reduce Stock
                </button>
                <button
                  type="button"
                  onClick={() => setDirection('ADD')}
                  className={`py-2 text-xs font-bold rounded-lg border text-center transition cursor-pointer ${
                    direction === 'ADD'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  + Add Stock
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                Quantity ({product.unit}) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="any"
                min="0.001"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="e.g. 5"
                required
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 font-bold focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Live Result Preview */}
          <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-between text-xs">
            <span className="text-gray-600">Stock Result Preview:</span>
            <div className="flex items-center gap-2 font-mono">
              <span className="font-bold text-gray-700">{formatQuantity(product.stock)}</span>
              <span className={`font-black ${isReducing ? 'text-rose-600' : 'text-emerald-600'}`}>
                {isReducing ? '-' : '+'}
                {parsedQty > 0 ? formatQuantity(parsedQty) : '0'}
              </span>
              <span className="text-gray-400">➔</span>
              <span
                className={`font-black text-sm ${
                  newStock < 0 ? 'text-rose-600 underline' : 'text-gray-950 font-bold'
                }`}
              >
                {formatQuantity(newStock)} {product.unit}
              </span>
            </div>
          </div>

          {/* Mandatory Reason */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
              Adjustment Reason <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. 2 packets rat-bitten, 1 bottle broken on shelf..."
              required
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Optional Notes */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
              Audit Notes (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Audited by Rajesh at end of day"
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-3 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl text-sm font-semibold transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || parsedQty <= 0 || newStock < 0}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition shadow-xs cursor-pointer flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving Ledger Entry...</span>
                </>
              ) : (
                <span>Confirm Stock Adjustment</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
