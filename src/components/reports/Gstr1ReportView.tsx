import React, { useState } from 'react';
import { FileSpreadsheet, Download, Building2, ShoppingCart, Layers, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { formatCurrency } from '../../services/billingService';
import type { Gstr1ReportResult } from '../../types';

interface Gstr1ReportViewProps {
  data: Gstr1ReportResult | null;
  isLoading: boolean;
  onRefresh: () => void;
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const Gstr1ReportView: React.FC<Gstr1ReportViewProps> = ({
  data,
  isLoading,
  onRefresh,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'b2b' | 'b2c' | 'hsn'>('b2b');

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin text-purple-600 mb-2" />
        <p className="text-sm font-semibold">Generating GSTR-1 Compliant Return...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20 text-slate-400">
        <FileSpreadsheet className="w-12 h-12 mx-auto mb-2 opacity-40" />
        <p className="font-semibold text-sm">No sales records found for this period</p>
      </div>
    );
  }

  const totalGstLiability = data.total_b2b_tax + data.total_b2c_tax;

  const handleExportCsv = () => {
    const lines: string[] = [];

    // Header
    lines.push(`GSTR-1 OUTWARD SUPPLIES RETURN - APNA GROCERY STORE`);
    lines.push(`Merchant GSTIN,${data.shop_gstin || 'UNREGISTERED / COMPOSITION'}`);
    lines.push(`Legal Name,${data.shop_name}`);
    lines.push(`Filing Period,${data.period_label}`);
    lines.push(`Generated Date,${new Date().toLocaleString('en-IN')}`);
    lines.push('');

    // Table 4: B2B
    lines.push(`[ TABLE 4: B2B INVOICES - TAXABLE OUTWARD SUPPLIES TO REGISTERED PERSONS ]`);
    lines.push(`GSTIN of Receiver,Receiver Name,Invoice No,Invoice Date,Invoice Value (Rs),Place Of Supply,Reverse Charge,Rate (%),Taxable Value (Rs),Central Tax (Rs),State Tax (Rs)`);
    for (const item of data.b2b_table4) {
      lines.push([
        `"${item.gstin}"`,
        `"${item.customer_name}"`,
        `"${item.invoice_number}"`,
        item.invoice_date,
        item.invoice_value.toFixed(2),
        `"${item.place_of_supply}"`,
        item.reverse_charge,
        item.applicable_tax_rate,
        item.taxable_value.toFixed(2),
        item.central_tax.toFixed(2),
        item.state_tax.toFixed(2),
      ].join(','));
    }
    lines.push('');

    // Table 7: B2C Small
    lines.push(`[ TABLE 7: B2C (SMALL) DETAILS - SUPPLIES TO UNREGISTERED CONSUMERS ]`);
    lines.push(`Rate (%),Taxable Value (Rs),Central Tax (Rs),State Tax (Rs),Total Invoices,Gross Total (Rs)`);
    for (const item of data.b2c_table7) {
      lines.push([
        `${item.tax_rate}%`,
        item.taxable_value.toFixed(2),
        item.central_tax.toFixed(2),
        item.state_tax.toFixed(2),
        item.invoice_count,
        item.total_value.toFixed(2),
      ].join(','));
    }
    lines.push('');

    // Table 12: HSN Summary
    lines.push(`[ TABLE 12: HSN-WISE SUMMARY OF OUTWARD SUPPLIES ]`);
    lines.push(`HSN Code,Description,UQC (Unit),Total Quantity,Total Value (Rs),Taxable Value (Rs),Central Tax (Rs),State Tax (Rs)`);
    for (const item of data.hsn_table12) {
      lines.push([
        `"${item.hsn_code}"`,
        `"${item.description}"`,
        `"${item.uqc}"`,
        item.total_quantity.toFixed(2),
        item.total_value.toFixed(2),
        item.taxable_value.toFixed(2),
        item.central_tax.toFixed(2),
        item.state_tax.toFixed(2),
      ].join(','));
    }

    const filename = `GSTR1_${data.period_label.replace(/\s+/g, '_')}_${Date.now()}.csv`;
    downloadFile(lines.join('\n'), filename, 'text/csv;charset=utf-8;');
  };

  const handleExportJson = () => {
    const jsonPayload = {
      gstin: data.shop_gstin || '00AAAAA0000A1Z5',
      fp: new Date().toISOString().slice(5, 7) + new Date().getFullYear(),
      version: 'GSTR1_V2.0',
      hash: 'hash-local',
      b2b: data.b2b_table4.map(b => ({
        ctin: b.gstin,
        inv: [{
          inum: b.invoice_number,
          idt: b.invoice_date,
          val: b.invoice_value,
          pos: '00',
          rchrg: b.reverse_charge,
          inv_typ: 'R',
          itms: [{
            num: 1,
            itm_det: {
              rt: b.applicable_tax_rate,
              txval: b.taxable_value,
              camt: b.central_tax,
              samt: b.state_tax,
              csamt: 0.0,
            }
          }]
        }]
      })),
      b2cs: data.b2c_table7.map(c => ({
        sply_ty: 'INTRA',
        rt: c.tax_rate,
        typ: 'OE',
        pos: '00',
        txval: c.taxable_value,
        camt: c.central_tax,
        samt: c.state_tax,
        csamt: 0.0,
      })),
      hsn: {
        data: data.hsn_table12.map((h, idx) => ({
          num: idx + 1,
          hsn_sc: h.hsn_code,
          desc: h.description,
          uqc: h.uqc,
          qty: h.total_quantity,
          val: h.total_value,
          txval: h.taxable_value,
          camt: h.central_tax,
          samt: h.state_tax,
          csamt: 0.0,
        }))
      }
    };

    const filename = `GSTR1_OFFLINE_${Date.now()}.json`;
    downloadFile(JSON.stringify(jsonPayload, null, 2), filename, 'application/json;charset=utf-8;');
  };

  return (
    <div className="space-y-5 p-6">
      {/* Return Header & Summary KPI Strip */}
      <div className="bg-gradient-to-r from-purple-900 to-indigo-900 text-white rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs bg-purple-800/80 px-2.5 py-0.5 rounded-full border border-purple-700/50 uppercase tracking-widest text-purple-200">
                GST Offline Tool Ready
              </span>
              <span className="text-xs text-purple-200">Period: {data.period_label}</span>
            </div>
            <h3 className="text-xl font-black tracking-tight mt-1">
              GSTR-1 Monthly / Quarterly Outward Supplies
            </h3>
            <p className="text-xs text-purple-300">
              Merchant: <strong>{data.shop_name}</strong> · GSTIN: <strong>{data.shop_gstin || 'Not configured in Settings'}</strong>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={<RefreshCw className="w-3.5 h-3.5" />}
              onClick={onRefresh}
              className="bg-white/10 hover:bg-white/20 text-white border-white/20"
            >
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={<Download className="w-3.5 h-3.5" />}
              onClick={handleExportCsv}
              className="bg-white/10 hover:bg-white/20 text-white border-white/20"
            >
              Export GSTR-1 CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={<FileSpreadsheet className="w-3.5 h-3.5" />}
              onClick={handleExportJson}
              className="bg-white/10 hover:bg-white/20 text-white border-white/20"
            >
              Export GST JSON
            </Button>
          </div>
        </div>

        {/* Output Tax Liability KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-purple-800/60">
          <div className="bg-purple-950/40 p-3 rounded-xl border border-purple-800/40">
            <div className="text-[11px] font-semibold text-purple-300 uppercase">
              Table 4: B2B Registered Sales
            </div>
            <div className="text-lg font-bold mt-0.5">
              {formatCurrency(data.total_b2b_taxable)}
            </div>
            <div className="text-[11px] text-purple-300">
              Tax: {formatCurrency(data.total_b2b_tax)} ({data.total_b2b_invoices} invoices)
            </div>
          </div>

          <div className="bg-purple-950/40 p-3 rounded-xl border border-purple-800/40">
            <div className="text-[11px] font-semibold text-purple-300 uppercase">
              Table 7: B2C Retail Sales
            </div>
            <div className="text-lg font-bold mt-0.5">
              {formatCurrency(data.total_b2c_taxable)}
            </div>
            <div className="text-[11px] text-purple-300">
              Tax: {formatCurrency(data.total_b2c_tax)} ({data.total_b2c_invoices} bills)
            </div>
          </div>

          <div className="bg-emerald-950/40 p-3 rounded-xl border border-emerald-800/40">
            <div className="text-[11px] font-semibold text-emerald-300 uppercase">
              Total Output GST Liability
            </div>
            <div className="text-lg font-black text-emerald-300 mt-0.5">
              {formatCurrency(totalGstLiability)}
            </div>
            <div className="text-[11px] text-emerald-400">
              CGST: {formatCurrency(totalGstLiability / 2)} | SGST: {formatCurrency(totalGstLiability / 2)}
            </div>
          </div>
        </div>
      </div>

      {/* Sub Tabs Selector */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveSubTab('b2b')}
          className={`pb-2.5 px-3.5 text-xs font-bold flex items-center gap-1.5 border-b-2 transition cursor-pointer ${
            activeSubTab === 'b2b'
              ? 'border-purple-600 text-purple-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>Table 4: B2B Invoices ({data.b2b_table4.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('b2c')}
          className={`pb-2.5 px-3.5 text-xs font-bold flex items-center gap-1.5 border-b-2 transition cursor-pointer ${
            activeSubTab === 'b2c'
              ? 'border-purple-600 text-purple-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          <span>Table 7: B2C Small Details ({data.b2c_table7.length} Rates)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('hsn')}
          className={`pb-2.5 px-3.5 text-xs font-bold flex items-center gap-1.5 border-b-2 transition cursor-pointer ${
            activeSubTab === 'hsn'
              ? 'border-purple-600 text-purple-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Table 12: HSN Summary ({data.hsn_table12.length} HSN Codes)</span>
        </button>
      </div>

      {/* Table 4: B2B Table View */}
      {activeSubTab === 'b2b' && (
        <div className="space-y-3">
          {data.b2b_table4.length === 0 ? (
            <div className="text-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-xl">
              <Building2 className="w-10 h-10 mx-auto mb-2 opacity-30 text-purple-600" />
              <p className="font-semibold text-xs">No B2B Invoices Recorded in this Period</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Sales made to customers who have a registered GSTIN are automatically categorized here for Table 4.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">GSTIN of Receiver</th>
                    <th className="py-2.5 px-3">Receiver Name</th>
                    <th className="py-2.5 px-3">Invoice No</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3 text-right">Invoice Value</th>
                    <th className="py-2.5 px-3 text-center">Rate</th>
                    <th className="py-2.5 px-3 text-right">Taxable Value</th>
                    <th className="py-2.5 px-3 text-right">CGST</th>
                    <th className="py-2.5 px-3 text-right">SGST</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.b2b_table4.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 font-medium">
                      <td className="py-2 px-3 font-mono font-bold text-purple-900">{row.gstin}</td>
                      <td className="py-2 px-3">{row.customer_name}</td>
                      <td className="py-2 px-3 font-mono font-semibold">{row.invoice_number}</td>
                      <td className="py-2 px-3 text-slate-500">{row.invoice_date}</td>
                      <td className="py-2 px-3 text-right font-bold">{formatCurrency(row.invoice_value)}</td>
                      <td className="py-2 px-3 text-center font-bold">{row.applicable_tax_rate}%</td>
                      <td className="py-2 px-3 text-right">{formatCurrency(row.taxable_value)}</td>
                      <td className="py-2 px-3 text-right text-slate-600">{formatCurrency(row.central_tax)}</td>
                      <td className="py-2 px-3 text-right text-slate-600">{formatCurrency(row.state_tax)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Table 7: B2C Small Table View */}
      {activeSubTab === 'b2c' && (
        <div className="space-y-3">
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">GST Tax Rate</th>
                  <th className="py-2.5 px-3 text-center">Invoice Count</th>
                  <th className="py-2.5 px-3 text-right">Total Taxable Value</th>
                  <th className="py-2.5 px-3 text-right">Central Tax (CGST)</th>
                  <th className="py-2.5 px-3 text-right">State Tax (SGST)</th>
                  <th className="py-2.5 px-3 text-right">Gross Total Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.b2c_table7.map((row) => (
                  <tr key={row.tax_rate} className="hover:bg-slate-50 font-medium">
                    <td className="py-2.5 px-3">
                      <span className="font-bold px-2 py-0.5 bg-purple-50 text-purple-900 border border-purple-200 rounded">
                        {row.tax_rate}% GST
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center font-semibold text-slate-700">
                      {row.invoice_count} bills
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                      {formatCurrency(row.taxable_value)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-600">
                      {formatCurrency(row.central_tax)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-600">
                      {formatCurrency(row.state_tax)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-black text-slate-900">
                      {formatCurrency(row.total_value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Table 12: HSN Summary View */}
      {activeSubTab === 'hsn' && (
        <div className="space-y-3">
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">HSN Code</th>
                  <th className="py-2.5 px-3">Description</th>
                  <th className="py-2.5 px-3 text-center">UQC Unit</th>
                  <th className="py-2.5 px-3 text-right">Total Qty</th>
                  <th className="py-2.5 px-3 text-right">Total Value</th>
                  <th className="py-2.5 px-3 text-right">Taxable Value</th>
                  <th className="py-2.5 px-3 text-right">CGST</th>
                  <th className="py-2.5 px-3 text-right">SGST</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.hsn_table12.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 font-medium">
                    <td className="py-2 px-3 font-mono font-bold text-slate-800">{row.hsn_code}</td>
                    <td className="py-2 px-3">{row.description}</td>
                    <td className="py-2 px-3 text-center font-bold text-slate-500">{row.uqc}</td>
                    <td className="py-2 px-3 text-right font-semibold">{row.total_quantity}</td>
                    <td className="py-2 px-3 text-right">{formatCurrency(row.total_value)}</td>
                    <td className="py-2 px-3 text-right font-bold">{formatCurrency(row.taxable_value)}</td>
                    <td className="py-2 px-3 text-right text-slate-600">{formatCurrency(row.central_tax)}</td>
                    <td className="py-2 px-3 text-right text-slate-600">{formatCurrency(row.state_tax)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
