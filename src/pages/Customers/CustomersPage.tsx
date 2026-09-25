import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users,
  Search,
  UserPlus,
  Edit2,
  Trash2,
  Phone,
  MapPin,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  X,
  RefreshCw,
  Loader2,
  UserCheck,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { customerService } from '../../services/customerService';
import type { Customer, CreateCustomerInput, UpdateCustomerInput } from '../../types';

interface FormErrors {
  name?: string;
  phone?: string;
}

export const CustomersPage: React.FC = () => {
  // State
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals state
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete modal state
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Notification Banner
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form Fields
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
  });
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});

  // Auto-dismiss notification after 4 seconds
  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(null), 4000);
    return () => clearTimeout(timer);
  }, [notification]);

  // Load customers from SQLite
  const loadCustomers = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await customerService.getCustomers();
      setCustomers(data);
    } catch (err) {
      console.error('Failed to load customers:', err);
      setNotification({
        type: 'error',
        message: 'Failed to load customers from database: ' + String(err),
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  // Global F4 shortcut listener to open Add Customer modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F4') {
        e.preventDefault();
        openAddModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filtered/searched customers
  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return customers;

    return customers.filter((c) => {
      const matchesName = c.name.toLowerCase().includes(q);
      const matchesPhone = c.phone ? c.phone.includes(q) : false;
      const matchesAddress = c.address ? c.address.toLowerCase().includes(q) : false;
      return matchesName || matchesPhone || matchesAddress;
    });
  }, [customers, searchQuery]);

  // Form management
  const openAddModal = () => {
    setEditingCustomer(null);
    setFormData({
      name: '',
      phone: '',
      address: '',
    });
    setFieldErrors({});
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      phone: customer.phone || '',
      address: customer.address || '',
    });
    setFieldErrors({});
    setFormError(null);
    setIsFormOpen(true);
  };

  const closeFormModal = () => {
    if (isSaving) return;
    setIsFormOpen(false);
    setEditingCustomer(null);
    setFormError(null);
  };

  const validateForm = (): boolean => {
    const errors: FormErrors = {};
    const trimmedName = formData.name.trim();

    if (!trimmedName) {
      errors.name = 'Customer name is required';
    } else if (trimmedName.length > 120) {
      errors.name = 'Customer name cannot exceed 120 characters';
    }

    if (formData.phone.trim()) {
      const cleaned = formData.phone.replace(/[\s-]/g, '');
      const digitsOnly = cleaned.replace(/^\+91|^91|^0/, '');
      if (digitsOnly.length !== 10 || !/^\d{10}$/.test(digitsOnly)) {
        errors.phone = 'Please enter a valid 10-digit mobile number';
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSaving(true);
    setFormError(null);

    try {
      if (editingCustomer) {
        const updatePayload: UpdateCustomerInput = {
          id: editingCustomer.id,
          name: formData.name.trim(),
          phone: formData.phone.trim() || null,
          address: formData.address.trim() || null,
        };
        const updated = await customerService.updateCustomer(updatePayload);
        setCustomers((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        setNotification({
          type: 'success',
          message: `Customer "${updated.name}" updated successfully.`,
        });
      } else {
        const createPayload: CreateCustomerInput = {
          name: formData.name.trim(),
          phone: formData.phone.trim() || null,
          address: formData.address.trim() || null,
        };
        const created = await customerService.createCustomer(createPayload);
        setCustomers((prev) => [created, ...prev]);
        setNotification({
          type: 'success',
          message: `Customer "${created.name}" added to directory.`,
        });
      }
      setIsFormOpen(false);
    } catch (err: unknown) {
      console.error('Failed to save customer:', err);
      setFormError(String(err).replace(/^Error:\s*/, ''));
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Action
  const confirmDelete = (customer: Customer) => {
    setDeletingCustomer(customer);
    setDeleteError(null);
  };

  const handleDelete = async () => {
    if (!deletingCustomer) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      await customerService.deleteCustomer(deletingCustomer.id);
      setCustomers((prev) => prev.filter((c) => c.id !== deletingCustomer.id));
      setNotification({
        type: 'success',
        message: `Customer "${deletingCustomer.name}" deleted.`,
      });
      setDeletingCustomer(null);
    } catch (err: unknown) {
      console.error('Failed to delete customer:', err);
      setDeleteError(String(err).replace(/^Error:\s*/, ''));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6 space-y-5 max-w-7xl mx-auto w-full">
      {/* Toast Notification Banner */}
      {notification && (
        <div
          className={`flex items-center justify-between p-4 rounded-xl shadow-md border text-sm font-medium transition-all animate-in fade-in slide-in-from-top-2 ${
            notification.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-rose-50 border-rose-300 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="p-1 hover:bg-black/5 rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">Customer Directory</h2>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                {customers.length} Customers
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Manage regular shop customers, mobile numbers, and contact profiles
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="md"
            icon={<RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />}
            onClick={loadCustomers}
            disabled={isLoading}
            title="Refresh customer directory from local SQLite database"
          >
            Refresh
          </Button>

          <Button
            variant="primary"
            size="md"
            icon={<UserPlus className="w-4 h-4" />}
            onClick={openAddModal}
            className="shadow-sm"
          >
            Add Customer (F4)
          </Button>
        </div>
      </div>

      {/* Search and Summary Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        {/* Prominent Search Box */}
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search customer by name or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-9 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-900 placeholder-slate-400 font-medium"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-500 font-medium">
          <span>
            {searchQuery
              ? `Showing ${filteredCustomers.length} of ${customers.length} results`
              : `${customers.length} total registered customers`}
          </span>
          {searchQuery && (
            <Button variant="outline" size="sm" onClick={() => setSearchQuery('')}>
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Main Table Content */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden flex-1 flex flex-col">
        {isLoading ? (
          <div className="p-16 flex flex-col items-center justify-center text-center space-y-3">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
            <p className="text-sm font-semibold text-slate-700">Loading customers from SQLite database...</p>
          </div>
        ) : customers.length === 0 ? (
          /* Empty State: 0 customers in database */
          <div className="p-16 flex flex-col items-center justify-center text-center space-y-4 max-w-md mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
              <UserCheck className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">No customers yet</h3>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                Add a customer to quickly find them during counter billing, track customer khata, or issue named invoices.
              </p>
            </div>
            <Button
              variant="primary"
              size="md"
              icon={<UserPlus className="w-4 h-4" />}
              onClick={openAddModal}
            >
              Add First Customer
            </Button>
          </div>
        ) : filteredCustomers.length === 0 ? (
          /* Filter Empty State */
          <div className="p-12 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center">
              <Search className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-800">No matching customers found</h3>
            <p className="text-xs text-slate-500 max-w-xs">
              No customer found matching "{searchQuery}". Check the phone number or name spelling.
            </p>
            <Button variant="outline" size="sm" onClick={() => setSearchQuery('')}>
              Clear Search
            </Button>
          </div>
        ) : (
          /* Customer Table */
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Customer Name</th>
                  <th className="py-3 px-4">Phone Number</th>
                  <th className="py-3 px-4">Address / Area</th>
                  <th className="py-3 px-4">Registered On</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredCustomers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/80 transition-colors group">
                    {/* Customer Name */}
                    <td className="py-3 px-4 font-bold text-slate-900 text-sm">
                      {c.name}
                    </td>

                    {/* Phone Number */}
                    <td className="py-3 px-4 font-mono text-xs">
                      {c.phone ? (
                        <span className="inline-flex items-center gap-1.5 text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          <Phone className="w-3 h-3 text-slate-400" />
                          {c.phone}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* Address */}
                    <td className="py-3 px-4 text-slate-600">
                      {c.address ? (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{c.address}</span>
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* Created Date */}
                    <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        {c.created_at ? c.created_at.split(' ')[0] : '—'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5 opacity-90 group-hover:opacity-100">
                        <button
                          onClick={() => openEditModal(c)}
                          className="p-1.5 text-slate-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-md transition-colors"
                          title="Edit customer details"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => confirmDelete(c)}
                          className="p-1.5 text-slate-600 hover:text-rose-700 hover:bg-rose-50 rounded-md transition-colors"
                          title="Delete customer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer Count */}
        {filteredCustomers.length > 0 && (
          <div className="p-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 font-medium flex justify-between items-center">
            <span>
              Showing {filteredCustomers.length} of {customers.length} registered customers
            </span>
            <span className="text-[11px] text-slate-400">
              Offline Local SQLite Directory
            </span>
          </div>
        )}
      </div>

      {/* Add / Edit Customer Modal Form */}
      <Modal
        isOpen={isFormOpen}
        onClose={closeFormModal}
        title={editingCustomer ? `Edit Customer: ${editingCustomer.name}` : 'Add New Customer'}
        maxWidth="md"
      >
        <form onSubmit={handleFormSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{formError}</span>
            </div>
          )}

          {/* Customer Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Customer Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              placeholder="e.g. Rahul Das, M/S Sharma Kirana"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={`w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-2 font-medium ${
                fieldErrors.name
                  ? 'border-rose-400 focus:ring-rose-400 bg-rose-50/50'
                  : 'border-slate-300 focus:ring-indigo-500 bg-white'
              }`}
            />
            {fieldErrors.name && (
              <span className="text-[10px] text-rose-600 font-medium mt-0.5 block">
                {fieldErrors.name}
              </span>
            )}
          </div>

          {/* Phone Number */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Mobile Phone Number <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              placeholder="10-digit mobile number, e.g. 98765 43210"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className={`w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-2 font-mono ${
                fieldErrors.phone
                  ? 'border-rose-400 focus:ring-rose-400 bg-rose-50/50'
                  : 'border-slate-300 focus:ring-indigo-500 bg-white'
              }`}
            />
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Leave blank for walk-in customers who do not wish to share a phone number.
            </span>
            {fieldErrors.phone && (
              <span className="text-[10px] text-rose-600 font-medium mt-0.5 block">
                {fieldErrors.phone}
              </span>
            )}
          </div>

          {/* Address */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Address / Locality <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Shop 4, Main Bazaar, College Para"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={closeFormModal}
              disabled={isSaving}
            >
              Cancel (Esc)
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={isSaving}
              icon={isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
            >
              {isSaving
                ? editingCustomer
                  ? 'Updating...'
                  : 'Saving...'
                : editingCustomer
                ? 'Save Changes'
                : 'Save Customer'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={Boolean(deletingCustomer)}
        onClose={() => {
          if (!isDeleting) setDeletingCustomer(null);
        }}
        title="Delete Customer?"
        maxWidth="sm"
      >
        <div className="space-y-4">
          {deleteError ? (
            <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Deletion Blocked</span>
              </div>
              <p>{deleteError}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-600">
              Are you sure you want to delete{' '}
              <strong className="text-slate-900 font-bold">
                {deletingCustomer?.name}
              </strong>
              ? This action will remove the customer profile from the directory.
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              variant="outline"
              size="md"
              onClick={() => setDeletingCustomer(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            {!deleteError && (
              <Button
                variant="danger"
                size="md"
                onClick={handleDelete}
                disabled={isDeleting}
                icon={isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};
