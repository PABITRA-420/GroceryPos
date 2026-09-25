import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  DollarSign,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import type {
  CreateReturnInput,
  ReturnItemInput,
  ReturnableItemInfo,
  SalesReturnResult,
} from '../../types';
import { formatCurrency, formatQuantity } from '../../services/billingService';
import { formatReturnErrorMessage, returnService } from '../../services/returnService';

interface ReturnModalProps {
  saleId: number;
  invoiceNumber: string;
  customerName?: string | null;
  customerPhone?: string | null;
  discountRatio?: number;
  onClose: () => void;
  onReturnCompleted: (result: SalesReturnResult) => void;
}

interface ItemReturnState {
  sale_item_id: number;
  return_quantity: number;
  restock: boolean;
  reason: string;
}

const COMMON_REASONS = [
  'Customer Changed Mind',
  'Defective / Damaged Item',
  'Expired / Near Expiry Item',
  'Wrong Item Billed',
  'Quality Not Satisfactory',
  'Other',
];

export const ReturnModal: React.FC<ReturnModalProps> = ({
  saleId,
  invoiceNumber,
  customerName,
  customerPhone,
  onClose,
  onReturnCompleted,
}) => {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ReturnableItemInfo[]>([]);

  // Form state
  const [itemStates, setItemStates] = useState<Record<number, ItemReturnState>>({});
  const [refundMode, setRefundMode] = useState<'CASH' | 'UPI' | 'CARD' | 'CREDIT'>('CASH');
  const [selectedReasonOption, setSelectedReasonOption] = useState<string>(COMMON_REASONS[0]);
  const [customReason, setCustomReason] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Load returnable items from backend
  useEffect(() => {
    let isMounted = true;
    async function loadItems() {
      setLoading(true);
      setError(null);
      try {
        const data = await returnService.getReturnableItems(saleId);
        if (isMounted) {
          setItems(data);
          const initialStates: Record<number, ItemReturnState> = {};
          data.forEach((item) => {
            initialStates[item.sale_item_id] = {
              sale_item_id: item.sale_item_id,
              return_quantity: 0,
              restock: true,
              reason: '',
            };
          });
          setItemStates(initialStates);
        }
      } catch (err) {
        if (isMounted) {
          setError(formatReturnErrorMessage(err));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    loadItems();
    return () => {
      isMounted = false;
    };
  }, [saleId]);

  // Handle quantity changes
  const handleQuantityChange = (saleItemId: number, value: number, maxQty: number) => {
    const clamped = Math.max(0, Math.min(maxQty, value));
    setItemStates((prev) => ({
      ...prev,
      [saleItemId]: {
        ...prev[saleItemId],
        return_quantity: clamped,
      },
    }));
  };

  // Quick return all for a specific item
  const handleReturnMax = (saleItemId: number, maxQty: number) => {
    handleQuantityChange(saleItemId, maxQty, maxQty);
  };

  // Toggle restock
  const handleRestockToggle = (saleItemId: number) => {
    setItemStates((prev) => ({
      ...prev,
      [saleItemId]: {
        ...prev[saleItemId],
        restock: !prev[saleItemId]?.restock,
      },
    }));
  };

  // Calculate live totals
  let totalItemsToReturn = 0;
  let estimatedRefund = 0;

  items.forEach((item) => {
    const state = itemStates[item.sale_item_id];
    if (state && state.return_quantity > 0) {
      totalItemsToReturn += 1;
      const unitPaid = item.sold_quantity > 0 ? item.total_price / item.sold_quantity : item.unit_price;
      estimatedRefund += state.return_quantity * unitPaid;
    }
  });

  const finalReason =
    selectedReasonOption === 'Other'
      ? customReason.trim() || 'Other'
      : selectedReasonOption;

  // Submit return
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const returnItems: ReturnItemInput[] = Object.values(itemStates)
      .filter((s) => s.return_quantity > 0)
      .map((s) => ({
        sale_item_id: s.sale_item_id,
        return_quantity: s.return_quantity,
        restock: s.restock,
        reason: s.reason.trim() || undefined,
      }));

    if (returnItems.length === 0) {
      setError('Please select at least one item with quantity greater than 0 to return.');
      return;
    }

    if (!finalReason) {
      setError('Please provide a reason for the return.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const payload: CreateReturnInput = {
      sale_id: saleId,
      items: returnItems,
      refund_mode: refundMode,
      reason: finalReason,
      notes: notes.trim() || null,
    };

    try {
      const result = await returnService.createReturn(payload);
      onReturnCompleted(result);
    } catch (err) {
      setError(formatReturnErrorMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full border border-gray-200 overflow-hidden flex flex-col my-auto max-h-[92vh]">
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
                <RotateCcw className="w-5 h-5 text-amber-400" />
                <h2 className="text-lg font-bold">Process Return / Refund</h2>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Invoice: <span className="font-semibold text-white">{invoiceNumber}</span>
                {customerName ? ` • Customer: ${customerName}` : ''}
                {customerPhone ? ` (${customerPhone})` : ''}
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs font-semibold px-2.5 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg">
              Historical Invoice Intact
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {error && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800 flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Error processing return</p>
                <p className="mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {loading ? (
            <div className="py-16 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-amber-500 animate-spin mx-auto" />
              <p className="text-sm text-gray-500 font-medium">Checking invoice return eligibility...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-gray-500 space-y-2">
              <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto" />
              <p className="text-base font-semibold text-gray-800">All items on this invoice have been returned.</p>
              <p className="text-sm text-gray-500">There are no remaining quantities eligible for return.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Items List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                    Select Products to Return
                  </h3>
                  <span className="text-xs text-gray-500">
                    Max quantity clamped to unsold balance
                  </span>
                </div>

                <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
                  <div className="grid grid-cols-12 bg-gray-50 px-4 py-2.5 text-xs font-semibold text-gray-600">
                    <span className="col-span-4">Item</span>
                    <span className="col-span-2 text-center">Sold / Returned</span>
                    <span className="col-span-3 text-center">Return Qty</span>
                    <span className="col-span-2 text-center">Restock?</span>
                    <span className="col-span-1 text-right">Action</span>
                  </div>

                  {items.map((item) => {
                    const isFullyReturned = item.available_return_quantity <= 0;
                    const state = itemStates[item.sale_item_id] || {
                      sale_item_id: item.sale_item_id,
                      return_quantity: 0,
                      restock: true,
                      reason: '',
                    };

                    return (
                      <div
                        key={item.sale_item_id}
                        className={`grid grid-cols-12 px-4 py-3 items-center text-sm gap-2 transition ${
                          state.return_quantity > 0
                            ? 'bg-amber-50/40'
                            : isFullyReturned
                            ? 'bg-gray-50 opacity-60'
                            : 'hover:bg-gray-50/50'
                        }`}
                      >
                        {/* Item Name */}
                        <div className="col-span-4">
                          <div className="font-semibold text-gray-900 leading-tight">
                            {item.product_name}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            ₹{item.unit_price.toFixed(2)} / {item.unit}
                            {item.barcode ? ` • ${item.barcode}` : ''}
                          </div>
                        </div>

                        {/* Sold / Returned */}
                        <div className="col-span-2 text-center text-xs text-gray-600">
                          <div>
                            Sold: <span className="font-medium text-gray-900">{formatQuantity(item.sold_quantity)}</span>
                          </div>
                          <div className="text-amber-700">
                            Available:{' '}
                            <span className="font-bold">
                              {formatQuantity(item.available_return_quantity)}
                            </span>
                          </div>
                        </div>

                        {/* Return Qty Stepper */}
                        <div className="col-span-3 flex items-center justify-center gap-1.5">
                          {isFullyReturned ? (
                            <span className="text-xs font-semibold text-rose-600">Fully Returned</span>
                          ) : (
                            <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden bg-white shadow-xs">
                              <button
                                type="button"
                                onClick={() =>
                                  handleQuantityChange(
                                    item.sale_item_id,
                                    state.return_quantity - 1,
                                    item.available_return_quantity
                                  )
                                }
                                disabled={state.return_quantity <= 0}
                                className="px-2.5 py-1 text-gray-600 hover:bg-gray-100 disabled:opacity-30 cursor-pointer"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                min={0}
                                max={item.available_return_quantity}
                                step="any"
                                value={state.return_quantity === 0 ? '' : state.return_quantity}
                                onChange={(e) =>
                                  handleQuantityChange(
                                    item.sale_item_id,
                                    parseFloat(e.target.value) || 0,
                                    item.available_return_quantity
                                  )
                                }
                                placeholder="0"
                                className="w-16 text-center text-sm font-bold text-gray-900 py-1 focus:outline-hidden"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  handleQuantityChange(
                                    item.sale_item_id,
                                    state.return_quantity + 1,
                                    item.available_return_quantity
                                  )
                                }
                                disabled={state.return_quantity >= item.available_return_quantity}
                                className="px-2.5 py-1 text-gray-600 hover:bg-gray-100 disabled:opacity-30 cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Restock Toggle */}
                        <div className="col-span-2 text-center">
                          {!isFullyReturned && (
                            <label className="inline-flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={state.restock}
                                onChange={() => handleRestockToggle(item.sale_item_id)}
                                className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                              />
                              <span className={state.restock ? 'font-semibold text-emerald-700' : 'text-gray-400'}>
                                {state.restock ? 'Restock' : 'Damaged'}
                              </span>
                            </label>
                          )}
                        </div>

                        {/* Quick Return All */}
                        <div className="col-span-1 text-right">
                          {!isFullyReturned && (
                            <button
                              type="button"
                              onClick={() => handleReturnMax(item.sale_item_id, item.available_return_quantity)}
                              className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                            >
                              Max
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Return Metadata & Refund Options */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
                {/* Reason Selection */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Return Reason <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={selectedReasonOption}
                    onChange={(e) => setSelectedReasonOption(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500"
                  >
                    {COMMON_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>

                  {selectedReasonOption === 'Other' && (
                    <input
                      type="text"
                      value={customReason}
                      onChange={(e) => setCustomReason(e.target.value)}
                      placeholder="Specify custom reason..."
                      className="mt-2 w-full px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-900"
                      required
                    />
                  )}
                </div>

                {/* Refund Mode */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Disbursement Mode <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['CASH', 'UPI', 'CARD', 'CREDIT'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setRefundMode(mode)}
                        className={`py-2 text-xs font-bold rounded-lg border text-center transition cursor-pointer ${
                          refundMode === mode
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Optional Notes */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Merchant Notes (Optional)
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Customer provided original box and bill copy..."
                    className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-900"
                  />
                </div>
              </div>

              {/* Total Summary Footer */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                <div>
                  <span className="text-xs text-gray-500 block">Total Refund Calculated:</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-emerald-700">
                      {formatCurrency(estimatedRefund)}
                    </span>
                    <span className="text-xs font-semibold text-gray-500">
                      ({totalItemsToReturn} item{totalItemsToReturn === 1 ? '' : 's'} selected)
                    </span>
                  </div>
                </div>

                <div className="flex gap-3">
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
                    disabled={submitting || totalItemsToReturn === 0}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition shadow-sm cursor-pointer flex items-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Processing Refund...</span>
                      </>
                    ) : (
                      <>
                        <DollarSign className="w-4 h-4" />
                        <span>Confirm Refund & Restock</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
