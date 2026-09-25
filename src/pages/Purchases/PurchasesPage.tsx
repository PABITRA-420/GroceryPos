import React from 'react';
import { Truck, Plus } from 'lucide-react';
import { Button } from '../../components/ui/Button';

export const PurchasesPage: React.FC = () => {
  return (
    <div className="flex-1 flex flex-col p-6 space-y-6">
      <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-teal-100 text-teal-800">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Purchases & Inward Stock
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Record supplier purchases, update inventory stock, and track supplier invoices
            </p>
          </div>
        </div>

        <Button variant="primary" size="md" icon={<Plus className="w-4 h-4" />}>
          New Purchase Entry (F5)
        </Button>
      </div>

      <div className="flex-1 bg-white border border-slate-200 rounded-xl p-8 flex flex-col items-center justify-center text-center shadow-xs">
        <div className="w-16 h-16 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mb-4">
          <Truck className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-slate-800">
          Purchases Module Shell
        </h3>
        <p className="text-sm text-slate-500 max-w-md mt-1">
          Atomic purchase entries that update supplier ledgers and increment product stock quantities accurately.
        </p>
        <div className="mt-6 text-xs font-medium text-slate-400 bg-slate-50 px-4 py-2 rounded-lg border border-slate-200">
          Foundation active. Ready for incremental Purchases implementation.
        </div>
      </div>
    </div>
  );
};
