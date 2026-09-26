import React, { useState, useEffect, useMemo } from 'react';
import {
  Banknote,
  Calculator,
  Printer,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Calendar,
  CreditCard,
  QrCode,
  ArrowDownCircle,
  ArrowUpCircle,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { formatCurrency, billingService } from '../../services/billingService';
import type { DayEndSummaryResult, ShopProfile } from '../../types';

interface DayEndReconciliationViewProps {
  shopProfile: ShopProfile;
}

const DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 2, 1];

export const DayEndReconciliationView: React.FC<DayEndReconciliationViewProps> = ({
  shopProfile,
}) => {
  const [targetDate, setTargetDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [summary, setSummary] = useState<DayEndSummaryResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Cashier inputs
  const [openingFloat, setOpeningFloat] = useState<number>(1000);
  const [pettyExpenses, setPettyExpenses] = useState<number>(0);
  const [expenseReason, setExpenseReason] = useState<string>('');
  const [cashierName, setCashierName] = useState<string>('Counter Cashier 1');
  const [shiftNotes, setShiftNotes] = useState<string>('');

  // Physical Denomination Counts
  const [counts, setCounts] = useState<{ [denom: number]: number }>({
    500: 0,
    200: 0,
    100: 0,
    50: 0,
    20: 0,
    10: 0,
    5: 0,
    2: 0,
    1: 0,
  });

  const loadSummary = async (date: string) => {
    setIsLoading(true);
    try {
      const res = await billingService.getDayEndSummary(date);
      setSummary(res);
    } catch (err) {
      console.error('Failed to load day end summary:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSummary(targetDate);
  }, [targetDate]);

  // Denomination calculations
  const totalCountedCash = useMemo(() => {
    return Object.entries(counts).reduce((sum, [denom, count]) => {
      return sum + Number(denom) * (count || 0);
    }, 0);
  }, [counts]);

  // Expected Cash calculation
  const expectedCash = useMemo(() => {
    if (!summary) return 0;
    return openingFloat + summary.cash_sales - summary.cash_refund_amount - pettyExpenses;
  }, [openingFloat, summary, pettyExpenses]);

  // Discrepancy
  const discrepancy = totalCountedCash - expectedCash;
  const isBalanced = Math.abs(discrepancy) < 0.01;
  const isOverage = discrepancy > 0.01;

  const handleCountChange = (denom: number, val: string) => {
    const num = Math.max(0, parseInt(val, 10) || 0);
    setCounts((prev) => ({ ...prev, [denom]: num }));
  };

  const handlePrintZReport = () => {
    window.print();
  };

  return (
    <div className="space-y-5 p-6">
      {/* Top Controls Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-emerald-600" />
          <span className="text-xs font-bold text-slate-700">Reconciliation Date:</span>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="text-xs px-2.5 py-1 bg-slate-50 border border-slate-300 rounded font-semibold text-slate-800"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />}
            onClick={() => loadSummary(targetDate)}
          >
            Refresh Data
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<Printer className="w-3.5 h-3.5" />}
            onClick={handlePrintZReport}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            Print Z-Report Slip
          </Button>
        </div>
      </div>

      {/* Grid: Left Expected Cash vs Right Denomination Counter */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Register Cash Flow (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Sales Summary KPIs */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
              <span>Day Sales & Register Inflow</span>
              <span className="font-mono text-[11px] text-slate-400">
                {summary?.total_invoices || 0} Invoices Finalized
              </span>
            </h4>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100">
                <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-800">
                  <Banknote className="w-3.5 h-3.5" /> Cash Sales
                </div>
                <div className="text-lg font-black text-emerald-900 mt-1">
                  {formatCurrency(summary?.cash_sales || 0)}
                </div>
              </div>

              <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-100">
                <div className="flex items-center gap-1 text-[11px] font-bold text-indigo-800">
                  <QrCode className="w-3.5 h-3.5" /> UPI Sales
                </div>
                <div className="text-lg font-black text-indigo-900 mt-1">
                  {formatCurrency(summary?.upi_sales || 0)}
                </div>
              </div>

              <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
                <div className="flex items-center gap-1 text-[11px] font-bold text-blue-800">
                  <CreditCard className="w-3.5 h-3.5" /> Card Sales
                </div>
                <div className="text-lg font-black text-blue-900 mt-1">
                  {formatCurrency(summary?.card_sales || 0)}
                </div>
              </div>
            </div>

            {/* Reconciliation Math Ledger */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs space-y-2.5">
              <div className="font-bold text-slate-700 flex items-center justify-between">
                <span>1. Morning Opening Float (Base Cash)</span>
                <div className="flex items-center gap-1">
                  <span>₹</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={openingFloat}
                    onChange={(e) => setOpeningFloat(parseFloat(e.target.value) || 0)}
                    className="w-24 text-right px-2 py-0.5 font-bold bg-white border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-emerald-800 font-semibold">
                <span className="flex items-center gap-1">
                  <ArrowUpCircle className="w-3.5 h-3.5" /> 2. Total Cash Tender Received
                </span>
                <span>+{formatCurrency(summary?.cash_sales || 0)}</span>
              </div>

              <div className="flex items-center justify-between text-rose-700 font-semibold">
                <span className="flex items-center gap-1">
                  <ArrowDownCircle className="w-3.5 h-3.5" /> 3. Cash Refunds / Returns Outflow
                </span>
                <span>-{formatCurrency(summary?.cash_refund_amount || 0)}</span>
              </div>

              <div className="flex items-center justify-between text-slate-700 font-semibold pt-1 border-t border-slate-200">
                <div className="flex items-center gap-2">
                  <span>4. Cash Paid Out / Petty Expenses</span>
                  <input
                    type="text"
                    placeholder="Expense note (e.g. Milk, Sweeping)"
                    value={expenseReason}
                    onChange={(e) => setExpenseReason(e.target.value)}
                    className="text-[11px] px-2 py-0.5 bg-white border border-slate-200 rounded w-44 font-normal"
                  />
                </div>
                <div className="flex items-center gap-1 text-rose-700">
                  <span>-₹</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={pettyExpenses}
                    onChange={(e) => setPettyExpenses(parseFloat(e.target.value) || 0)}
                    className="w-24 text-right px-2 py-0.5 font-bold bg-white border border-slate-300 rounded focus:ring-1 focus:ring-rose-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-sm font-black pt-2 border-t-2 border-slate-300 text-slate-900">
                <span>= Expected Cash in Drawer</span>
                <span className="text-base text-slate-900">{formatCurrency(expectedCash)}</span>
              </div>
            </div>

            {/* Cashier Sign-off Notes */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Closing Cashier Name
                </label>
                <input
                  type="text"
                  value={cashierName}
                  onChange={(e) => setCashierName(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Shift Notes / Handover Memo
                </label>
                <input
                  type="text"
                  placeholder="e.g. Handed keys to evening manager"
                  value={shiftNotes}
                  onChange={(e) => setShiftNotes(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Denomination Calculator & Discrepancy (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Calculator className="w-4 h-4 text-slate-700" />
                Physical Cash Denomination Count
              </h4>
              <button
                type="button"
                onClick={() => setCounts({ 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0 })}
                className="text-[11px] text-slate-500 hover:text-slate-800 underline cursor-pointer"
              >
                Clear
              </button>
            </div>

            {/* Denomination Inputs Grid */}
            <div className="divide-y divide-slate-100 text-xs">
              {DENOMINATIONS.map((d) => (
                <div key={d} className="py-1.5 flex items-center justify-between">
                  <span className="font-bold text-slate-700 w-16">₹{d}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">×</span>
                    <input
                      type="number"
                      min="0"
                      value={counts[d] || ''}
                      placeholder="0"
                      onChange={(e) => handleCountChange(d, e.target.value)}
                      className="w-16 text-center font-bold px-1.5 py-1 bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <span className="text-slate-400 font-mono text-[11px] w-20 text-right font-semibold">
                      = ₹{((counts[d] || 0) * d).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Physical Count Total */}
            <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
              <span className="font-bold text-slate-700 text-xs">Total Physical Cash:</span>
              <span className="text-lg font-black text-slate-900">
                {formatCurrency(totalCountedCash)}
              </span>
            </div>

            {/* Discrepancy Status Card */}
            <div
              className={`p-3.5 rounded-xl border flex items-center justify-between ${
                isBalanced
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : isOverage
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <div className="flex items-center gap-2">
                {isBalanced ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                ) : (
                  <AlertTriangle className={`w-5 h-5 ${isOverage ? 'text-amber-600' : 'text-rose-600'}`} />
                )}
                <div>
                  <div className="font-bold text-xs">
                    {isBalanced
                      ? 'Drawer Perfectly Balanced ✓'
                      : isOverage
                      ? 'Cash Overage (Excess in Drawer)'
                      : 'Cash Shortage (Discrepancy)'}
                  </div>
                  <div className="text-[11px] opacity-80">
                    Expected: {formatCurrency(expectedCash)} · Counted: {formatCurrency(totalCountedCash)}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-sm font-black">
                  {discrepancy >= 0 ? `+${formatCurrency(discrepancy)}` : formatCurrency(discrepancy)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden Thermal Slip for Printing (@media print) */}
      <div className="hidden print:block print:fixed print:inset-0 print:bg-white print:z-99999 text-black">
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            body * { visibility: hidden; }
            .zreport-slip, .zreport-slip * { visibility: visible; }
            .zreport-slip {
              position: absolute;
              left: 0;
              top: 0;
              width: 72mm;
              font-family: monospace;
              font-size: 9pt;
              line-height: 1.25;
              padding: 2mm;
            }
            .zreport-divider {
              border-bottom: 1pt dashed #000;
              margin: 1.5mm 0;
            }
          }
        `}} />

        <div className="zreport-slip">
          <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '11pt' }}>
            {shopProfile.shop_name || 'APNA GROCERY STORE'}
          </div>
          <div style={{ textAlign: 'center', fontSize: '8pt' }}>
            {shopProfile.shop_address || 'Main Market'}
          </div>
          <div style={{ textAlign: 'center', fontWeight: 'bold', margin: '2mm 0' }}>
            *** DAY-END Z-REPORT (SHIFT CLOSE) ***
          </div>

          <div className="zreport-divider" />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Date: {targetDate}</span>
            <span>Time: {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div>Cashier: {cashierName}</div>
          <div>Total Invoices: {summary?.total_invoices || 0}</div>

          <div className="zreport-divider" />
          <div style={{ fontWeight: 'bold' }}>SALES REVENUE SUMMARY:</div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Cash Sales:</span>
            <span>Rs. {summary?.cash_sales.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>UPI / QR Sales:</span>
            <span>Rs. {summary?.upi_sales.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Card Sales:</span>
            <span>Rs. {summary?.card_sales.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
            <span>Total Sales Revenue:</span>
            <span>Rs. {summary?.total_sales_revenue.toFixed(2)}</span>
          </div>

          <div className="zreport-divider" />
          <div style={{ fontWeight: 'bold' }}>CASH RECONCILIATION:</div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>(+) Opening Float:</span>
            <span>Rs. {openingFloat.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>(+) Cash Tender Inflow:</span>
            <span>Rs. {summary?.cash_sales.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>(-) Cash Refunds:</span>
            <span>Rs. {summary?.cash_refund_amount.toFixed(2)}</span>
          </div>
          {pettyExpenses > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>(-) Expenses ({expenseReason || 'Petty'}):</span>
              <span>Rs. {pettyExpenses.toFixed(2)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
            <span>(=) Expected Cash:</span>
            <span>Rs. {expectedCash.toFixed(2)}</span>
          </div>

          <div className="zreport-divider" />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
            <span>PHYSICAL COUNT:</span>
            <span>Rs. {totalCountedCash.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
            <span>DISCREPANCY:</span>
            <span>
              {discrepancy >= 0 ? `+Rs. ${discrepancy.toFixed(2)}` : `-Rs. ${Math.abs(discrepancy).toFixed(2)}`}
              {isBalanced ? ' (BALANCED)' : isOverage ? ' (OVERAGE)' : ' (SHORTAGE)'}
            </span>
          </div>

          {shiftNotes && (
            <div style={{ margin: '2mm 0', fontSize: '8pt' }}>
              Notes: {shiftNotes}
            </div>
          )}

          <div className="zreport-divider" />
          <div style={{ marginTop: '5mm', display: 'flex', justifyContent: 'space-between', fontSize: '8pt' }}>
            <span>Cashier Sig: _________</span>
            <span>Manager Sig: _________</span>
          </div>
          <div style={{ textAlign: 'center', fontSize: '7pt', marginTop: '3mm' }}>
            === END OF SHIFT REPORT ===
          </div>
        </div>
      </div>
    </div>
  );
};
