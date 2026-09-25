import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  RefreshCw,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Eye,
  Printer,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  AlertCircle,
  Receipt,
  CreditCard,
  Banknote,
  QrCode,
  Wallet,
  SlidersHorizontal,
  RotateCcw,
  FileCheck2,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { InvoiceReceipt } from '../../components/billing/InvoiceReceipt';
import { ReturnModal } from '../../components/returns/ReturnModal';
import { ReturnReceipt } from '../../components/returns/ReturnReceipt';
import {
  billingService,
  formatCurrency,
  formatSaleDateTime,
} from '../../services/billingService';
import { returnService } from '../../services/returnService';
import type {
  SaleListItem,
  SalesFilterParams,
  SaleResult,
  ShopProfile,
  NavigationTab,
  ReturnListItem,
  SalesReturnResult,
} from '../../types';

interface SalesPageProps {
  onNavigate?: (tab: NavigationTab) => void;
}

type DatePreset = 'all' | 'today' | 'yesterday' | 'last_7_days' | 'this_month' | 'custom';
type SortField = 'created_at' | 'invoice_number' | 'total_amount';
type SortDir = 'asc' | 'desc';

export const SalesPage: React.FC<SalesPageProps> = ({ onNavigate }) => {
  // ----------------------------------------------------
  // State: Filter, Search, Pagination, Sorting
  // ----------------------------------------------------
  const [searchInput, setSearchInput] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [paymentMode, setPaymentMode] = useState<string>('ALL');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [customDateError, setCustomDateError] = useState<string | null>(null);

  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [sortBy, setSortBy] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDir>('desc');

  // ----------------------------------------------------
  // State: Data, Loading, Errors
  // ----------------------------------------------------
  const [sales, setSales] = useState<SaleListItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // ----------------------------------------------------
  // State: Viewing / Reprinting Selected Invoice
  // ----------------------------------------------------
  const [selectedInvoice, setSelectedInvoice] = useState<SaleResult | null>(null);
  const [loadingInvoice, setLoadingInvoice] = useState<boolean>(false);
  const [shopProfile, setShopProfile] = useState<ShopProfile | null>(null);

  // ----------------------------------------------------
  // State: Tab Switcher (Invoices vs Returns)
  // ----------------------------------------------------
  const [activeTab, setActiveTab] = useState<'invoices' | 'returns'>('invoices');

  // ----------------------------------------------------
  // State: Returns Processing & Voucher Viewer
  // ----------------------------------------------------
  const [returningSale, setReturningSale] = useState<{
    id: number;
    invoiceNumber: string;
    customerName?: string | null;
    customerPhone?: string | null;
  } | null>(null);
  const [activeReturnReceipt, setActiveReturnReceipt] = useState<SalesReturnResult | null>(null);

  // ----------------------------------------------------
  // State: Returns History Tab
  // ----------------------------------------------------
  const [returnsList, setReturnsList] = useState<ReturnListItem[]>([]);
  const [returnsTotalCount, setReturnsTotalCount] = useState<number>(0);
  const [returnsTotalPages, setReturnsTotalPages] = useState<number>(1);
  const [returnsPage, setReturnsPage] = useState<number>(1);
  const [returnsLoading, setReturnsLoading] = useState<boolean>(false);

  // ----------------------------------------------------
  // Keyboard Selection State
  // ----------------------------------------------------
  const [highlightedRowIndex, setHighlightedRowIndex] = useState<number>(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ----------------------------------------------------
  // Load Shop Profile once for Reprinting
  // ----------------------------------------------------
  useEffect(() => {
    let mounted = true;
    billingService
      .getShopProfile()
      .then((profile) => {
        if (mounted) setShopProfile(profile);
      })
      .catch((err) => {
        console.warn('Could not load shop profile:', err);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // ----------------------------------------------------
  // Fetch Sales from Database
  // ----------------------------------------------------
  const fetchSales = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    // Validate custom date range
    if (datePreset === 'custom') {
      if (customStartDate && customEndDate && customStartDate > customEndDate) {
        setCustomDateError('Start date cannot be after end date.');
        setIsLoading(false);
        return;
      }
    }
    setCustomDateError(null);

    const filter: SalesFilterParams = {
      search: activeSearch.trim() ? activeSearch.trim() : null,
      payment_mode: paymentMode !== 'ALL' ? paymentMode : null,
      date_preset: datePreset,
      start_date: datePreset === 'custom' && customStartDate ? customStartDate : null,
      end_date: datePreset === 'custom' && customEndDate ? customEndDate : null,
      page,
      page_size: pageSize,
      sort_by: sortBy,
      sort_direction: sortDirection,
    };

    try {
      const result = await billingService.getSalesHistory(filter);
      setSales(result.sales);
      setTotalCount(result.total_count);
      setTotalPages(result.total_pages);
      setHighlightedRowIndex(-1);
    } catch (err: unknown) {
      const msg = typeof err === 'string' ? err : (err as Error)?.message || 'Failed to fetch sales history.';
      setErrorMessage(msg);
      setSales([]);
      setTotalCount(0);
      setTotalPages(1);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [activeSearch, paymentMode, datePreset, customStartDate, customEndDate, page, pageSize, sortBy, sortDirection]);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  // ----------------------------------------------------
  // Fetch Returns History from Database
  // ----------------------------------------------------
  const fetchReturns = useCallback(async () => {
    setReturnsLoading(true);
    try {
      const res = await returnService.getReturnsHistory({
        page: returnsPage,
        page_size: pageSize,
      });
      setReturnsList(res.returns);
      setReturnsTotalCount(res.total_count);
      setReturnsTotalPages(res.total_pages);
    } catch (err) {
      console.error('Failed to load returns history:', err);
    } finally {
      setReturnsLoading(false);
    }
  }, [returnsPage, pageSize]);

  useEffect(() => {
    if (activeTab === 'returns') {
      fetchReturns();
    }
  }, [activeTab, fetchReturns]);

  // Debounced search input sync
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== activeSearch) {
        setActiveSearch(searchInput);
        setPage(1); // reset to page 1 on new search
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, activeSearch]);

  // ----------------------------------------------------
  // View & Reprint Invoice Handler
  // ----------------------------------------------------
  const handleOpenInvoice = async (invoiceNumber: string) => {
    setLoadingInvoice(true);
    try {
      const saleResult = await billingService.getSaleByInvoice(invoiceNumber);
      setSelectedInvoice(saleResult);
    } catch (err: unknown) {
      const msg = typeof err === 'string' ? err : (err as Error)?.message || 'Failed to load invoice details.';
      alert(msg);
    } finally {
      setLoadingInvoice(false);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchSales();
  };

  const handleResetFilters = () => {
    setSearchInput('');
    setActiveSearch('');
    setPaymentMode('ALL');
    setDatePreset('all');
    setCustomStartDate('');
    setCustomEndDate('');
    setCustomDateError(null);
    setPage(1);
    setSortBy('created_at');
    setSortDirection('desc');
  };

  // ----------------------------------------------------
  // Sorting Handler
  // ----------------------------------------------------
  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDirection('desc');
    }
    setPage(1);
  };

  // ----------------------------------------------------
  // Keyboard Shortcuts (Ctrl+F, Escape, Arrow Navigation, Enter)
  // ----------------------------------------------------
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // If invoice detail is currently open, Escape will be handled by InvoiceReceipt
      if (selectedInvoice) return;

      // Ctrl+F / Cmd+F -> focus search input
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      // Escape -> clear search if focused or reset
      if (e.key === 'Escape') {
        if (searchInput) {
          setSearchInput('');
          setActiveSearch('');
        }
        return;
      }

      // Arrow Down -> navigate rows
      if (e.key === 'ArrowDown' && sales.length > 0) {
        // Only if search input is not active
        if (document.activeElement !== searchInputRef.current) {
          e.preventDefault();
          setHighlightedRowIndex((prev) => (prev < sales.length - 1 ? prev + 1 : prev));
        }
      }

      // Arrow Up -> navigate rows
      if (e.key === 'ArrowUp' && sales.length > 0) {
        if (document.activeElement !== searchInputRef.current) {
          e.preventDefault();
          setHighlightedRowIndex((prev) => (prev > 0 ? prev - 1 : 0));
        }
      }

      // Enter -> open highlighted row
      if (e.key === 'Enter' && highlightedRowIndex >= 0 && highlightedRowIndex < sales.length) {
        if (document.activeElement !== searchInputRef.current) {
          e.preventDefault();
          const target = sales[highlightedRowIndex];
          if (target) {
            handleOpenInvoice(target.invoice_number);
          }
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [selectedInvoice, searchInput, sales, highlightedRowIndex]);

  // Payment badge helper
  const renderPaymentBadge = (mode: string) => {
    const upper = mode.toUpperCase();
    switch (upper) {
      case 'CASH':
        return (
          <Badge variant="success" size="sm" icon={<Banknote className="w-3 h-3" />}>
            CASH
          </Badge>
        );
      case 'UPI':
        return (
          <Badge variant="info" size="sm" icon={<QrCode className="w-3 h-3" />}>
            UPI
          </Badge>
        );
      case 'CARD':
        return (
          <Badge variant="neutral" size="sm" icon={<CreditCard className="w-3 h-3" />}>
            CARD
          </Badge>
        );
      case 'CREDIT':
        return (
          <Badge variant="warning" size="sm" icon={<Wallet className="w-3 h-3" />}>
            CREDIT
          </Badge>
        );
      default:
        return (
          <Badge variant="neutral" size="sm">
            {upper}
          </Badge>
        );
    }
  };

  // ----------------------------------------------------
  // If an invoice is currently selected for Viewing/Reprinting:
  // Render the shared InvoiceReceipt component directly!
  // ----------------------------------------------------
  if (selectedInvoice && shopProfile) {
    return (
      <div className="flex-1 flex flex-col p-6 h-full overflow-hidden bg-slate-100">
        <InvoiceReceipt
          saleResult={selectedInvoice}
          shopProfile={shopProfile}
          mode="reprint"
          backButtonLabel="← Back to Sales History"
          onClose={() => setSelectedInvoice(null)}
          onInitiateReturn={(sr) => {
            setSelectedInvoice(null);
            setReturningSale({
              id: sr.sale.id,
              invoiceNumber: sr.sale.invoice_number,
              customerName: sr.sale.customer_name,
              customerPhone: sr.sale.customer_phone,
            });
          }}
        />
      </div>
    );
  }

  const hasActiveFilters =
    Boolean(activeSearch) ||
    paymentMode !== 'ALL' ||
    datePreset !== 'all' ||
    Boolean(customStartDate) ||
    Boolean(customEndDate);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      {/* ---------------------------------------------------- */}
      {/* Top Header Bar                                       */}
      {/* ---------------------------------------------------- */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-100">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">Sales & Returns</h1>
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setActiveTab('invoices')}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                      activeTab === 'invoices'
                        ? 'bg-white text-indigo-950 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Receipt className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Invoices</span>
                    <span className="text-[10px] px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded-full font-mono">
                      {totalCount}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('returns')}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                      activeTab === 'returns'
                        ? 'bg-white text-amber-950 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                    <span>Returns & Refunds</span>
                    {returnsTotalCount > 0 && (
                      <span className="text-[10px] px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded-full font-mono">
                        {returnsTotalCount}
                      </span>
                    )}
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {activeTab === 'invoices'
                  ? 'View, search and manage completed sales invoices'
                  : 'Sales return vouchers, credit notes, and refund disbursement records'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                icon={<X className="w-3.5 h-3.5" />}
                onClick={handleResetFilters}
                className="text-slate-600 hover:text-slate-900"
              >
                Clear Filters
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              icon={<RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />}
              onClick={handleRefresh}
              disabled={isRefreshing || isLoading}
            >
              Refresh
            </Button>
          </div>
        </div>

        {/* ---------------------------------------------------- */}
        {/* Controls Bar: Search, Date Preset, Payment Mode      */}
        {/* ---------------------------------------------------- */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[260px] max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search invoice, customer name or phone... (Ctrl+F)"
              className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-lg outline-none transition-colors"
            />
            {searchInput && (
              <button
                onClick={() => {
                  setSearchInput('');
                  setActiveSearch('');
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Controls Group */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Date Preset Selector */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <Calendar className="w-3.5 h-3.5 text-slate-500 ml-1.5" />
              <select
                value={datePreset}
                onChange={(e) => {
                  setDatePreset(e.target.value as DatePreset);
                  setPage(1);
                }}
                className="bg-transparent border-0 text-xs font-medium text-slate-700 pr-2 py-1 outline-none cursor-pointer"
              >
                <option value="all">All Dates</option>
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="last_7_days">Last 7 Days</option>
                <option value="this_month">This Month</option>
                <option value="custom">Custom Range...</option>
              </select>
            </div>

            {/* Custom Range Inputs (Shown when preset is 'custom') */}
            {datePreset === 'custom' && (
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-2 py-1 rounded-lg">
                <span className="text-[11px] text-slate-500 font-medium">From:</span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => {
                    setCustomStartDate(e.target.value);
                    setPage(1);
                  }}
                  className="text-xs text-slate-800 bg-transparent outline-none cursor-pointer"
                />
                <span className="text-[11px] text-slate-400">to</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => {
                    setCustomEndDate(e.target.value);
                    setPage(1);
                  }}
                  className="text-xs text-slate-800 bg-transparent outline-none cursor-pointer"
                />
              </div>
            )}

            {/* Payment Mode Selector */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500 ml-1.5" />
              <select
                value={paymentMode}
                onChange={(e) => {
                  setPaymentMode(e.target.value);
                  setPage(1);
                }}
                className="bg-transparent border-0 text-xs font-medium text-slate-700 pr-2 py-1 outline-none cursor-pointer"
              >
                <option value="ALL">All Payments</option>
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="CARD">Card</option>
                <option value="CREDIT">Credit</option>
              </select>
            </div>
          </div>
        </div>

        {/* Date Validation Alert */}
        {customDateError && (
          <div className="mt-2 text-xs text-rose-600 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-md flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{customDateError}</span>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------- */}
      {/* Table Container                                      */}
      {/* ---------------------------------------------------- */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'returns' ? (
          returnsLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin text-amber-600 mb-3" />
              <p className="text-xs font-semibold text-slate-600">Loading returns history from database...</p>
            </div>
          ) : returnsList.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center max-w-md mx-auto my-12 shadow-xs">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4">
                <RotateCcw className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-slate-800">No returns recorded yet</h3>
              <p className="text-xs text-slate-500 mt-1">
                Completed invoices can be partially or fully returned with automatic inventory restock and refund vouchers.
              </p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px] select-none">
                    <th className="py-3 px-4">Return #</th>
                    <th className="py-3 px-4">Orig. Invoice</th>
                    <th className="py-3 px-4">Date & Time</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Return Reason</th>
                    <th className="py-3 px-4 text-center">Items</th>
                    <th className="py-3 px-4 text-center">Disbursed Via</th>
                    <th className="py-3 px-4 text-right">Refund Amount</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {returnsList.map((ret) => {
                    const { date, time } = formatSaleDateTime(ret.created_at);
                    return (
                      <tr key={ret.id} className="hover:bg-amber-50/40 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-amber-900 whitespace-nowrap">
                          {ret.return_number}
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold text-indigo-700 whitespace-nowrap">
                          {ret.original_invoice_number}
                        </td>
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                          {date} <span className="text-slate-400 font-mono text-[10px]">{time}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-medium text-slate-900">
                            {ret.customer_name || 'Walk-in Customer'}
                          </span>
                          {ret.customer_phone && (
                            <span className="text-[10px] text-slate-500 block font-mono">
                              {ret.customer_phone}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-700 max-w-xs truncate" title={ret.reason}>
                          {ret.reason}
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-slate-700">
                          {ret.items_count}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {renderPaymentBadge(ret.refund_mode)}
                        </td>
                        <td className="py-3 px-4 text-right font-black text-emerald-700 font-mono text-sm whitespace-nowrap">
                          {formatCurrency(ret.refund_amount)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const fullReturn = await returnService.getReturnByNumber(ret.return_number);
                                setActiveReturnReceipt(fullReturn);
                              } catch (e) {
                                console.error(e);
                              }
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md transition-colors shadow-2xs cursor-pointer"
                            title="View return voucher and reprint"
                          >
                            <FileCheck2 className="w-3.5 h-3.5 text-amber-700" />
                            Voucher
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : errorMessage ? (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-8 text-center max-w-lg mx-auto my-8">
            <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
            <h3 className="text-base font-bold text-rose-900">Failed to Load Sales</h3>
            <p className="text-xs text-rose-700 mt-1">{errorMessage}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              className="mt-4 border-rose-300 text-rose-800 hover:bg-rose-100"
            >
              Try Again
            </Button>
          </div>
        ) : isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin text-indigo-600 mb-3" />
            <p className="text-xs font-semibold text-slate-600">Loading invoices from database...</p>
          </div>
        ) : sales.length === 0 ? (
          /* Empty States */
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center max-w-md mx-auto my-12 shadow-xs">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-4">
              <Receipt className="w-7 h-7" />
            </div>
            {hasActiveFilters ? (
              <>
                <h3 className="text-base font-bold text-slate-800">No matching sales found</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Try another invoice number, customer name or phone number.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetFilters}
                  className="mt-4"
                >
                  Clear Filters
                </Button>
              </>
            ) : (
              <>
                <h3 className="text-base font-bold text-slate-800">No sales yet</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Completed invoices will appear here once sales are finalized at the POS counter.
                </p>
                {onNavigate && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => onNavigate('billing')}
                    className="mt-4"
                  >
                    Go to Billing POS
                  </Button>
                )}
              </>
            )}
          </div>
        ) : (
          /* Data Table */
          <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px] select-none">
                  {/* Invoice No */}
                  <th
                    onClick={() => handleSort('invoice_number')}
                    className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors w-40"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Invoice No.</span>
                      {sortBy === 'invoice_number' ? (
                        sortDirection === 'asc' ? (
                          <ArrowUp className="w-3.5 h-3.5 text-indigo-600" />
                        ) : (
                          <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>

                  {/* Date & Time */}
                  <th
                    onClick={() => handleSort('created_at')}
                    className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors w-44"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Date & Time</span>
                      {sortBy === 'created_at' ? (
                        sortDirection === 'asc' ? (
                          <ArrowUp className="w-3.5 h-3.5 text-indigo-600" />
                        ) : (
                          <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>

                  {/* Customer */}
                  <th className="py-3 px-4">Customer</th>

                  {/* Phone */}
                  <th className="py-3 px-4 w-36">Phone</th>

                  {/* Items */}
                  <th className="py-3 px-3 text-center w-24">Items</th>

                  {/* Payment */}
                  <th className="py-3 px-4 text-center w-28">Payment</th>

                  {/* Total */}
                  <th
                    onClick={() => handleSort('total_amount')}
                    className="py-3 px-4 text-right cursor-pointer hover:bg-slate-100 transition-colors w-32"
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Total</span>
                      {sortBy === 'total_amount' ? (
                        sortDirection === 'asc' ? (
                          <ArrowUp className="w-3.5 h-3.5 text-indigo-600" />
                        ) : (
                          <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>

                  {/* Actions */}
                  <th className="py-3 px-4 text-right w-36">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sales.map((sale, index) => {
                  const { date: saleDate, time: saleTime } = formatSaleDateTime(sale.created_at);
                  const isHighlighted = index === highlightedRowIndex;

                  return (
                    <tr
                      key={sale.id}
                      onClick={() => setHighlightedRowIndex(index)}
                      onDoubleClick={() => handleOpenInvoice(sale.invoice_number)}
                      className={`transition-colors cursor-pointer ${
                        isHighlighted
                          ? 'bg-indigo-50/60 ring-1 ring-inset ring-indigo-300'
                          : 'hover:bg-slate-50/70'
                      }`}
                    >
                      {/* Invoice No. */}
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {sale.invoice_number}
                      </td>

                      {/* Date & Time */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800">{saleDate}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{saleTime}</div>
                      </td>

                      {/* Customer Name */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 truncate max-w-[200px]">
                          {sale.customer_name || 'Walk-in Customer'}
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {sale.customer_phone || '—'}
                      </td>

                      {/* Items Count */}
                      <td className="py-3 px-3 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700">
                          {sale.item_count} {sale.item_count === 1 ? 'item' : 'items'}
                        </span>
                      </td>

                      {/* Payment */}
                      <td className="py-3 px-4 text-center">
                        {renderPaymentBadge(sale.payment_mode)}
                      </td>

                      {/* Total */}
                      <td className="py-3 px-4 text-right font-black text-slate-900 font-mono text-sm">
                        {formatCurrency(sale.total_amount)}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenInvoice(sale.invoice_number);
                            }}
                            disabled={loadingInvoice}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-md transition-colors shadow-2xs cursor-pointer"
                            title="View completed invoice details"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-500" />
                            View
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenInvoice(sale.invoice_number);
                            }}
                            disabled={loadingInvoice}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md transition-colors shadow-2xs cursor-pointer"
                            title="Reprint invoice receipt"
                          >
                            <Printer className="w-3.5 h-3.5 text-indigo-600" />
                            Print
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setReturningSale({
                                id: sale.id,
                                invoiceNumber: sale.invoice_number,
                                customerName: sale.customer_name,
                                customerPhone: sale.customer_phone,
                              });
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md transition-colors shadow-2xs cursor-pointer"
                            title="Process return or refund for this invoice"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                            Return
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------- */}
      {/* Pagination Footer                                    */}
      {/* ---------------------------------------------------- */}
      {((activeTab === 'invoices' && !isLoading && totalCount > 0) ||
        (activeTab === 'returns' && !returnsLoading && returnsTotalCount > 0)) && (
        <div className="bg-white border-t border-slate-200 px-6 py-3 shrink-0 flex flex-wrap items-center justify-between gap-4 text-xs select-none">
          {/* Left: Summary and Page Size */}
          <div className="flex items-center gap-4 text-slate-600">
            <span>
              Showing{' '}
              <span className="font-bold text-slate-900">
                {((activeTab === 'returns' ? returnsPage : page) - 1) * pageSize + 1}
              </span>{' '}
              to{' '}
              <span className="font-bold text-slate-900">
                {Math.min(
                  (activeTab === 'returns' ? returnsPage : page) * pageSize,
                  activeTab === 'returns' ? returnsTotalCount : totalCount
                )}
              </span>{' '}
              of{' '}
              <span className="font-bold text-slate-900">
                {activeTab === 'returns' ? returnsTotalCount : totalCount}
              </span>{' '}
              {activeTab === 'returns' ? 'returns' : 'invoices'}
            </span>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">|</span>
              <span className="text-slate-500">Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  if (activeTab === 'returns') {
                    setReturnsPage(1);
                  } else {
                    setPage(1);
                  }
                }}
                className="bg-slate-50 border border-slate-200 rounded px-2 py-0.5 text-xs text-slate-800 outline-none cursor-pointer"
              >
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          {/* Right: Page Navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                if (activeTab === 'returns') {
                  setReturnsPage((p) => Math.max(1, p - 1));
                } else {
                  setPage((p) => Math.max(1, p - 1));
                }
              }}
              disabled={(activeTab === 'returns' ? returnsPage : page) <= 1}
              className="p-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Compact Page Number Display */}
            <div className="flex items-center px-2 py-1 font-medium text-slate-700">
              Page{' '}
              <span className="font-bold text-slate-900 mx-1">
                {activeTab === 'returns' ? returnsPage : page}
              </span>{' '}
              of{' '}
              <span className="font-bold text-slate-900 ml-1">
                {activeTab === 'returns' ? returnsTotalPages : totalPages}
              </span>
            </div>

            <button
              onClick={() => {
                if (activeTab === 'returns') {
                  setReturnsPage((p) => Math.min(returnsTotalPages, p + 1));
                } else {
                  setPage((p) => Math.min(totalPages, p + 1));
                }
              }}
              disabled={
                (activeTab === 'returns' ? returnsPage : page) >=
                (activeTab === 'returns' ? returnsTotalPages : totalPages)
              }
              className="p-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="Next Page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Return Modal */}
      {returningSale && (
        <ReturnModal
          saleId={returningSale.id}
          invoiceNumber={returningSale.invoiceNumber}
          customerName={returningSale.customerName}
          customerPhone={returningSale.customerPhone}
          onClose={() => setReturningSale(null)}
          onReturnCompleted={(result) => {
            setReturningSale(null);
            setActiveReturnReceipt(result);
            fetchSales();
            fetchReturns();
          }}
        />
      )}

      {/* Return Receipt Viewer */}
      {activeReturnReceipt && (
        <ReturnReceipt
          returnData={activeReturnReceipt}
          shopProfile={shopProfile}
          onClose={() => setActiveReturnReceipt(null)}
        />
      )}
    </div>
  );
};
