import React, { useEffect, useRef } from 'react';
import { Printer, X } from 'lucide-react';
import type { SalesReturnResult, ShopProfile } from '../../types';
import { formatCurrency, formatQuantity, formatSaleDateTime } from '../../services/billingService';

interface ReturnReceiptProps {
  returnData: SalesReturnResult;
  shopProfile?: ShopProfile | null;
  onClose: () => void;
}

export const ReturnReceipt: React.FC<ReturnReceiptProps> = ({
  returnData,
  shopProfile,
  onClose,
}) => {
  const receiptRef = useRef<HTMLDivElement>(null);
  const { return_record, items, original_invoice_number } = returnData;
  const { date, time } = formatSaleDateTime(return_record.created_at);

  const shopName = shopProfile?.shop_name?.trim() || 'GROCERY STORE';
  const shopAddress = shopProfile?.shop_address?.trim() || '';
  const shopPhone = shopProfile?.shop_phone?.trim() || '';
  const shopGstin = shopProfile?.shop_gstin?.trim() || '';

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white text-gray-900 rounded-2xl shadow-2xl max-w-md w-full border border-gray-200 overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Receipt Toolbar (Screen Only) */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-gray-900 text-white select-none print:hidden">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
            <span className="text-sm font-semibold tracking-wide">Return & Refund Receipt</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              type="button"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-lg text-xs font-medium transition cursor-pointer shadow-xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print (Ctrl+P)</span>
            </button>
            <button
              onClick={onClose}
              type="button"
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition cursor-pointer"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable 80mm Receipt Area */}
        <div className="p-6 overflow-y-auto print:p-0 print:m-0" id="return-receipt-area">
          <div
            ref={receiptRef}
            className="w-full font-mono text-[11px] leading-relaxed mx-auto max-w-[80mm] text-gray-800"
          >
            {/* Header */}
            <div className="text-center pb-3 border-b border-dashed border-gray-400">
              <h1 className="text-sm font-bold tracking-tight text-gray-950 uppercase">{shopName}</h1>
              {shopAddress && <p className="text-[10px] text-gray-600 mt-0.5">{shopAddress}</p>}
              {shopPhone && <p className="text-[10px] text-gray-600">Tel: {shopPhone}</p>}
              {shopGstin && <p className="text-[10px] text-gray-600">GSTIN: {shopGstin}</p>}

              <div className="mt-2 py-1 bg-amber-50 border border-amber-300 rounded text-center">
                <span className="text-[10px] font-bold text-amber-900 tracking-wider">
                  SALES RETURN & REFUND VOUCHER
                </span>
              </div>
            </div>

            {/* Return Meta */}
            <div className="py-2.5 border-b border-dashed border-gray-400 text-[10px] space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-600">Return No:</span>
                <span className="font-bold text-gray-900">{return_record.return_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Orig. Invoice:</span>
                <span className="font-semibold text-gray-800">{original_invoice_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Date & Time:</span>
                <span>
                  {date} {time}
                </span>
              </div>
              {return_record.customer_name && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Customer:</span>
                  <span className="font-medium text-gray-800">
                    {return_record.customer_name}
                    {return_record.customer_phone ? ` (${return_record.customer_phone})` : ''}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">Refund Mode:</span>
                <span className="font-bold text-emerald-800">{return_record.refund_mode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Reason:</span>
                <span className="text-gray-700 italic">{return_record.reason}</span>
              </div>
            </div>

            {/* Returned Items Table */}
            <div className="py-2.5 border-b border-dashed border-gray-400">
              <div className="grid grid-cols-12 text-[10px] font-bold text-gray-700 pb-1 border-b border-gray-200">
                <span className="col-span-6">Item</span>
                <span className="col-span-3 text-right">Qty Returned</span>
                <span className="col-span-3 text-right">Refund</span>
              </div>

              <div className="divide-y divide-gray-100">
                {items.map((item) => (
                  <div key={item.id} className="grid grid-cols-12 py-1.5 text-[10px] items-center">
                    <div className="col-span-6 pr-1">
                      <div className="font-medium text-gray-900 leading-tight">{item.product_name}</div>
                      <div className="text-[9px] text-gray-500">
                        {item.restock ? '✓ Restocked' : '✗ Damaged / No Restock'}
                      </div>
                    </div>
                    <div className="col-span-3 text-right font-medium text-gray-800">
                      {formatQuantity(item.return_quantity)} {item.unit}
                    </div>
                    <div className="col-span-3 text-right font-bold text-gray-950">
                      {formatCurrency(item.refund_amount)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Total Refund Summary */}
            <div className="py-3 border-b border-dashed border-gray-400 space-y-1 text-[11px]">
              <div className="flex justify-between items-center text-sm font-bold text-gray-950 pt-1">
                <span>TOTAL REFUND:</span>
                <span className="text-emerald-700 font-extrabold text-base">
                  {formatCurrency(return_record.refund_amount)}
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-3 text-center text-[9px] text-gray-500 space-y-0.5">
              <p>Amount has been disbursed to customer via {return_record.refund_mode}.</p>
              <p>Official Store Return Record</p>
            </div>
          </div>
        </div>

        {/* Footer Actions (Screen Only) */}
        <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3 print:hidden">
          <button
            onClick={onClose}
            type="button"
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl text-sm font-medium transition cursor-pointer"
          >
            Close
          </button>
          <button
            onClick={handlePrint}
            type="button"
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-medium transition cursor-pointer shadow-xs flex items-center gap-2"
          >
            <Printer className="w-4 h-4" />
            <span>Print Receipt</span>
          </button>
        </div>
      </div>
    </div>
  );
};
