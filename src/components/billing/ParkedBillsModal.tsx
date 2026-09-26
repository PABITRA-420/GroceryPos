import React from 'react';
import { PauseCircle, Play, Trash2, Clock, ShoppingBag } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { formatCurrency } from '../../services/billingService';
import type { ParkedBill } from '../../services/parkedBillService';

interface ParkedBillsModalProps {
  isOpen: boolean;
  onClose: () => void;
  parkedBills: ParkedBill[];
  onResume: (bill: ParkedBill) => void;
  onDiscard: (id: string) => void;
}

function timeAgo(isoString: string): string {
  const diffSec = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  return `${diffHrs}h ago`;
}

export const ParkedBillsModal: React.FC<ParkedBillsModalProps> = ({
  isOpen,
  onClose,
  parkedBills,
  onResume,
  onDiscard,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Parked Bills / On Hold Carts"
      maxWidth="lg"
    >
      <div className="space-y-4">
        {parkedBills.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center text-slate-400">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-3">
              <PauseCircle className="w-7 h-7" />
            </div>
            <h4 className="text-base font-bold text-slate-700">No Bills Currently on Hold</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              When a customer steps away to pick up more items, click <strong>"Hold Bill (F6)"</strong> to park their cart and continue serving the next customer.
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            <div className="text-xs font-semibold text-slate-500 flex items-center justify-between pb-1 border-b border-slate-100">
              <span>{parkedBills.length} Held Cart{parkedBills.length > 1 ? 's' : ''} in Queue</span>
              <span>Select a bill to resume to counter</span>
            </div>

            {parkedBills.map((bill) => {
              const custDisplayName = bill.customer?.name || bill.new_customer_name || 'Walk-in Customer';
              const custPhone = bill.customer?.phone || bill.customer_phone_input || null;

              return (
                <div
                  key={bill.id}
                  className="bg-white border-2 border-slate-200 hover:border-amber-400 rounded-xl p-4 transition-all shadow-xs space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-amber-500 text-white font-black flex flex-col items-center justify-center shadow-xs">
                        <span className="text-[9px] uppercase tracking-tighter leading-none opacity-80">Hold</span>
                        <span className="text-sm font-black leading-tight">#{bill.token_number}</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">{custDisplayName}</span>
                          {custPhone && (
                            <span className="text-xs text-slate-500 font-mono">({custPhone})</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
                          <span className="flex items-center gap-1 font-medium">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {timeAgo(bill.parked_at)}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1 font-medium">
                            <ShoppingBag className="w-3 h-3 text-slate-400" />
                            {bill.items_count} item{bill.items_count > 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-base font-black text-slate-900">
                        {formatCurrency(bill.total_amount)}
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                        Parked Cart
                      </span>
                    </div>
                  </div>

                  {/* Items snapshot */}
                  <div className="bg-slate-50 rounded-lg p-2.5 text-xs text-slate-600 border border-slate-100">
                    <div className="truncate font-medium">
                      {bill.cart
                        .slice(0, 4)
                        .map((i) => `${i.product_name} (${i.quantity} ${i.unit})`)
                        .join(', ')}
                      {bill.cart.length > 4 && (
                        <span className="text-slate-400 font-bold"> +{bill.cart.length - 4} more</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                    <Button
                      variant="outline"
                      size="sm"
                      icon={<Trash2 className="w-3.5 h-3.5 text-red-500" />}
                      onClick={() => {
                        if (confirm(`Discard Hold #${bill.token_number}? This cannot be undone.`)) {
                          onDiscard(bill.id);
                        }
                      }}
                      className="text-red-600 hover:bg-red-50"
                    >
                      Discard
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      icon={<Play className="w-3.5 h-3.5" />}
                      onClick={() => onResume(bill)}
                      className="bg-emerald-600 hover:bg-emerald-700"
                    >
                      Resume Bill (F6)
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end pt-3 border-t border-slate-100">
          <Button variant="secondary" size="md" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};
