import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BarChart3,
  TrendingUp,
  Download,
  Calendar,
  FileSpreadsheet,
  Users,
  Package,
  FileText,
  IndianRupee,
  Search,
  Check,
  RefreshCw,
  CreditCard,
  Banknote,
  QrCode,
  Filter,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { billingService, formatCurrency, formatSaleDateTime } from '../../services/billingService';
import type { BusinessReportResult, BusinessReportFilter } from '../../types';

function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function getReportDateTimeFilename(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = now.getFullYear();
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  const hours = pad(now.getHours());
  const mins = pad(now.getMinutes());
  const secs = pad(now.getSeconds());

  // Strict date+time.csv as requested (e.g. 2026-09-26_12-45-00.csv)
  return `${year}-${month}-${day}_${hours}-${mins}-${secs}.csv`;
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const ReportsPage: React.FC = () => {
  // Preset filter state
  const [datePreset, setDatePreset] = useState<BusinessReportFilter['date_preset']>('today');
  const [startDate, setStartDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  // Report state
  const [report, setReport] = useState<BusinessReportResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'customers' | 'products' | 'invoices'>('overview');
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Export Modal state
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportIncludeSummary, setExportIncludeSummary] = useState(true);
  const [exportIncludeCustomers, setExportIncludeCustomers] = useState(true);
  const [exportIncludeProducts, setExportIncludeProducts] = useState(true);
  const [exportIncludeInvoices, setExportIncludeInvoices] = useState(true);
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    setIsLoading(true);
    try {
      const filter: BusinessReportFilter = {
        date_preset: datePreset,
        start_date: datePreset === 'custom' ? startDate : undefined,
        end_date: datePreset === 'custom' ? endDate : undefined,
      };
      const res = await billingService.getBusinessReport(filter);
      setReport(res);
    } catch (err) {
      console.error('Failed to load business report:', err);
    } finally {
      setIsLoading(false);
    }
  }, [datePreset, startDate, endDate]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // CSV Generator function
  const handleExportCsv = (options: {
    summary: boolean;
    customers: boolean;
    products: boolean;
    invoices: boolean;
  }) => {
    if (!report) return;

    const lines: string[] = [];

    // Header info
    lines.push(`APNA GROCERY POS - STORE PERFORMANCE & FINANCIAL REPORT`);
    lines.push(`Report Period,${report.period_label}`);
    lines.push(`Generated At,${new Date().toLocaleString('en-IN')}`);
    lines.push('');

    // 1. Financial & Sales Summary
    if (options.summary) {
      lines.push(`[ 1. STORE SALES & PROFIT SUMMARY ]`);
      lines.push(`Metric,Value`);
      lines.push(`Total Invoices,${report.summary.total_invoices}`);
      lines.push(`Total Items Sold,${report.summary.total_items_sold}`);
      lines.push(`Total Sales Revenue (Total Spend on Sell),₹${report.summary.total_sales_revenue.toFixed(2)}`);
      lines.push(`Total Purchase Cost of Goods (Total Spent on Buy),₹${report.summary.total_purchase_cost.toFixed(2)}`);
      lines.push(`Gross Profit,₹${report.summary.gross_profit.toFixed(2)}`);
      lines.push(`Profit Margin,${report.summary.profit_margin_percent.toFixed(2)}%`);
      lines.push(`GST Tax Collected,₹${report.summary.total_tax.toFixed(2)}`);
      lines.push(`Discounts Given,₹${report.summary.total_discount.toFixed(2)}`);
      lines.push(`Cash Payments,₹${report.summary.payment_cash.toFixed(2)}`);
      lines.push(`UPI Payments,₹${report.summary.payment_upi.toFixed(2)}`);
      lines.push(`Card Payments,₹${report.summary.payment_card.toFixed(2)}`);
      lines.push('');
    }

    // 2. Customer Spend Report
    if (options.customers) {
      lines.push(`[ 2. CUSTOMER SPEND & VISIT ANALYSIS ]`);
      lines.push(
        `Customer Name,Mobile / Phone,Address,Total Invoices,Total Spent on Buying (Sell Spend ₹),Store Purchase Cost (Buy Spend ₹),Store Net Margin (₹),Last Visit Date`
      );
      for (const c of report.customers) {
        const margin = c.total_spent_on_buying - c.total_purchase_cost_to_store;
        lines.push(
          [
            escapeCsvCell(c.name),
            escapeCsvCell(c.phone || '—'),
            escapeCsvCell(c.address || '—'),
            c.total_invoices,
            c.total_spent_on_buying.toFixed(2),
            c.total_purchase_cost_to_store.toFixed(2),
            margin.toFixed(2),
            escapeCsvCell(c.last_visit),
          ].join(',')
        );
      }
      lines.push('');
    }

    // 3. More Selling Items Report
    if (options.products) {
      lines.push(`[ 3. TOP / MORE SELLING ITEMS VELOCITY ]`);
      lines.push(
        `Product Name,Category,Barcode,HSN Code,Unit,Quantity Sold,Total Sales Revenue (Sell Spend ₹),Total Purchase Cost (Buy Spend ₹),Net Profit (₹)`
      );
      for (const p of report.top_products) {
        lines.push(
          [
            escapeCsvCell(p.product_name),
            escapeCsvCell(p.category),
            escapeCsvCell(p.barcode || '—'),
            escapeCsvCell(p.hsn_code || '—'),
            escapeCsvCell(p.unit),
            p.quantity_sold,
            p.total_sales_revenue.toFixed(2),
            p.total_purchase_cost.toFixed(2),
            p.total_profit.toFixed(2),
          ].join(',')
        );
      }
      lines.push('');
    }

    // 4. Detailed Sales Invoices Ledger
    if (options.invoices) {
      lines.push(`[ 4. ITEMIZED INVOICE TRANSACTIONS ]`);
      lines.push(
        `Invoice Number,Date & Time,Customer Name,Customer Phone,Payment Mode,Status,Items Count,Subtotal (₹),Discount (₹),Tax (₹),Grand Total (₹)`
      );
      for (const s of report.sales) {
        lines.push(
          [
            escapeCsvCell(s.invoice_number),
            escapeCsvCell(s.created_at),
            escapeCsvCell(s.customer_name || 'Walk-in Customer'),
            escapeCsvCell(s.customer_phone || '—'),
            escapeCsvCell(s.payment_mode),
            escapeCsvCell(s.payment_status),
            s.item_count,
            s.subtotal.toFixed(2),
            s.discount_amount.toFixed(2),
            s.tax_amount.toFixed(2),
            s.total_amount.toFixed(2),
          ].join(',')
        );
      }
      lines.push('');
    }

    // UTF-8 BOM ensures proper character rendering in Microsoft Excel & Google Sheets
    const csvContent = '\uFEFF' + lines.join('\r\n');
    const filename = getReportDateTimeFilename();
    downloadCsv(csvContent, filename);

    setExportSuccessMsg(`Successfully exported: ${filename}`);
    setTimeout(() => setExportSuccessMsg(null), 5000);
    setIsExportModalOpen(false);
  };

  // Quick 1-click Export All
  const handleQuickExportAll = () => {
    handleExportCsv({
      summary: true,
      customers: true,
      products: true,
      invoices: true,
    });
  };

  // Filtered lists for table search
  const filteredCustomers = useMemo(() => {
    if (!report) return [];
    if (!searchFilter.trim()) return report.customers;
    const q = searchFilter.toLowerCase();
    return report.customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q)) ||
        (c.address && c.address.toLowerCase().includes(q))
    );
  }, [report, searchFilter]);

  const filteredProducts = useMemo(() => {
    if (!report) return [];
    if (!searchFilter.trim()) return report.top_products;
    const q = searchFilter.toLowerCase();
    return report.top_products.filter(
      (p) =>
        p.product_name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.includes(q)) ||
        (p.hsn_code && p.hsn_code.includes(q))
    );
  }, [report, searchFilter]);

  const filteredInvoices = useMemo(() => {
    if (!report) return [];
    if (!searchFilter.trim()) return report.sales;
    const q = searchFilter.toLowerCase();
    return report.sales.filter(
      (s) =>
        s.invoice_number.toLowerCase().includes(q) ||
        (s.customer_name && s.customer_name.toLowerCase().includes(q)) ||
        (s.customer_phone && s.customer_phone.includes(q))
    );
  }, [report, searchFilter]);

  return (
    <div className="flex-1 flex flex-col p-6 space-y-6 overflow-y-auto bg-slate-50/50">
      {/* Top Header & Export Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-orange-500 text-white shadow-sm">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-slate-900 tracking-tight">
                Store Reports & Analytics
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-orange-100 text-orange-800 border border-orange-200">
                CSV Export Engine
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Instant daily, monthly, yearly performance, customer buying spend, product velocity & accountant CSVs
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            variant="outline"
            size="md"
            icon={<RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />}
            onClick={fetchReport}
          >
            Refresh
          </Button>

          <Button
            variant="outline"
            size="md"
            icon={<Filter className="w-4 h-4 text-orange-600" />}
            onClick={() => setIsExportModalOpen(true)}
            className="border-orange-200 hover:border-orange-300 text-orange-900 font-bold"
          >
            Export Filtered CSV
          </Button>

          <Button
            variant="primary"
            size="md"
            icon={<FileSpreadsheet className="w-4 h-4" />}
            onClick={handleQuickExportAll}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs"
          >
            Export All to CSV (date+time.csv)
          </Button>
        </div>
      </div>

      {/* Success Notification Banner */}
      {exportSuccessMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center gap-2 text-xs font-bold text-emerald-900 shadow-2xs">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{exportSuccessMsg}</span>
        </div>
      )}

      {/* Time Period Filter Chips */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-slate-400" />
            Select Time Period:
          </span>
          <span className="text-xs font-semibold text-slate-700">
            Active: <strong className="text-slate-900">{report?.period_label || 'Today'}</strong>
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {[
            { id: 'today', label: 'Today (Daily)' },
            { id: 'yesterday', label: 'Yesterday' },
            { id: 'this_week', label: 'This Week (7 Days)' },
            { id: 'this_month', label: 'This Month (Monthly)' },
            { id: 'last_month', label: 'Last Month' },
            { id: 'this_year', label: 'This Year (Yearly)' },
            { id: 'all', label: 'All Time' },
            { id: 'custom', label: 'Custom Range ⚙' },
          ].map((preset) => {
            const isSelected = datePreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => setDatePreset(preset.id as any)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {/* Custom Date Pickers (Shown only when 'custom' is active) */}
        {datePreset === 'custom' && (
          <div className="pt-3 border-t border-slate-100 flex items-center gap-3 flex-wrap bg-slate-50 p-3 rounded-lg">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-slate-600">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded font-medium text-slate-800 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-slate-600">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded font-medium text-slate-800 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
            <Button variant="primary" size="sm" onClick={fetchReport}>
              Apply Filter
            </Button>
          </div>
        )}
      </div>

      {/* KPI Cards Grid */}
      {report && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Sales Revenue (Spend on Sell) */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Total Sell (Revenue)
              </span>
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700">
                <IndianRupee className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black text-slate-900 tracking-tight">
                {formatCurrency(report.summary.total_sales_revenue)}
              </div>
              <p className="text-[11px] text-slate-500 font-medium mt-1">
                Total customer spending at store counter
              </p>
            </div>
          </div>

          {/* Card 2: Total Purchase Cost (Spent on Buy) */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Total Buy (Cost of Goods)
              </span>
              <div className="p-2 rounded-lg bg-indigo-50 text-indigo-700">
                <Package className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black text-slate-900 tracking-tight">
                {formatCurrency(report.summary.total_purchase_cost)}
              </div>
              <p className="text-[11px] text-slate-500 font-medium mt-1">
                What merchant spent to buy sold items
              </p>
            </div>
          </div>

          {/* Card 3: Gross Profit & Margin % */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Gross Profit & Margin
              </span>
              <div className="p-2 rounded-lg bg-teal-50 text-teal-700">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black text-emerald-700 tracking-tight flex items-baseline gap-2">
                <span>{formatCurrency(report.summary.gross_profit)}</span>
                <span className="text-xs font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">
                  {report.summary.profit_margin_percent}%
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium mt-1">
                Net earnings after product purchase costs
              </p>
            </div>
          </div>

          {/* Card 4: Invoices & Items Sold */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Bills & Quantities
              </span>
              <div className="p-2 rounded-lg bg-amber-50 text-amber-700">
                <FileText className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black text-slate-900 tracking-tight flex items-baseline gap-2">
                <span>{report.summary.total_invoices} bills</span>
                <span className="text-xs font-bold text-slate-500">
                  ({report.summary.total_items_sold} items)
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium mt-1">
                GST collected: {formatCurrency(report.summary.total_tax)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modes Breakdown Bar */}
      {report && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between flex-wrap gap-4 text-xs font-semibold">
          <div className="flex items-center gap-2 text-slate-500 uppercase tracking-wider text-[11px]">
            <CreditCard className="w-4 h-4" />
            <span>Payment Collection Split:</span>
          </div>
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <Banknote className="w-4 h-4 text-emerald-600" />
              <span>Cash:</span>
              <strong className="text-slate-900 font-bold">{formatCurrency(report.summary.payment_cash)}</strong>
            </div>
            <div className="flex items-center gap-2">
              <QrCode className="w-4 h-4 text-indigo-600" />
              <span>UPI / QR:</span>
              <strong className="text-slate-900 font-bold">{formatCurrency(report.summary.payment_upi)}</strong>
            </div>
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-blue-600" />
              <span>Card:</span>
              <strong className="text-slate-900 font-bold">{formatCurrency(report.summary.payment_card)}</strong>
            </div>
          </div>
        </div>
      )}

      {/* Main Tabbed Interactive Data Views */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs flex-1 flex flex-col overflow-hidden">
        {/* Navigation Tabs Header */}
        <div className="border-b border-slate-200 px-6 pt-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            {[
              { id: 'overview', label: 'Store Overview', icon: <TrendingUp className="w-4 h-4" /> },
              {
                id: 'customers',
                label: `Customer Spend (${report?.customers.length || 0})`,
                icon: <Users className="w-4 h-4" />,
              },
              {
                id: 'products',
                label: `More Selling Items (${report?.top_products.length || 0})`,
                icon: <Package className="w-4 h-4" />,
              },
              {
                id: 'invoices',
                label: `Sales Invoices (${report?.sales.length || 0})`,
                icon: <FileText className="w-4 h-4" />,
              },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`pb-3.5 px-3 flex items-center gap-2 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                    isActive
                      ? 'border-emerald-600 text-emerald-800'
                      : 'border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Search Filter for tables */}
          {activeTab !== 'overview' && (
            <div className="pb-3 w-64 relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Search rows..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-900"
              />
            </div>
          )}
        </div>

        {/* Tab Content Panes */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && report && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Top 5 Products Quick View */}
                <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Package className="w-4 h-4 text-emerald-600" />
                      Top Velocity Selling Items
                    </h3>
                    <button
                      onClick={() => setActiveTab('products')}
                      className="text-xs font-bold text-emerald-700 hover:underline cursor-pointer"
                    >
                      View All →
                    </button>
                  </div>
                  {report.top_products.length === 0 ? (
                    <p className="text-xs text-slate-400 py-4 text-center">No product sales in this period.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {report.top_products.slice(0, 5).map((p, idx) => (
                        <div
                          key={idx}
                          className="bg-white p-3 rounded-lg border border-slate-200 flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-bold text-slate-900">{p.product_name}</span>
                            <span className="text-slate-400 text-[10px] block">
                              {p.category} · {p.hsn_code ? `HSN ${p.hsn_code}` : p.unit}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="font-black text-slate-900">
                              {p.quantity_sold} {p.unit}
                            </span>
                            <span className="text-[10px] text-emerald-700 font-bold block">
                              Revenue: ₹{p.total_sales_revenue.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Top 5 Spending Customers Quick View */}
                <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Users className="w-4 h-4 text-indigo-600" />
                      Top Buying Customers
                    </h3>
                    <button
                      onClick={() => setActiveTab('customers')}
                      className="text-xs font-bold text-indigo-700 hover:underline cursor-pointer"
                    >
                      View All →
                    </button>
                  </div>
                  {report.customers.length === 0 ? (
                    <p className="text-xs text-slate-400 py-4 text-center">No customer transactions in this period.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {report.customers.slice(0, 5).map((c, idx) => (
                        <div
                          key={idx}
                          className="bg-white p-3 rounded-lg border border-slate-200 flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-bold text-slate-900">{c.name}</span>
                            <span className="text-slate-400 text-[10px] block">
                              {c.phone || 'No phone'} {c.address ? `· ${c.address}` : ''}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="font-black text-slate-900">
                              ₹{c.total_spent_on_buying.toFixed(2)}
                            </span>
                            <span className="text-[10px] text-slate-500 font-medium block">
                              {c.total_invoices} bill(s)
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CUSTOMERS TABLE */}
          {activeTab === 'customers' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">
                  Showing {filteredCustomers.length} customer records
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  icon={<Download className="w-3.5 h-3.5" />}
                  onClick={() =>
                    handleExportCsv({
                      summary: false,
                      customers: true,
                      products: false,
                      invoices: false,
                    })
                  }
                >
                  Export Customers Only (CSV)
                </Button>
              </div>

              {filteredCustomers.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-xs font-bold">No customers found</p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider text-[10px] font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3">Customer Name</th>
                        <th className="py-2.5 px-3">Mobile No</th>
                        <th className="py-2.5 px-3">Address</th>
                        <th className="py-2.5 px-3 text-center">Bills</th>
                        <th className="py-2.5 px-3 text-right">Total Spent on Buy (₹)</th>
                        <th className="py-2.5 px-3 text-right">Store Purchase Cost (₹)</th>
                        <th className="py-2.5 px-3 text-right font-bold text-emerald-800">Store Margin (₹)</th>
                        <th className="py-2.5 px-3 text-right">Last Visit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {filteredCustomers.map((c, idx) => {
                        const margin = c.total_spent_on_buying - c.total_purchase_cost_to_store;
                        const { date, time } = formatSaleDateTime(c.last_visit);
                        return (
                          <tr key={idx} className="hover:bg-slate-50/70">
                            <td className="py-2.5 px-3 font-mono text-slate-400">{idx + 1}</td>
                            <td className="py-2.5 px-3 font-bold text-slate-900">{c.name}</td>
                            <td className="py-2.5 px-3 font-mono text-slate-700">{c.phone || '—'}</td>
                            <td className="py-2.5 px-3 text-slate-500 max-w-xs truncate">{c.address || '—'}</td>
                            <td className="py-2.5 px-3 text-center font-bold">{c.total_invoices}</td>
                            <td className="py-2.5 px-3 text-right font-black text-slate-900">
                              ₹{c.total_spent_on_buying.toFixed(2)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                              ₹{c.total_purchase_cost_to_store.toFixed(2)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-emerald-700">
                              ₹{margin.toFixed(2)}
                            </td>
                            <td className="py-2.5 px-3 text-right text-slate-500 whitespace-nowrap">
                              {date} {time !== '—' ? time : ''}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: MORE SELLING PRODUCTS TABLE */}
          {activeTab === 'products' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">
                  Showing {filteredProducts.length} product velocity records
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  icon={<Download className="w-3.5 h-3.5" />}
                  onClick={() =>
                    handleExportCsv({
                      summary: false,
                      customers: false,
                      products: true,
                      invoices: false,
                    })
                  }
                >
                  Export Products Only (CSV)
                </Button>
              </div>

              {filteredProducts.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-xs font-bold">No product sales found</p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider text-[10px] font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3">Product Name</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3 font-mono">Barcode / HSN</th>
                        <th className="py-2.5 px-3 text-center">Qty Sold</th>
                        <th className="py-2.5 px-3 text-right">Total Sell Spend (Revenue)</th>
                        <th className="py-2.5 px-3 text-right">Total Buy Spend (Cost)</th>
                        <th className="py-2.5 px-3 text-right font-bold text-emerald-800">Total Profit (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {filteredProducts.map((p, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-3 font-mono text-slate-400">{idx + 1}</td>
                          <td className="py-2.5 px-3 font-bold text-slate-900">{p.product_name}</td>
                          <td className="py-2.5 px-3 text-slate-500">{p.category}</td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                            {p.hsn_code ? `HSN: ${p.hsn_code}` : p.barcode || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-center font-black text-slate-900">
                            {p.quantity_sold} {p.unit}
                          </td>
                          <td className="py-2.5 px-3 text-right font-black text-slate-900">
                            ₹{p.total_sales_revenue.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                            ₹{p.total_purchase_cost.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-emerald-700">
                            ₹{p.total_profit.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: SALES INVOICES TABLE */}
          {activeTab === 'invoices' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">
                  Showing {filteredInvoices.length} invoices
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  icon={<Download className="w-3.5 h-3.5" />}
                  onClick={() =>
                    handleExportCsv({
                      summary: false,
                      customers: false,
                      products: false,
                      invoices: true,
                    })
                  }
                >
                  Export Invoices Only (CSV)
                </Button>
              </div>

              {filteredInvoices.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-xs font-bold">No sales invoices found</p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider text-[10px] font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Invoice No</th>
                        <th className="py-2.5 px-3">Date & Time</th>
                        <th className="py-2.5 px-3">Customer</th>
                        <th className="py-2.5 px-3 text-center">Items</th>
                        <th className="py-2.5 px-3 text-center">Mode</th>
                        <th className="py-2.5 px-3 text-right">Tax (₹)</th>
                        <th className="py-2.5 px-3 text-right">Discount (₹)</th>
                        <th className="py-2.5 px-3 text-right font-bold text-slate-900">Total (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {filteredInvoices.map((s, idx) => {
                        const { date, time } = formatSaleDateTime(s.created_at);
                        return (
                          <tr key={idx} className="hover:bg-slate-50/70">
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                              {s.invoice_number}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                              {date} <span className="text-[10px] text-slate-400">{time}</span>
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="font-bold text-slate-900 block">{s.customer_name || 'Walk-in'}</span>
                              {s.customer_phone && (
                                <span className="font-mono text-[10px] text-slate-500">{s.customer_phone}</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center">{s.item_count}</td>
                            <td className="py-2.5 px-3 text-center">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  s.payment_mode === 'CASH'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : s.payment_mode === 'UPI'
                                    ? 'bg-indigo-100 text-indigo-800'
                                    : 'bg-blue-100 text-blue-800'
                                }`}
                              >
                                {s.payment_mode}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                              ₹{s.tax_amount.toFixed(2)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-emerald-700">
                              {s.discount_amount > 0 ? `-₹${s.discount_amount.toFixed(2)}` : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-black text-slate-900">
                              ₹{s.total_amount.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Customized CSV Export Modal */}
      <Modal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        title="Custom CSV Export (Choose Sections & Filters)"
        maxWidth="md"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600">
            Select the business sections you wish to include in your exported CSV file. The file will be named in the exact format{' '}
            <code className="px-1.5 py-0.5 bg-slate-100 font-mono rounded border text-slate-800">
              YYYY-MM-DD_HH-mm-ss.csv
            </code>
            .
          </p>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={exportIncludeSummary}
                onChange={(e) => setExportIncludeSummary(e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
              />
              <div>
                <span className="text-xs font-bold text-slate-900 block">
                  1. Sales & Financial Summary
                </span>
                <span className="text-[11px] text-slate-500 block">
                  Total sell revenue, total buy spend, gross profit, margin %, tax, and payment modes
                </span>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={exportIncludeCustomers}
                onChange={(e) => setExportIncludeCustomers(e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
              />
              <div>
                <span className="text-xs font-bold text-slate-900 block">
                  2. Customer Spend Analysis
                </span>
                <span className="text-[11px] text-slate-500 block">
                  Customer name, mobile number, address, total spent on buying, and visits count
                </span>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={exportIncludeProducts}
                onChange={(e) => setExportIncludeProducts(e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
              />
              <div>
                <span className="text-xs font-bold text-slate-900 block">
                  3. More Selling Items (Velocity & Margin)
                </span>
                <span className="text-[11px] text-slate-500 block">
                  Product name, category, HSN, quantity sold, unit, total sales revenue, and buy cost
                </span>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={exportIncludeInvoices}
                onChange={(e) => setExportIncludeInvoices(e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
              />
              <div>
                <span className="text-xs font-bold text-slate-900 block">
                  4. Detailed Sales Invoices Ledger
                </span>
                <span className="text-[11px] text-slate-500 block">
                  Itemized list of invoices, date & time, customer phone, subtotal, and tax
                </span>
              </div>
            </label>
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
            <span className="text-[11px] text-slate-500 font-mono">
              Format: UTF-8 BOM (.csv)
            </span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="md" onClick={() => setIsExportModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                icon={<Download className="w-4 h-4" />}
                onClick={() =>
                  handleExportCsv({
                    summary: exportIncludeSummary,
                    customers: exportIncludeCustomers,
                    products: exportIncludeProducts,
                    invoices: exportIncludeInvoices,
                  })
                }
              >
                Download CSV
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};
