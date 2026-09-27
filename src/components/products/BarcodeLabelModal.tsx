import React, { useState, useMemo } from 'react';
import { Printer } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { generateBarcodeSvg } from '../../utils/barcode128';
import { formatCurrency } from '../../services/billingService';
import type { Product, ShopProfile } from '../../types';

interface BarcodeLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  shopProfile: ShopProfile;
}

const WEIGHT_PRESETS = [
  { label: '100g', factor: 0.1 },
  { label: '200g', factor: 0.2 },
  { label: '250g', factor: 0.25 },
  { label: '500g', factor: 0.5 },
  { label: '1kg', factor: 1.0 },
  { label: '2kg', factor: 2.0 },
  { label: '5kg', factor: 5.0 },
];

export const BarcodeLabelModal: React.FC<BarcodeLabelModalProps> = ({
  isOpen,
  onClose,
  product,
  shopProfile,
}) => {
  const [selectedWeight, setSelectedWeight] = useState('500g');
  const [mrp, setMrp] = useState<number>(0);
  const [sellingPrice, setSellingPrice] = useState<number>(0);
  const [barcode, setBarcode] = useState<string>('');
  const [packedDate, setPackedDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [bestBefore, setBestBefore] = useState<string>('6 Months from pkd');
  const [batchNo, setBatchNo] = useState<string>(() => {
    const d = new Date();
    return `B-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  });
  const [printQuantity, setPrintQuantity] = useState<number>(10);
  const [labelSize, setLabelSize] = useState<'50x25' | '50x38' | 'a4_sheet'>('50x25');

  // Synchronize when product opens
  React.useEffect(() => {
    if (product) {
      const isKg = product.unit.toUpperCase() === 'KG';
      const defaultFactor = isKg ? 0.5 : 1.0;
      setSelectedWeight(isKg ? '500g' : `1 ${product.unit}`);
      setSellingPrice(Math.round(product.selling_price * defaultFactor));
      setMrp(Math.round((product.mrp || product.selling_price) * defaultFactor));
      setBarcode(product.barcode || `SKU-${product.id}`);
    }
  }, [product]);

  const handleApplyPreset = (preset: { label: string; factor: number }) => {
    setSelectedWeight(preset.label);
    if (product) {
      setSellingPrice(Math.round(product.selling_price * preset.factor));
      setMrp(Math.round((product.mrp || product.selling_price) * preset.factor));
    }
  };

  const discountSavings = Math.max(0, mrp - sellingPrice);

  const barcodeSvg = useMemo(() => {
    return generateBarcodeSvg(barcode || '00000000', { width: 220, height: 42 });
  }, [barcode]);

  const handlePrint = () => {
    window.print();
  };

  if (!product) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Print Barcode Labels (Repackaged & Loose Goods)"
      maxWidth="xl"
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          {/* Controls Column */}
          <div className="md:col-span-7 space-y-4 text-xs">
            {/* Product Header Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-800 text-sm">{product.name}</h4>
                <div className="text-[11px] text-slate-500">
                  Category: {product.category} · Unit: {product.unit} · Base Rate: {formatCurrency(product.selling_price)}/{product.unit}
                </div>
              </div>
              <span className="text-[11px] font-mono bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-600">
                {product.barcode || 'No Barcode'}
              </span>
            </div>

            {/* Repack Weight Presets */}
            <div>
              <label className="block font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                <span>Select Packaging Weight</span>
                <span className="text-[11px] text-slate-400 font-normal">Auto-adjusts proportional price</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {WEIGHT_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => handleApplyPreset(p)}
                    className={`px-3 py-1.5 rounded-lg font-bold text-xs cursor-pointer transition ${
                      selectedWeight === p.label
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Price & MRP Controls */}
            <div className="grid grid-cols-2 gap-3 bg-white p-3 border border-slate-200 rounded-xl">
              <div>
                <label className="block font-semibold text-slate-600 mb-1">
                  MRP (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={mrp}
                  onChange={(e) => setMrp(parseFloat(e.target.value) || 0)}
                  className="w-full text-xs font-bold px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">
                  Store Selling Price (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(parseFloat(e.target.value) || 0)}
                  className="w-full text-xs font-bold px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 text-emerald-700"
                />
              </div>
            </div>

            {/* Batch & Dates */}
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Packed Date</label>
                <input
                  type="date"
                  value={packedDate}
                  onChange={(e) => setPackedDate(e.target.value)}
                  className="w-full text-[11px] px-2 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Best Before</label>
                <input
                  type="text"
                  value={bestBefore}
                  onChange={(e) => setBestBefore(e.target.value)}
                  className="w-full text-[11px] px-2 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Batch / Lot #</label>
                <input
                  type="text"
                  value={batchNo}
                  onChange={(e) => setBatchNo(e.target.value)}
                  className="w-full text-[11px] font-mono px-2 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Print Quantity & Label Size */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Labels to Print</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={printQuantity}
                    onChange={(e) => setPrintQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-20 text-xs font-bold text-center px-2 py-1.5 bg-white border border-slate-300 rounded-lg"
                  />
                  <div className="flex gap-1">
                    {[10, 20, 50].map((qty) => (
                      <button
                        key={qty}
                        type="button"
                        onClick={() => setPrintQuantity(qty)}
                        className="px-2 py-1 text-[11px] rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
                      >
                        +{qty}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-600 mb-1">Sticker Format</label>
                <select
                  value={labelSize}
                  onChange={(e) => setLabelSize(e.target.value as any)}
                  className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="50x25">Thermal 50mm x 25mm (Standard Roll)</option>
                  <option value="50x38">Thermal 50mm x 38mm (Expanded)</option>
                  <option value="a4_sheet">A4 Sticker Sheet (24-up Grid)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Sticker Preview Column */}
          <div className="md:col-span-5 bg-slate-100 border border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center space-y-3">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Real-Size Sticker Preview
            </span>

            {/* Sticker Preview Container */}
            <div
              className="bg-white border-2 border-slate-800 rounded-lg p-2.5 shadow-md flex flex-col justify-between text-slate-900 select-none"
              style={{
                width: '210px',
                minHeight: labelSize === '50x38' ? '145px' : '110px',
              }}
            >
              {/* Store Header */}
              <div className="text-center border-b border-dashed border-slate-300 pb-1">
                <div className="font-extrabold text-[11px] uppercase tracking-wide truncate">
                  {shopProfile.shop_name || 'APNA GROCERY STORE'}
                </div>
              </div>

              {/* Product Name & Net Qty */}
              <div className="py-1">
                <div className="font-black text-xs leading-tight line-clamp-1">
                  {product.name}
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-600 font-semibold pt-0.5">
                  <span>Net Qty: <strong>{selectedWeight}</strong></span>
                  <span className="font-mono text-[9px] text-slate-500">{batchNo}</span>
                </div>
              </div>

              {/* Barcode SVG */}
              <div className="py-0.5 text-center">
                <div
                  className="w-full h-8 flex items-center justify-center overflow-hidden"
                  dangerouslySetInnerHTML={{ __html: barcodeSvg }}
                />
                <div className="font-mono text-[9px] tracking-wider text-slate-700">
                  {barcode}
                </div>
              </div>

              {/* Pricing Footer */}
              <div className="border-t border-dashed border-slate-300 pt-1 flex items-center justify-between">
                <div>
                  {discountSavings > 0 && (
                    <div className="text-[9px] text-slate-500 line-through">
                      MRP: {formatCurrency(mrp)}
                    </div>
                  )}
                  <div className="font-black text-xs text-slate-900">
                    OUR: {formatCurrency(sellingPrice)}
                  </div>
                </div>

                {discountSavings > 0 && (
                  <span className="text-[9px] font-black bg-emerald-600 text-white px-1.5 py-0.5 rounded">
                    SAVE ₹{discountSavings.toFixed(0)}
                  </span>
                )}
              </div>

              <div className="text-[8px] text-slate-400 text-center pt-0.5">
                Pkd: {packedDate} · {bestBefore}
              </div>
            </div>

            <p className="text-[11px] text-slate-500 text-center">
              Ready to print <strong>{printQuantity} copy(ies)</strong> on thermal barcode printer.
            </p>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
          <Button variant="secondary" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            icon={<Printer className="w-4 h-4" />}
            onClick={handlePrint}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-5"
          >
            Print {printQuantity} Sticker(s)
          </Button>
        </div>
      </div>

      {/* Hidden Print Container specifically targeted by CSS @media print */}
      <div className="hidden print:block print:fixed print:inset-0 print:bg-white print:z-99999">
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            body * {
              visibility: hidden;
            }
            .barcode-printable-area, .barcode-printable-area * {
              visibility: visible;
            }
            .barcode-printable-area {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              margin: 0;
              padding: 0;
            }
            @page {
              size: ${labelSize === '50x38' ? '50mm 38mm' : '50mm 25mm'};
              margin: 0;
            }
            .sticker-page-item {
              page-break-after: always;
              width: 48mm;
              height: ${labelSize === '50x38' ? '36mm' : '23mm'};
              padding: 1.5mm;
              box-sizing: border-box;
              font-family: system-ui, sans-serif;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              overflow: hidden;
            }
          }
        `}} />

        <div className="barcode-printable-area">
          {Array.from({ length: printQuantity }).map((_, idx) => (
            <div key={idx} className="sticker-page-item">
              <div style={{ textAlign: 'center', fontSize: '8pt', fontWeight: 'bold', textTransform: 'uppercase', borderBottom: '0.5pt dashed #000' }}>
                {shopProfile.shop_name || 'APNA GROCERY STORE'}
              </div>

              <div style={{ fontSize: '9pt', fontWeight: 'bold', lineHeight: 1.1 }}>
                {product.name}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '7.5pt' }}>
                <span>Net: <strong>{selectedWeight}</strong></span>
                <span style={{ fontFamily: 'monospace' }}>{batchNo}</span>
              </div>

              <div style={{ textAlign: 'center', margin: '0.5mm 0' }}>
                <div
                  style={{ width: '100%', height: '7mm', overflow: 'hidden' }}
                  dangerouslySetInnerHTML={{ __html: barcodeSvg }}
                />
                <div style={{ fontFamily: 'monospace', fontSize: '7pt' }}>{barcode}</div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '0.5pt dashed #000', paddingTop: '0.5mm' }}>
                <div>
                  {discountSavings > 0 && (
                    <div style={{ fontSize: '6.5pt', textDecoration: 'line-through' }}>
                      MRP: {formatCurrency(mrp)}
                    </div>
                  )}
                  <div style={{ fontSize: '9pt', fontWeight: 'bold' }}>
                    OUR: {formatCurrency(sellingPrice)}
                  </div>
                </div>

                {discountSavings > 0 && (
                  <div style={{ fontSize: '7pt', fontWeight: 'bold', border: '1pt solid #000', padding: '0.5mm 1mm' }}>
                    SAVE ₹{discountSavings.toFixed(0)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
};
