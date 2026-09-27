import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Package,
  Search,
  Plus,
  Edit2,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  X,
  Filter,
  RefreshCw,
  Loader2,
  Boxes,
  Sliders,
  History,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { StockAdjustmentModal } from '../../components/inventory/StockAdjustmentModal';
import { StockLedgerModal } from '../../components/inventory/StockLedgerModal';
import { productService, GROCERY_UNITS, GST_RATES, COMMON_GROCERY_HSN } from '../../services/productService';
import type { Product, CreateProductInput, UpdateProductInput } from '../../types';

// Standard grocery categories commonly used in India
const DEFAULT_CATEGORIES = [
  'Grains & Flours',
  'Pulses & Dals',
  'Spices & Salt',
  'Edible Oils & Ghee',
  'Dairy & Eggs',
  'Snacks & Biscuits',
  'Beverages & Tea',
  'Personal Care',
  'Cleaning & Household',
  'General',
];

interface FormErrors {
  name?: string;
  unit?: string;
  purchase_price?: string;
  selling_price?: string;
  mrp?: string;
  gst_rate?: string;
  stock?: string;
  minimum_stock?: string;
}

export const ProductsPage: React.FC = () => {
  // State
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock'>('all');

  // Modals state
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete modal state
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Stock Adjustment & Ledger modal state
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);
  const [ledgerProduct, setLedgerProduct] = useState<Product | null>(null);

  // Success toast / notification banner
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form Fields
  const [formData, setFormData] = useState({
    name: '',
    barcode: '',
    hsn_code: '',
    category: 'General',
    unit: 'Kg',
    purchase_price: '',
    selling_price: '',
    mrp: '',
    gst_rate: '0',
    stock: '0',
    minimum_stock: '5',
  });
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});

  // Auto-dismiss notification after 4 seconds
  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(null), 4000);
    return () => clearTimeout(timer);
  }, [notification]);

  // Load products from SQLite
  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await productService.getProducts();
      setProducts(data);
    } catch (err) {
      console.error('Failed to load products:', err);
      setNotification({
        type: 'error',
        message: 'Failed to load products from database: ' + String(err),
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // Global F3 shortcut listener to open Add Product
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F3') {
        e.preventDefault();
        openAddModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Compute available categories from default list + existing products
  const availableCategories = useMemo(() => {
    const set = new Set<string>(DEFAULT_CATEGORIES);
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set).sort();
  }, [products]);

  // Stock summary counts
  const stockStats = useMemo(() => {
    let low = 0;
    let out = 0;
    products.forEach((p) => {
      if (p.stock <= 0) {
        out++;
      } else if (p.stock <= p.minimum_stock) {
        low++;
      }
    });
    return {
      total: products.length,
      lowStock: low,
      outOfStock: out,
      inStock: products.length - low - out,
    };
  }, [products]);

  // Filtered and searched products
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      // 1. Search Query
      if (q) {
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesBarcode = p.barcode ? p.barcode.toLowerCase().includes(q) : false;
        const matchesHsn = p.hsn_code ? p.hsn_code.toLowerCase().includes(q) : false;
        if (!matchesName && !matchesBarcode && !matchesHsn) return false;
      }

      // 2. Category Filter
      if (selectedCategory !== 'All' && p.category !== selectedCategory) {
        return false;
      }

      // 3. Stock Status Filter
      if (stockFilter === 'out_of_stock' && p.stock > 0) return false;
      if (stockFilter === 'low_stock' && (p.stock <= 0 || p.stock > p.minimum_stock)) return false;
      if (stockFilter === 'in_stock' && p.stock <= p.minimum_stock) return false;

      return true;
    });
  }, [products, searchQuery, selectedCategory, stockFilter]);

  // Form Management
  const openAddModal = () => {
    setEditingProduct(null);
    setFormData({
      name: '',
      barcode: '',
      hsn_code: '',
      category: 'General',
      unit: 'Kg',
      purchase_price: '',
      selling_price: '',
      mrp: '',
      gst_rate: '0',
      stock: '0',
      minimum_stock: '5',
    });
    setFieldErrors({});
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      barcode: product.barcode || '',
      hsn_code: product.hsn_code || '',
      category: product.category || 'General',
      unit: product.unit || 'Kg',
      purchase_price: product.purchase_price > 0 ? String(product.purchase_price) : '',
      selling_price: String(product.selling_price),
      mrp: product.mrp > 0 ? String(product.mrp) : '',
      gst_rate: String(product.gst_rate),
      stock: String(product.stock),
      minimum_stock: String(product.minimum_stock),
    });
    setFieldErrors({});
    setFormError(null);
    setIsFormOpen(true);
  };

  const closeFormModal = () => {
    if (isSaving) return;
    setIsFormOpen(false);
    setEditingProduct(null);
    setFormError(null);
  };

  const validateForm = (): boolean => {
    const errors: FormErrors = {};
    if (!formData.name.trim()) {
      errors.name = 'Product name is required';
    }

    if (!formData.unit.trim()) {
      errors.unit = 'Unit is required';
    }

    const sellPrice = parseFloat(formData.selling_price);
    if (isNaN(sellPrice) || sellPrice < 0) {
      errors.selling_price = 'Selling price must be a valid positive number';
    }

    if (formData.purchase_price) {
      const buyPrice = parseFloat(formData.purchase_price);
      if (isNaN(buyPrice) || buyPrice < 0) {
        errors.purchase_price = 'Purchase price must be positive';
      }
    }

    if (formData.mrp) {
      const mrpVal = parseFloat(formData.mrp);
      if (isNaN(mrpVal) || mrpVal < 0) {
        errors.mrp = 'MRP must be positive';
      }
    }

    if (formData.stock) {
      const stockVal = parseFloat(formData.stock);
      if (isNaN(stockVal) || stockVal < 0) {
        errors.stock = 'Stock must be 0 or greater';
      }
    }

    if (formData.minimum_stock) {
      const minVal = parseFloat(formData.minimum_stock);
      if (isNaN(minVal) || minVal < 0) {
        errors.minimum_stock = 'Minimum stock must be 0 or greater';
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

    const purchase_price = formData.purchase_price ? parseFloat(formData.purchase_price) : 0;
    const selling_price = parseFloat(formData.selling_price);
    const mrp = formData.mrp ? parseFloat(formData.mrp) : selling_price;
    const gst_rate = parseFloat(formData.gst_rate) || 0;
    const stock = formData.stock !== '' ? Math.round(parseFloat(formData.stock) || 0) : 0;
    const minimum_stock = formData.minimum_stock !== '' ? Math.round(parseFloat(formData.minimum_stock) || 0) : 0;

    try {
      if (editingProduct) {
        const updatePayload: UpdateProductInput = {
          id: editingProduct.id,
          name: formData.name.trim(),
          barcode: formData.barcode.trim() || null,
          hsn_code: formData.hsn_code.trim() || null,
          category: formData.category.trim() || 'General',
          unit: formData.unit.trim(),
          purchase_price,
          selling_price,
          mrp,
          gst_rate,
          stock,
          minimum_stock,
        };
        const updated = await productService.updateProduct(updatePayload);
        setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        setNotification({
          type: 'success',
          message: `Product "${updated.name}" updated successfully.`,
        });
      } else {
        const createPayload: CreateProductInput = {
          name: formData.name.trim(),
          barcode: formData.barcode.trim() || null,
          hsn_code: formData.hsn_code.trim() || null,
          category: formData.category.trim() || 'General',
          unit: formData.unit.trim(),
          purchase_price,
          selling_price,
          mrp,
          gst_rate,
          stock,
          minimum_stock,
        };
        const created = await productService.createProduct(createPayload);
        setProducts((prev) => [created, ...prev]);
        setNotification({
          type: 'success',
          message: `Product "${created.name}" added to inventory.`,
        });
      }
      setIsFormOpen(false);
    } catch (err: unknown) {
      console.error('Failed to save product:', err);
      setFormError(String(err).replace(/^Error:\s*/, ''));
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Action
  const confirmDelete = (product: Product) => {
    setDeletingProduct(product);
    setDeleteError(null);
  };

  const handleDelete = async () => {
    if (!deletingProduct) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      await productService.deleteProduct(deletingProduct.id);
      setProducts((prev) => prev.filter((p) => p.id !== deletingProduct.id));
      setNotification({
        type: 'success',
        message: `Product "${deletingProduct.name}" deleted.`,
      });
      setDeletingProduct(null);
    } catch (err: unknown) {
      console.error('Failed to delete product:', err);
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
          <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">Products & Inventory</h2>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                {products.length} Items
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Manage product pricing, barcodes, units, and inventory thresholds
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="md"
            icon={<RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />}
            onClick={loadProducts}
            disabled={isLoading}
            title="Refresh product list from local SQLite database"
          >
            Refresh
          </Button>

          <Button
            variant="primary"
            size="md"
            icon={<Plus className="w-4 h-4" />}
            onClick={openAddModal}
            className="shadow-sm"
          >
            Add Product (F3)
          </Button>
        </div>
      </div>

      {/* Stock Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <button
          onClick={() => setStockFilter('all')}
          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
            stockFilter === 'all'
              ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
              : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className={`text-xs font-semibold uppercase tracking-wider ${stockFilter === 'all' ? 'text-slate-300' : 'text-slate-500'}`}>
            Total Products
          </div>
          <div className="text-2xl font-bold mt-1">{stockStats.total}</div>
        </button>

        <button
          onClick={() => setStockFilter('in_stock')}
          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
            stockFilter === 'in_stock'
              ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
              : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className={`text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 ${stockFilter === 'in_stock' ? 'text-emerald-100' : 'text-emerald-700'}`}>
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            In Stock
          </div>
          <div className="text-2xl font-bold mt-1">{stockStats.inStock}</div>
        </button>

        <button
          onClick={() => setStockFilter('low_stock')}
          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
            stockFilter === 'low_stock'
              ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
              : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className={`text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 ${stockFilter === 'low_stock' ? 'text-amber-100' : 'text-amber-700'}`}>
            <AlertTriangle className="w-3.5 h-3.5" />
            Low Stock Alert
          </div>
          <div className="text-2xl font-bold mt-1">{stockStats.lowStock}</div>
        </button>

        <button
          onClick={() => setStockFilter('out_of_stock')}
          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
            stockFilter === 'out_of_stock'
              ? 'bg-rose-700 text-white border-rose-700 shadow-xs'
              : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className={`text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 ${stockFilter === 'out_of_stock' ? 'text-rose-100' : 'text-rose-700'}`}>
            <XCircle className="w-3.5 h-3.5" />
            Out of Stock
          </div>
          <div className="text-2xl font-bold mt-1">{stockStats.outOfStock}</div>
        </button>
      </div>

      {/* Search and Filters Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        {/* Prominent Search Box */}
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by product name or barcode..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-9 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white text-slate-900 placeholder-slate-400 font-medium"
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

        {/* Category & Status Filter dropdowns */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Filter className="w-4 h-4 text-slate-400" />
            <span>Category:</span>
          </div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="text-xs font-medium py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800"
          >
            <option value="All">All Categories ({products.length})</option>
            {availableCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          {(searchQuery || selectedCategory !== 'All' || stockFilter !== 'all') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('All');
                setStockFilter('all');
              }}
            >
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden flex-1 flex flex-col">
        {isLoading ? (
          <div className="p-16 flex flex-col items-center justify-center text-center space-y-3">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
            <p className="text-sm font-semibold text-slate-700">Loading products from SQLite database...</p>
          </div>
        ) : products.length === 0 ? (
          /* Empty State: 0 products total in DB */
          <div className="p-16 flex flex-col items-center justify-center text-center space-y-4 max-w-md mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
              <Boxes className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">No products yet</h3>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                Add your first grocery product to start managing inventory, prices, barcodes, and billing.
              </p>
            </div>
            <Button
              variant="primary"
              size="md"
              icon={<Plus className="w-4 h-4" />}
              onClick={openAddModal}
            >
              Add First Product
            </Button>
          </div>
        ) : filteredProducts.length === 0 ? (
          /* Filter Empty State */
          <div className="p-12 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center">
              <Search className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-800">No matching products found</h3>
            <p className="text-xs text-slate-500 max-w-xs">
              No products found matching your search or active filters. Try adjusting your search query.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('All');
                setStockFilter('all');
              }}
            >
              Clear Search & Filters
            </Button>
          </div>
        ) : (
          /* High-Speed Product Table */
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Product Name</th>
                  <th className="py-3 px-4">Barcode</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Unit</th>
                  <th className="py-3 px-4 text-right">Purchase (₹)</th>
                  <th className="py-3 px-4 text-right font-bold text-slate-900">Sell Price (₹)</th>
                  <th className="py-3 px-4 text-right">MRP (₹)</th>
                  <th className="py-3 px-4 text-right font-semibold">Stock</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredProducts.map((p) => {
                  const isOutOfStock = p.stock <= 0;
                  const isLowStock = !isOutOfStock && p.stock <= p.minimum_stock;

                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      {/* Product Name */}
                      <td className="py-3 px-4 font-bold text-slate-900 text-sm">
                        {p.name}
                      </td>

                      {/* Barcode & HSN */}
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                        <div className="flex flex-col gap-0.5">
                          {p.barcode ? (
                            <span className="px-1.5 py-0.5 bg-slate-100 rounded border border-slate-200 inline-block w-fit">
                              {p.barcode}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                          {p.hsn_code && (
                            <span className="text-[10px] text-slate-500 font-medium">
                              HSN: {p.hsn_code}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-3 px-4">
                        <span className="inline-block px-2 py-0.5 rounded text-[11px] bg-slate-100 text-slate-700 font-medium border border-slate-200">
                          {p.category}
                        </span>
                      </td>

                      {/* Unit */}
                      <td className="py-3 px-4 font-semibold text-slate-600">
                        {p.unit}
                      </td>

                      {/* Purchase Price */}
                      <td className="py-3 px-4 text-right font-mono text-slate-500">
                        ₹{p.purchase_price.toFixed(2)}
                      </td>

                      {/* Selling Price */}
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 text-sm">
                        ₹{p.selling_price.toFixed(2)}
                      </td>

                      {/* MRP */}
                      <td className="py-3 px-4 text-right font-mono text-slate-500">
                        ₹{p.mrp.toFixed(2)}
                      </td>

                      {/* Stock Level (Always Whole Number 0, 1, 2, 3...) */}
                      <td className="py-3 px-4 text-right font-mono font-bold">
                        <span
                          className={
                            isOutOfStock
                              ? 'text-rose-600'
                              : isLowStock
                              ? 'text-amber-700'
                              : 'text-slate-800'
                          }
                        >
                          {Math.round(p.stock)} {p.unit}
                        </span>
                      </td>

                      {/* Status Badge with Text + Icon (Not color alone) */}
                      <td className="py-3 px-4 text-center">
                        {isOutOfStock ? (
                          <Badge
                            variant="danger"
                            size="sm"
                            icon={<XCircle className="w-3.5 h-3.5 text-rose-600" />}
                          >
                            OUT OF STOCK
                          </Badge>
                        ) : isLowStock ? (
                          <Badge
                            variant="warning"
                            size="sm"
                            icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
                          >
                            LOW STOCK (≤{p.minimum_stock})
                          </Badge>
                        ) : (
                          <Badge
                            variant="success"
                            size="sm"
                            icon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                          >
                            IN STOCK
                          </Badge>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-90 group-hover:opacity-100">
                          <button
                            onClick={() => setAdjustingProduct(p)}
                            className="p-1.5 text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded-md transition-colors"
                            title="Adjust stock (Damage, Expired, Correction)"
                          >
                            <Sliders className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setLedgerProduct(p)}
                            className="p-1.5 text-slate-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-md transition-colors"
                            title="View Stock Ledger audit trail"
                          >
                            <History className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openEditModal(p)}
                            className="p-1.5 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors"
                            title="Edit product details"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => confirmDelete(p)}
                            className="p-1.5 text-slate-600 hover:text-rose-700 hover:bg-rose-50 rounded-md transition-colors"
                            title="Delete product"
                          >
                            <Trash2 className="w-4 h-4" />
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

        {/* Footer Count */}
        {filteredProducts.length > 0 && (
          <div className="p-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 font-medium flex justify-between items-center">
            <span>
              Showing {filteredProducts.length} of {products.length} products
            </span>
            <span className="text-[11px] text-slate-400">
              Offline Local SQLite Database Active
            </span>
          </div>
        )}
      </div>

      {/* Add / Edit Product Modal Form */}
      <Modal
        isOpen={isFormOpen}
        onClose={closeFormModal}
        title={editingProduct ? `Edit Product: ${editingProduct.name}` : 'Add New Grocery Product'}
        maxWidth="lg"
      >
        <form onSubmit={handleFormSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{formError}</span>
            </div>
          )}

          {/* Row 1: Product Name & Barcode */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Product Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                autoFocus
                placeholder="e.g. Tata Salt 1kg, Aashirvaad Atta"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className={`w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-2 font-medium ${
                  fieldErrors.name
                    ? 'border-rose-400 focus:ring-rose-400 bg-rose-50/50'
                    : 'border-slate-300 focus:ring-emerald-500 bg-white'
                }`}
              />
              {fieldErrors.name && (
                <span className="text-[10px] text-rose-600 font-medium mt-0.5 block">
                  {fieldErrors.name}
                </span>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Barcode / EAN <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                placeholder="Scan or enter barcode"
                value={formData.barcode}
                onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-mono"
              />
            </div>
          </div>

          {/* Row 2: Category, Unit, HSN Code */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Category
              </label>
              <input
                type="text"
                list="category-suggestions"
                placeholder="e.g. Grains, Spices, Dairy"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              />
              <datalist id="category-suggestions">
                {availableCategories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Unit <span className="text-rose-500">*</span>
              </label>
              <select
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-medium"
              >
                {GROCERY_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                HSN Code <span className="text-slate-400 font-normal">(GST Tax)</span>
              </label>
              <input
                type="text"
                list="hsn-suggestions"
                placeholder="e.g. 1006, 1101"
                value={formData.hsn_code}
                onChange={(e) => setFormData({ ...formData, hsn_code: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-mono"
              />
              <datalist id="hsn-suggestions">
                {COMMON_GROCERY_HSN.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.code} - {item.description}
                  </option>
                ))}
              </datalist>
            </div>
          </div>

          {/* Row 3: Pricing (Purchase, Selling, MRP) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Purchase Price (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formData.purchase_price}
                onChange={(e) => setFormData({ ...formData, purchase_price: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-mono"
              />
              {fieldErrors.purchase_price && (
                <span className="text-[10px] text-rose-600 font-medium mt-0.5 block">
                  {fieldErrors.purchase_price}
                </span>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-900 mb-1">
                Selling Price (₹) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                placeholder="0.00"
                value={formData.selling_price}
                onChange={(e) => setFormData({ ...formData, selling_price: e.target.value })}
                className={`w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-2 font-mono font-bold ${
                  fieldErrors.selling_price
                    ? 'border-rose-400 focus:ring-rose-400 bg-rose-50/50'
                    : 'border-slate-300 focus:ring-emerald-500 bg-white text-emerald-800'
                }`}
              />
              {fieldErrors.selling_price && (
                <span className="text-[10px] text-rose-600 font-medium mt-0.5 block">
                  {fieldErrors.selling_price}
                </span>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                MRP (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Defaults to sell price"
                value={formData.mrp}
                onChange={(e) => setFormData({ ...formData, mrp: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-mono"
              />
            </div>
          </div>

          {/* Row 4: GST Rate, Stock, Minimum Stock */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                GST Rate (%)
              </label>
              <select
                value={formData.gst_rate}
                onChange={(e) => setFormData({ ...formData, gst_rate: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-medium"
              >
                {GST_RATES.map((rate) => (
                  <option key={rate} value={rate}>
                    {rate}% GST {rate === 0 ? '(Tax Free)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {editingProduct ? 'Current Stock' : 'Opening Stock'}
              </label>
              <input
                type="number"
                step="1"
                min="0"
                placeholder="0"
                value={formData.stock}
                onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-mono font-semibold"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                {editingProduct ? 'Update only if adjusting inventory' : 'Initial count on shelf (Whole number: 0, 1, 2...)'}
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Minimum Stock Alert
              </label>
              <input
                type="number"
                step="1"
                min="0"
                placeholder="5"
                value={formData.minimum_stock}
                onChange={(e) => setFormData({ ...formData, minimum_stock: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-mono"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                Alerts when stock drops to or below this
              </span>
            </div>
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
                ? editingProduct
                  ? 'Updating...'
                  : 'Saving...'
                : editingProduct
                ? 'Save Changes'
                : 'Save Product'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={Boolean(deletingProduct)}
        onClose={() => {
          if (!isDeleting) setDeletingProduct(null);
        }}
        title="Delete Product?"
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
                {deletingProduct?.name}
              </strong>
              ? This action will remove the product from the catalog.
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              variant="outline"
              size="md"
              onClick={() => setDeletingProduct(null)}
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

      {/* Stock Adjustment Modal */}
      {adjustingProduct && (
        <StockAdjustmentModal
          product={adjustingProduct}
          onClose={() => setAdjustingProduct(null)}
          onAdjusted={(movement) => {
            setAdjustingProduct(null);
            loadProducts();
            setNotification({
              type: 'success',
              message: `Stock for '${movement.product_name}' adjusted successfully. New stock: ${movement.stock_after} ${movement.unit}`,
            });
          }}
        />
      )}

      {/* Stock Ledger Audit Trail Modal */}
      {ledgerProduct && (
        <StockLedgerModal
          product={ledgerProduct}
          onClose={() => setLedgerProduct(null)}
        />
      )}
    </div>
  );
};
