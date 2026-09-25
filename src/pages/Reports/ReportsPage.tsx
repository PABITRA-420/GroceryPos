import React from 'react';
import { BarChart3, TrendingUp, IndianRupee, PieChart } from 'lucide-react';
import { Button } from '../../components/ui/Button';

export const ReportsPage: React.FC = () => {
  return (
    <div className="flex-1 flex flex-col p-6 space-y-6">
      <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-orange-100 text-orange-800">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Business Reports & Analytics
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Daily revenue, top-selling items, GST tax summary, and profit margins
            </p>
          </div>
        </div>

        <Button variant="outline" size="md" icon={<IndianRupee className="w-4 h-4" />}>
          GST Summary
        </Button>
      </div>

      <div className="flex-1 bg-white border border-slate-200 rounded-xl p-8 flex flex-col items-center justify-center text-center shadow-xs">
        <div className="w-16 h-16 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center mb-4">
          <TrendingUp className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-slate-800">
          Reports & Insights Shell
        </h3>
        <p className="text-sm text-slate-500 max-w-md mt-1">
          Local, offline SQL aggregate reports for sales summary, inventory valuation, and GST filing data without cloud dependency.
        </p>
        <div className="mt-6 flex items-center gap-2 text-xs font-medium text-slate-400 bg-slate-50 px-4 py-2 rounded-lg border border-slate-200">
          <PieChart className="w-4 h-4 text-slate-400" />
          <span>Foundation active. Ready for incremental Reports implementation.</span>
        </div>
      </div>
    </div>
  );
};
