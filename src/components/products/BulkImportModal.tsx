import React, { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, Download, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { productService } from '../../services/productService';
import type { BulkImportProductInput, BulkImportSummary } from '../../types';

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (summary: BulkImportSummary) => void;
}

interface ParsedRowResult {
  valid: BulkImportProductInput[];
  errors: { row: number; reason: string }[];
}

export const BulkImportModal: React.FC<BulkImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<BulkImportProductInput[]>([]);
  const [rowErrors, setRowErrors] = useState<{ row: number; reason: string }[]>([]);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setFile(null);
    setParsedRows([]);
    setRowErrors([]);
    setErrorMessage(null);
    setIsProcessing(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    if (isProcessing) return;
    resetState();
    onClose();
  };

  const handleDownloadTemplate = () => {
    const csvContent = productService.generateSampleCsvTemplate();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'grocery_product_import_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const parseCsvText = (text: string): ParsedRowResult => {
    const lines = text
      .split(/\r\n|\n|\r/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length <= 1) {
      return { valid: [], errors: [{ row: 0, reason: 'CSV file is empty or only contains headers' }] };
    }

    // Split headers
    const rawHeaders = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));

    // Map header names to column index
    const colMap: Record<string, number> = {};
    rawHeaders.forEach((h, idx) => {
      if (h.includes('barcode')) colMap.barcode = idx;
      else if (h.includes('productname') || h.includes('name') || h.includes('item')) colMap.name = idx;
      else if (h.includes('category')) colMap.category = idx;
      else if (h.includes('unit')) colMap.unit = idx;
      else if (h.includes('purchase') || h.includes('cost')) colMap.purchase_price = idx;
      else if (h.includes('selling') || h.includes('sell') || h.includes('price')) colMap.selling_price = idx;
      else if (h.includes('mrp')) colMap.mrp = idx;
      else if (h.includes('gst') || h.includes('tax')) colMap.gst_rate = idx;
      else if (h.includes('min') || h.includes('threshold')) colMap.minimum_stock = idx;
      else if (h.includes('stock') || h.includes('qty')) colMap.stock = idx;
      else if (h.includes('hsn')) colMap.hsn_code = idx;
    });

    if (colMap.name === undefined || colMap.selling_price === undefined) {
      return {
        valid: [],
        errors: [{ row: 1, reason: 'Header must contain at least "Product Name" and "Selling Price" columns' }],
      };
    }

    const valid: BulkImportProductInput[] = [];
    const errors: { row: number; reason: string }[] = [];

    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      const rowNum = i + 1;
      const line = lines[i];

      // Handle simple CSV commas (simple split, respecting quotes)
      const values: string[] = [];
      let inQuote = false;
      let curVal = '';
      for (let c = 0; c < line.length; c++) {
        const char = line[c];
        if (char === '"') {
          inQuote = !inQuote;
        } else if (char === ',' && !inQuote) {
          values.push(curVal.trim());
          curVal = '';
        } else {
          curVal += char;
        }
      }
      values.push(curVal.trim());

      const getVal = (idx?: number) => (idx !== undefined && values[idx] ? values[idx].replace(/^"|"$/g, '').trim() : '');

      const name = getVal(colMap.name);
      if (!name) {
        errors.push({ row: rowNum, reason: 'Product name cannot be blank' });
        continue;
      }

      const sellPriceRaw = parseFloat(getVal(colMap.selling_price));
      if (isNaN(sellPriceRaw) || sellPriceRaw < 0) {
        errors.push({ row: rowNum, reason: `Invalid selling price: "${getVal(colMap.selling_price)}"` });
        continue;
      }

      const mrpRaw = colMap.mrp !== undefined && getVal(colMap.mrp) ? parseFloat(getVal(colMap.mrp)) : sellPriceRaw;
      if (!isNaN(mrpRaw) && mrpRaw > 0 && sellPriceRaw > mrpRaw) {
        errors.push({
          row: rowNum,
          reason: `Selling price (₹${sellPriceRaw.toFixed(2)}) exceeds MRP (₹${mrpRaw.toFixed(2)})`,
        });
        continue;
      }

      const purchasePriceRaw = colMap.purchase_price !== undefined && getVal(colMap.purchase_price)
        ? parseFloat(getVal(colMap.purchase_price))
        : 0;

      const gstRateRaw = colMap.gst_rate !== undefined && getVal(colMap.gst_rate)
        ? parseFloat(getVal(colMap.gst_rate))
        : 0;

      const stockRaw = colMap.stock !== undefined && getVal(colMap.stock)
        ? parseFloat(getVal(colMap.stock))
        : 0;

      const minStockRaw = colMap.minimum_stock !== undefined && getVal(colMap.minimum_stock)
        ? parseFloat(getVal(colMap.minimum_stock))
        : 5;

      valid.push({
        name,
        barcode: getVal(colMap.barcode) || null,
        category: getVal(colMap.category) || 'General',
        unit: getVal(colMap.unit) || 'Kg',
        purchase_price: isNaN(purchasePriceRaw) ? 0 : Math.max(0, purchasePriceRaw),
        selling_price: sellPriceRaw,
        mrp: isNaN(mrpRaw) ? sellPriceRaw : mrpRaw,
        gst_rate: isNaN(gstRateRaw) ? 0 : Math.min(100, Math.max(0, gstRateRaw)),
        stock: isNaN(stockRaw) ? 0 : Math.max(0, stockRaw),
        minimum_stock: isNaN(minStockRaw) ? 5 : Math.max(0, minStockRaw),
        hsn_code: getVal(colMap.hsn_code) || null,
      });
    }

    return { valid, errors };
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    setErrorMessage(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const res = parseCsvText(text);
        setParsedRows(res.valid);
        setRowErrors(res.errors);
      } catch (err) {
        setErrorMessage('Failed to read or parse CSV file: ' + String(err));
      }
    };
    reader.onerror = () => setErrorMessage('Error reading file from disk.');
    reader.readAsText(selected);
  };

  const handleExecuteImport = async () => {
    if (parsedRows.length === 0) {
      setErrorMessage('No valid rows found in the selected file to import.');
      return;
    }

    try {
      setIsProcessing(true);
      setErrorMessage(null);

      const summary = await productService.bulkImportProducts(parsedRows, {
        update_existing_barcodes: updateExisting,
      });

      onSuccess(summary);
      handleClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Bulk Import Products from CSV"
      maxWidth="lg"
    >
      <div className="space-y-4">
        {/* Top actions & Template banner */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="w-5 h-5 text-emerald-700 shrink-0" />
            <div>
              <div className="font-bold text-emerald-900">Standard Indian Grocery Template Available</div>
              <p className="text-emerald-700">Download our sample template with pre-configured GST, HSN & Units.</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            icon={<Download className="w-3.5 h-3.5" />}
            onClick={handleDownloadTemplate}
            className="border-emerald-300 text-emerald-800 hover:bg-emerald-100"
          >
            Download Template
          </Button>
        </div>

        {/* File Picker / Drop Zone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-xl p-6 text-center cursor-pointer transition-colors bg-slate-50 hover:bg-slate-100/60"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="hidden"
          />
          <Upload className="w-8 h-8 mx-auto text-slate-400 mb-2" />
          <p className="text-sm font-bold text-slate-800">
            {file ? file.name : 'Click to select CSV File (or drag and drop)'}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Supports .CSV format with Barcode, Name, Unit, Selling Price, MRP, GST Rate, Stock
          </p>
        </div>

        {/* Options */}
        <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2">
          <label className="flex items-center gap-2.5 text-xs text-slate-800 font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={updateExisting}
              onChange={(e) => setUpdateExisting(e.target.checked)}
              className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
            />
            <span>
              <strong>Update Existing Barcodes:</strong> If a product barcode already exists in the catalog, increment its stock and update its prices. (If unchecked, existing barcodes will be skipped).
            </span>
          </label>
        </div>

        {/* Validation Summary */}
        {(parsedRows.length > 0 || rowErrors.length > 0) && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <div>
                  <div className="font-bold text-emerald-900 text-sm">{parsedRows.length} Valid Products</div>
                  <div className="text-emerald-700">Ready to be committed to catalog</div>
                </div>
              </div>

              <div className={`rounded-lg p-3 flex items-center gap-2.5 border ${
                rowErrors.length > 0
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}>
                <AlertCircle className={`w-5 h-5 ${rowErrors.length > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
                <div>
                  <div className="font-bold text-sm">{rowErrors.length} Invalid Rows</div>
                  <div className="text-xs">{rowErrors.length > 0 ? 'Will be skipped during import' : 'Zero errors detected'}</div>
                </div>
              </div>
            </div>

            {/* Error detail drawer */}
            {rowErrors.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 max-h-36 overflow-y-auto text-xs space-y-1">
                <div className="font-bold text-amber-900 mb-1">Rows with Validation Errors:</div>
                {rowErrors.map((err, idx) => (
                  <div key={idx} className="text-amber-800">
                    • <strong>Row {err.row}:</strong> {err.reason}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {errorMessage && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <Button variant="secondary" size="md" onClick={handleClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            icon={isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            onClick={handleExecuteImport}
            disabled={isProcessing || parsedRows.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {isProcessing ? 'Importing...' : `Import ${parsedRows.length} Product${parsedRows.length > 1 ? 's' : ''}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
