import React, { useState, useEffect } from 'react';
import {
  Settings,
  Database,
  Save,
  Info,
  Store,
  Check,
  AlertCircle,
  Download,
  Upload,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { billingService } from '../../services/billingService';
import { inventoryService } from '../../services/inventoryService';
import type { SystemInfo, ShopProfile } from '../../types';

interface SettingsPageProps {
  systemInfo: SystemInfo | null;
  isNative: boolean;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  systemInfo,
  isNative,
}) => {
  const [profile, setProfile] = useState<ShopProfile>({
    shop_name: 'Apna Grocery Store',
    owner_name: '',
    shop_address: 'Main Market, Local City',
    shop_phone: '',
    shop_email: '',
    shop_gstin: '',
    shop_upi_id: '',
    invoice_footer: 'Thank you for shopping with us! Please visit again.',
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Backup & Restore state
  const [backupPath, setBackupPath] = useState<string | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [restoreFilePath, setRestoreFilePath] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreSuccess, setRestoreSuccess] = useState<string | null>(null);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);

  useEffect(() => {
    loadShopProfile();
  }, []);

  const loadShopProfile = async () => {
    try {
      const data = await billingService.getShopProfile();
      setProfile({
        shop_name: data.shop_name || '',
        owner_name: data.owner_name || '',
        shop_address: data.shop_address || '',
        shop_phone: data.shop_phone || '',
        shop_email: data.shop_email || '',
        shop_gstin: data.shop_gstin || '',
        shop_upi_id: data.shop_upi_id || '',
        invoice_footer: data.invoice_footer || 'Thank you for shopping with us! Please visit again.',
      });
    } catch (err) {
      console.error('Failed to load shop profile:', err);
    }
  };

  const handleSaveProfile = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!profile.shop_name.trim()) {
      setErrorMessage('Shop Name is required.');
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage(null);
      setSaveSuccess(false);

      const saved = await billingService.saveShopProfile({
        shop_name: profile.shop_name.trim(),
        owner_name: profile.owner_name.trim(),
        shop_address: profile.shop_address.trim(),
        shop_phone: profile.shop_phone.trim(),
        shop_email: profile.shop_email?.trim() || null,
        shop_gstin: profile.shop_gstin?.trim() || null,
        shop_upi_id: profile.shop_upi_id?.trim() || null,
        invoice_footer: profile.invoice_footer.trim() || 'Thank you for shopping with us! Please visit again.',
      });

      setProfile({
        shop_name: saved.shop_name,
        owner_name: saved.owner_name,
        shop_address: saved.shop_address,
        shop_phone: saved.shop_phone,
        shop_email: saved.shop_email || '',
        shop_gstin: saved.shop_gstin || '',
        shop_upi_id: saved.shop_upi_id || '',
        invoice_footer: saved.invoice_footer,
      });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg || 'Failed to save shop profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateBackup = async () => {
    try {
      setIsBackingUp(true);
      setErrorMessage(null);
      const savedPath = await inventoryService.exportDatabaseBackup();
      setBackupPath(savedPath);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Backup failed: ${msg}`);
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestoreBackup = async () => {
    if (!restoreFilePath.trim()) {
      setErrorMessage('Please enter the full file path to the backup .db file.');
      return;
    }
    try {
      setIsRestoring(true);
      setErrorMessage(null);
      setRestoreSuccess(null);
      const status = await inventoryService.restoreDatabaseBackup(restoreFilePath.trim());
      setRestoreSuccess(`Database restored successfully (${status.migrations_applied} migrations verified across ${status.total_tables} tables).`);
      setRestoreConfirmOpen(false);
      setRestoreFilePath('');
      await loadShopProfile();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Restore failed: ${msg}`);
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6 space-y-6 overflow-y-auto">
      {/* Title & Actions Bar */}
      <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-slate-100 text-slate-800">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              System Settings & Shop Profile
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Store branding, invoice header, thermal printer configuration, and offline database health
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {saveSuccess && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
              <Check className="w-4 h-4 text-emerald-600" />
              Settings Saved Locally
            </span>
          )}
          <Button
            variant="primary"
            size="md"
            icon={<Save className="w-4 h-4" />}
            onClick={() => handleSaveProfile()}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Settings (F8)'}
          </Button>
        </div>
      </div>

      {errorMessage && (
        <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 text-sm rounded-xl border border-red-200">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Settings Form Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Shop Profile Form (Takes 2 cols on lg) */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Store className="w-5 h-5 text-emerald-600" />
              <h3 className="text-base font-bold text-slate-800">
                Shop Profile & Invoice Branding
              </h3>
            </div>
            <span className="text-xs font-medium text-slate-400">
              Appears on all printed receipts and invoices
            </span>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Shop Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={profile.shop_name}
                  onChange={(e) => setProfile({ ...profile, shop_name: e.target.value })}
                  placeholder="e.g. Maa Laxmi Grocery Store"
                  className="w-full text-sm px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Owner / Proprietor Name
                </label>
                <input
                  type="text"
                  value={profile.owner_name}
                  onChange={(e) => setProfile({ ...profile, owner_name: e.target.value })}
                  placeholder="e.g. Rajesh Kumar"
                  className="w-full text-sm px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Shop Location / Full Address
              </label>
              <textarea
                rows={2}
                value={profile.shop_address}
                onChange={(e) => setProfile({ ...profile, shop_address: e.target.value })}
                placeholder="e.g. Sevoke Road, Near City Mall, Siliguri, West Bengal - 734001"
                className="w-full text-sm px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Phone / Mobile Number
                </label>
                <input
                  type="text"
                  value={profile.shop_phone}
                  onChange={(e) => setProfile({ ...profile, shop_phone: e.target.value })}
                  placeholder="e.g. 9876543210"
                  className="w-full text-sm px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Shop UPI ID (QR Payments)
                </label>
                <input
                  type="text"
                  value={profile.shop_upi_id || ''}
                  onChange={(e) => setProfile({ ...profile, shop_upi_id: e.target.value })}
                  placeholder="e.g. 9876543210@paytm"
                  className="w-full text-sm px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  GSTIN (Optional)
                </label>
                <input
                  type="text"
                  value={profile.shop_gstin || ''}
                  onChange={(e) => setProfile({ ...profile, shop_gstin: e.target.value })}
                  placeholder="e.g. 19ABCDE1234F1Z5"
                  className="w-full text-sm px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 uppercase font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email (Optional)
                </label>
                <input
                  type="email"
                  value={profile.shop_email || ''}
                  onChange={(e) => setProfile({ ...profile, shop_email: e.target.value })}
                  placeholder="e.g. store@gmail.com"
                  className="w-full text-sm px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Invoice Footer / Terms Message
              </label>
              <input
                type="text"
                value={profile.invoice_footer}
                onChange={(e) => setProfile({ ...profile, invoice_footer: e.target.value })}
                placeholder="e.g. Thank you for shopping with us! Please visit again."
                className="w-full text-sm px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </form>

          {/* Live Receipt Header Preview */}
          <div className="mt-6 pt-4 border-t border-slate-100">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">
              Live Receipt Header Preview
            </span>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center font-mono text-xs text-slate-800 max-w-md mx-auto shadow-inner">
              <div className="font-bold text-sm uppercase text-slate-900">
                {profile.shop_name || 'APNA GROCERY STORE'}
              </div>
              {profile.owner_name && (
                <div className="text-[11px] text-slate-600">Prop: {profile.owner_name}</div>
              )}
              {profile.shop_address && (
                <div className="text-[11px] text-slate-600">{profile.shop_address}</div>
              )}
              <div className="text-[11px] text-slate-600">
                {profile.shop_phone && <span>Ph: {profile.shop_phone} </span>}
                {profile.shop_gstin && <span>| GSTIN: {profile.shop_gstin}</span>}
              </div>
              {profile.shop_upi_id && (
                <div className="text-[11px] text-purple-600 font-semibold mt-0.5">
                  UPI: {profile.shop_upi_id}
                </div>
              )}
              <div className="border-b border-dashed border-slate-300 my-2" />
              <div className="text-[10px] text-slate-500">
                Invoice: INV-000001 · Date: {new Date().toLocaleDateString('en-IN')}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: System Status & Diagnostic Info */}
        <div className="space-y-6">
          {/* Native Environment */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-600" />
              <h4 className="text-sm font-bold text-slate-800">
                Desktop Environment
              </h4>
            </div>
            <div className="divide-y divide-slate-100 text-xs">
              <div className="py-2 flex justify-between">
                <span className="text-slate-500">Application:</span>
                <span className="font-semibold text-slate-800">{systemInfo?.app_name || 'Grocery POS'}</span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-slate-500">Version:</span>
                <span className="font-mono font-medium text-slate-800">{systemInfo?.version || '0.1.0'}</span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-slate-500">Platform OS:</span>
                <span className="font-medium text-slate-800">{systemInfo?.os || 'Windows'}</span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-slate-500">Tauri IPC:</span>
                <span className={isNative ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                  {isNative ? 'Active (Native)' : 'Web Preview'}
                </span>
              </div>
            </div>
          </div>

          {/* Database Info */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-600" />
              <h4 className="text-sm font-bold text-slate-800">
                Offline Database & Security
              </h4>
            </div>
            <div className="divide-y divide-slate-100 text-xs">
              <div className="py-2 flex justify-between">
                <span className="text-slate-500">Engine:</span>
                <span className="font-semibold text-slate-800">SQLite (Embedded)</span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-slate-500">Network:</span>
                <span className="text-emerald-700 font-semibold">100% Offline Capable</span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-slate-500">Transactions:</span>
                <span className="font-medium text-slate-800">Atomic Rollback Guard</span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-slate-500">Receipt Printers:</span>
                <span className="font-medium text-slate-800">58mm / 80mm / A4 Windows</span>
              </div>
            </div>
          </div>

          {/* Database Backup & Disaster Recovery Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <h4 className="text-sm font-bold text-slate-800">
                Backup & Disaster Recovery
              </h4>
            </div>
            <p className="text-xs text-slate-500">
              Create instant SQLite snapshots to prevent data loss or restore shop records on a new computer.
            </p>

            <div className="space-y-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                icon={<Download className="w-3.5 h-3.5" />}
                className="w-full justify-center text-xs"
                onClick={handleCreateBackup}
                disabled={isBackingUp}
              >
                {isBackingUp ? 'Creating Backup...' : 'Create Backup Snapshot'}
              </Button>

              {backupPath && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-[11px] text-emerald-800 space-y-1">
                  <div className="font-semibold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 text-emerald-600" /> Backup Created Successfully
                  </div>
                  <div className="font-mono text-[10px] break-all text-slate-700 bg-white p-1 rounded border border-emerald-100">
                    {backupPath}
                  </div>
                </div>
              )}

              <Button
                variant="secondary"
                size="sm"
                icon={<Upload className="w-3.5 h-3.5 text-amber-600" />}
                className="w-full justify-center text-xs text-slate-700 hover:text-slate-900"
                onClick={() => setRestoreConfirmOpen(true)}
              >
                Restore from Backup...
              </Button>

              {restoreSuccess && (
                <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-[11px] text-blue-800 space-y-1">
                  <div className="font-semibold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 text-blue-600" /> {restoreSuccess}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Restore Database Confirmation Modal */}
      <Modal
        isOpen={restoreConfirmOpen}
        onClose={() => setRestoreConfirmOpen(false)}
        title="Restore Shop Database"
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">Important Safety Notice:</div>
              <p className="mt-0.5 text-amber-800">
                Restoring will replace the active database with the backup file. An automated emergency snapshot of your current database will be saved before restore begins.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Source Backup File (.db path) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={restoreFilePath}
              onChange={(e) => setRestoreFilePath(e.target.value)}
              placeholder="e.g. C:\Users\Shop\Documents\grocerypos_backup.db"
              className="w-full text-xs font-mono px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              variant="secondary"
              size="md"
              onClick={() => setRestoreConfirmOpen(false)}
              disabled={isRestoring}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              icon={<Upload className="w-4 h-4" />}
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={handleRestoreBackup}
              disabled={isRestoring || !restoreFilePath.trim()}
            >
              {isRestoring ? 'Restoring...' : 'Confirm & Restore'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
