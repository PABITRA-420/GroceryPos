import React, { useState, useEffect } from 'react';
import { Printer, CheckCircle, FileText, Smartphone, History, ArrowLeft, RotateCcw } from 'lucide-react';
import { Button } from '../ui/Button';
import {
  formatCurrency,
  formatSaleDateTime,
  formatQuantity,
} from '../../services/billingService';
import type { SaleResult, ShopProfile } from '../../types';

interface InvoiceReceiptProps {
  saleResult: SaleResult;
  shopProfile: ShopProfile;
  cashReceived?: number | null;
  changeAmount?: number | null;
  onNewBill?: () => void;
  mode?: 'completed' | 'reprint' | 'view';
  onClose?: () => void;
  backButtonLabel?: string;
  onInitiateReturn?: (saleResult: SaleResult) => void;
}

export const InvoiceReceipt: React.FC<InvoiceReceiptProps> = ({
  saleResult,
  shopProfile,
  cashReceived,
  changeAmount,
  onNewBill,
  mode = 'completed',
  onClose,
  backButtonLabel,
  onInitiateReturn,
}) => {
  const [printFormat, setPrintFormat] = useState<'thermal' | 'standard'>('thermal');
  const { sale, items } = saleResult;

  // Deterministically parse the stored historical sale created_at timestamp.
  // NEVER generates from current system time.
  const { date: saleDate, time: saleTime } = formatSaleDateTime(sale.created_at);

  // Historical customer snapshot from sale record
  const customerName = sale.customer_name?.trim() || 'Walk-in Customer';
  const customerPhone = sale.customer_phone?.trim() ? sale.customer_phone.trim() : '—';

  // Financial calculations & round-off
  const rawNetTotal = sale.subtotal - sale.discount_amount + sale.tax_amount;
  const roundOff = Math.round((sale.total_amount - rawNetTotal) * 100) / 100;

  const handlePrint = () => {
    window.print();
  };

  const handleBack = () => {
    if (onClose) {
      onClose();
    } else if (onNewBill) {
      onNewBill();
    }
  };

  // Keyboard navigation: Escape closes or returns
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const isReprint = mode === 'reprint' || mode === 'view';

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Top Banner & Print Controls (Hidden during print) */}
      <div
        className={`print:hidden flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border ${
          isReprint
            ? 'bg-slate-50 border-slate-200'
            : 'bg-emerald-50 border-emerald-200'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`p-2 text-white rounded-lg ${
              isReprint ? 'bg-indigo-600' : 'bg-emerald-600'
            }`}
          >
            {isReprint ? <History className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900">
                {isReprint ? `Invoice #${sale.invoice_number}` : 'Sale Completed Successfully'}
              </h3>
              {isReprint && (
                <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase rounded bg-indigo-100 text-indigo-800 border border-indigo-200">
                  Historical Record
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              {isReprint
                ? `Saved: ${saleDate} at ${saleTime} · Payment: ${sale.payment_mode} · Total: ${formatCurrency(sale.total_amount)}`
                : `Invoice #${sale.invoice_number} · Total: ${formatCurrency(sale.total_amount)}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Format Switcher */}
          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 text-xs">
            <button
              onClick={() => setPrintFormat('thermal')}
              className={`px-2.5 py-1.5 rounded-md flex items-center gap-1.5 font-medium transition-colors cursor-pointer ${
                printFormat === 'thermal'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              Thermal (80mm)
            </button>
            <button
              onClick={() => setPrintFormat('standard')}
              className={`px-2.5 py-1.5 rounded-md flex items-center gap-1.5 font-medium transition-colors cursor-pointer ${
                printFormat === 'standard'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Standard (A4)
            </button>
          </div>

          <Button
            variant="primary"
            size="md"
            icon={<Printer className="w-4 h-4" />}
            onClick={handlePrint}
          >
            {isReprint ? 'Reprint Invoice' : 'Print Receipt'}
          </Button>

          {onInitiateReturn && (
            <Button
              variant="outline"
              size="md"
              icon={<RotateCcw className="w-4 h-4 text-amber-600" />}
              onClick={() => onInitiateReturn(saleResult)}
              className="border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 font-semibold"
            >
              Return Items
            </Button>
          )}

          {(onClose || onNewBill) && (
            <Button
              variant="secondary"
              size="md"
              icon={isReprint ? <ArrowLeft className="w-4 h-4" /> : undefined}
              onClick={handleBack}
            >
              {backButtonLabel ? backButtonLabel : isReprint ? 'Back to Sales' : '+ New Bill'}
            </Button>
          )}
        </div>
      </div>

      {/* Invoice Scroll Container */}
      <div className="flex-1 overflow-y-auto p-4 flex justify-center bg-slate-100 rounded-xl border border-slate-200">
        {/* Printable Paper Canvas */}
        <div
          id="invoice-printable-area"
          className={`bg-white text-slate-900 shadow-sm border border-slate-200 p-6 print:p-0 print:border-0 print:shadow-none ${
            printFormat === 'thermal'
              ? 'w-[360px] text-xs font-mono'
              : 'w-full max-w-3xl text-sm font-sans'
          }`}
        >
          {/* ==================================================== */}
          {/* 1. SHOP BRANDING HEADER                              */}
          {/* ==================================================== */}
          <div className="text-center border-b border-dashed border-slate-300 pb-3 mb-3">
            <h1 className="text-lg font-black uppercase tracking-wider text-slate-900">
              {shopProfile.shop_name || 'APNA GROCERY STORE'}
            </h1>
            {shopProfile.owner_name && (
              <p className="text-[11px] text-slate-600 font-medium">
                Prop: {shopProfile.owner_name}
              </p>
            )}
            {shopProfile.shop_address && (
              <p className="text-[11px] text-slate-600 mt-0.5">
                {shopProfile.shop_address}
              </p>
            )}
            <div className="flex items-center justify-center gap-2 text-[11px] text-slate-600 mt-0.5">
              {shopProfile.shop_phone && <span>Ph: {shopProfile.shop_phone}</span>}
              {shopProfile.shop_gstin && <span>| GSTIN: {shopProfile.shop_gstin}</span>}
            </div>
            {shopProfile.shop_email && (
              <p className="text-[10px] text-slate-500 mt-0.5">{shopProfile.shop_email}</p>
            )}
          </div>

          {/* ==================================================== */}
          {/* 2. INVOICE NUMBER BAR                                */}
          {/* ==================================================== */}
          <div className="flex justify-between items-center mb-2 px-1">
            <span className="font-bold text-slate-700 text-xs">TAX INVOICE:</span>
            <span className="font-black text-slate-900 font-mono text-sm tracking-wide">
              {sale.invoice_number}
            </span>
          </div>

          {/* ==================================================== */}
          {/* 3. TWO-COLUMN CUSTOMER / DATE / TIME BOX             */}
          {/*    LEFT: Customer Name, Phone                        */}
          {/*    RIGHT: Sale Date, Sale Time                       */}
          {/* ==================================================== */}
          <div className="border border-slate-300 rounded p-2.5 mb-4 text-[11px] grid grid-cols-2 gap-x-4 gap-y-1 bg-slate-50/50 print:bg-transparent">
            {/* LEFT COLUMN: Customer info */}
            <div className="flex flex-col space-y-1">
              <div className="flex">
                <span className="font-semibold text-slate-700 w-18 shrink-0">Customer:</span>
                <span className="font-bold text-slate-900 truncate">{customerName}</span>
              </div>
              <div className="flex">
                <span className="font-semibold text-slate-700 w-18 shrink-0">Phone:</span>
                <span className="font-medium text-slate-800">{customerPhone}</span>
              </div>
            </div>

            {/* RIGHT COLUMN: Sale Date & Time */}
            <div className="flex flex-col space-y-1">
              <div className="flex justify-end">
                <span className="font-semibold text-slate-700 w-12 shrink-0 text-right mr-2">Date:</span>
                <span className="font-bold text-slate-900">{saleDate}</span>
              </div>
              <div className="flex justify-end">
                <span className="font-semibold text-slate-700 w-12 shrink-0 text-right mr-2">Time:</span>
                <span className="font-medium text-slate-800">{saleTime}</span>
              </div>
            </div>
          </div>

          {/* ==================================================== */}
          {/* 4. INVOICE ITEM TABLE                                */}
          {/* ==================================================== */}
          {printFormat === 'standard' ? (
            // Full structured table for Standard A4
            <table className="w-full text-left text-xs border border-slate-200 mb-4">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-2 px-2 text-center w-8">#</th>
                  <th className="py-2 px-3">Product Description</th>
                  <th className="py-2 px-2 text-center">Qty</th>
                  <th className="py-2 px-2 text-center">Unit</th>
                  <th className="py-2 px-2 text-right">Rate</th>
                  <th className="py-2 px-2 text-right">MRP</th>
                  <th className="py-2 px-2 text-center">GST</th>
                  <th className="py-2 px-2 text-right">Tax</th>
                  <th className="py-2 px-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="py-2 px-2 text-center text-slate-500 font-mono">
                      {idx + 1}
                    </td>
                    <td className="py-2 px-3">
                      <div className="font-bold text-slate-900">{item.product_name}</div>
                      {item.barcode && (
                        <div className="text-[10px] text-slate-500 font-mono">{item.barcode}</div>
                      )}
                    </td>
                    <td className="py-2 px-2 text-center font-bold text-slate-800 whitespace-nowrap">
                      {formatQuantity(item.quantity)}
                    </td>
                    <td className="py-2 px-2 text-center text-slate-600 whitespace-nowrap">
                      {item.unit}
                    </td>
                    <td className="py-2 px-2 text-right font-medium whitespace-nowrap">
                      ₹{item.unit_price.toFixed(2)}
                    </td>
                    <td className="py-2 px-2 text-right text-slate-500 whitespace-nowrap">
                      ₹{item.mrp.toFixed(2)}
                    </td>
                    <td className="py-2 px-2 text-center text-slate-600 whitespace-nowrap">
                      {item.gst_rate > 0 ? `${item.gst_rate}%` : '0%'}
                    </td>
                    <td className="py-2 px-2 text-right text-slate-600 whitespace-nowrap">
                      ₹{item.tax_amount.toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-slate-900 whitespace-nowrap">
                      ₹{item.total_price.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            // Compact table optimized for 80mm thermal paper
            <div className="mb-3">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] uppercase font-bold tracking-wider text-slate-700">
                    <th className="py-1">Item</th>
                    <th className="py-1 text-center">Qty</th>
                    <th className="py-1 text-right">Rate</th>
                    <th className="py-1 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px]">
                  {items.map((item, idx) => (
                    <tr key={idx} className="py-1">
                      <td className="py-1.5 pr-2 font-medium text-slate-800">
                        <div>{item.product_name}</div>
                        <div className="text-[9px] text-slate-500 font-normal">
                          MRP: ₹{item.mrp.toFixed(2)}
                          {item.gst_rate > 0 && ` · GST ${item.gst_rate}% (₹${item.tax_amount.toFixed(2)})`}
                        </div>
                      </td>
                      <td className="py-1.5 text-center whitespace-nowrap font-bold">
                        {formatQuantity(item.quantity)} {item.unit}
                      </td>
                      <td className="py-1.5 text-right whitespace-nowrap">
                        ₹{item.unit_price.toFixed(2)}
                      </td>
                      <td className="py-1.5 text-right font-bold whitespace-nowrap">
                        ₹{item.total_price.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ==================================================== */}
          {/* 5. BILL TOTALS SUMMARY                               */}
          {/* ==================================================== */}
          <div className="border-t border-dashed border-slate-300 pt-2 space-y-1 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal:</span>
              <span className="font-medium text-slate-900">₹{sale.subtotal.toFixed(2)}</span>
            </div>
            {sale.discount_amount > 0 && (
              <div className="flex justify-between text-emerald-700 font-medium">
                <span>Discount:</span>
                <span>-₹{sale.discount_amount.toFixed(2)}</span>
              </div>
            )}
            {sale.tax_amount > 0 && (
              <>
                <div className="flex justify-between text-slate-600">
                  <span>Total GST:</span>
                  <span className="font-medium text-slate-900">₹{sale.tax_amount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-500 pl-2">
                  <span>↳ CGST (50%):</span>
                  <span>₹{(sale.tax_amount / 2).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-500 pl-2">
                  <span>↳ SGST (50%):</span>
                  <span>₹{(sale.tax_amount / 2).toFixed(2)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between text-slate-600">
              <span>Round Off:</span>
              <span className="font-mono text-slate-900">
                {roundOff > 0 ? `+₹${roundOff.toFixed(2)}` : roundOff < 0 ? `-₹${Math.abs(roundOff).toFixed(2)}` : '₹0.00'}
              </span>
            </div>
            <div className="border-t-2 border-slate-900 pt-1.5 mt-1 flex justify-between items-center text-sm font-black text-slate-900">
              <span>GRAND TOTAL:</span>
              <span className="text-base font-black text-slate-900">
                {formatCurrency(sale.total_amount)}
              </span>
            </div>
          </div>

          {/* ==================================================== */}
          {/* 6. PAYMENT INFORMATION                               */}
          {/* ==================================================== */}
          <div className="border-t border-dashed border-slate-300 mt-3 pt-2 text-[11px] text-slate-600">
            <div className="flex justify-between">
              <span className="font-semibold text-slate-700">Payment:</span>
              <span className="font-bold text-slate-900">{sale.payment_mode}</span>
            </div>
            {sale.payment_mode === 'CASH' && cashReceived !== undefined && cashReceived !== null && (
              <>
                <div className="flex justify-between mt-0.5">
                  <span>Received:</span>
                  <span className="font-medium text-slate-900">₹{cashReceived.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-900 mt-0.5">
                  <span>Change:</span>
                  <span>₹{(changeAmount ?? 0).toFixed(2)}</span>
                </div>
              </>
            )}
            {sale.notes && (
              <div className="mt-1 text-[10px] text-slate-500 italic">
                Ref / Note: {sale.notes}
              </div>
            )}
          </div>

          {/* ==================================================== */}
          {/* 7. FOOTER MESSAGE                                    */}
          {/* ==================================================== */}
          <div className="border-t border-dashed border-slate-300 mt-4 pt-3 text-center text-[10px] text-slate-500">
            <p className="font-semibold text-slate-700">
              {shopProfile.invoice_footer || 'Thank you for shopping with us! Please visit again.'}
            </p>
            <p className="text-[9px] text-slate-400 mt-1">
              Powered by Grocery POS Desktop (Offline Engine)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
