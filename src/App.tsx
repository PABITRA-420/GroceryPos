import React, { useState, useEffect } from 'react';
import { MainLayout } from './layouts/MainLayout';
import { useTauriBridge } from './hooks/useTauriBridge';
import { Modal } from './components/ui/Modal';
import { Button } from './components/ui/Button';
import type { NavigationTab, ShopProfile } from './types';
import { authService, type AuthState } from './services/authService';
import { billingService } from './services/billingService';
import { PinAuthModal } from './components/auth/PinAuthModal';

// Page components
import { DashboardPage } from './pages/Dashboard/DashboardPage';
import { BillingPage } from './pages/Billing/BillingPage';
import { ProductsPage } from './pages/Products/ProductsPage';
import { CustomersPage } from './pages/Customers/CustomersPage';
import { PurchasesPage } from './pages/Purchases/PurchasesPage';
import { SalesPage } from './pages/Sales/SalesPage';
import { ReportsPage } from './pages/Reports/ReportsPage';
import { SettingsPage } from './pages/Settings/SettingsPage';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavigationTab>('dashboard');
  const [billingCartCount, setBillingCartCount] = useState<number>(0);
  const [pendingTab, setPendingTab] = useState<NavigationTab | null>(null);
  const [isDiscardModalOpen, setIsDiscardModalOpen] = useState(false);
  const [authState, setAuthState] = useState<AuthState>(authService.getState());
  const [shopProfile, setShopProfile] = useState<ShopProfile | null>(null);
  const [isSettingsPinModalOpen, setIsSettingsPinModalOpen] = useState(false);

  const { systemInfo, isLoading, isNative } = useTauriBridge();

  useEffect(() => {
    const unsub = authService.subscribe(setAuthState);
    billingService.getShopProfile().then(setShopProfile).catch(() => {});
    return unsub;
  }, []);

  const handleTabChange = (tab: NavigationTab) => {
    if (tab === currentTab) return;

    // Guard Settings page if not manager
    if (tab === 'settings' && !authService.isManager()) {
      setIsSettingsPinModalOpen(true);
      return;
    }

    // Unsaved bill protection: if leaving billing with items in cart, prompt merchant
    if (currentTab === 'billing' && billingCartCount > 0) {
      setPendingTab(tab);
      setIsDiscardModalOpen(true);
      return;
    }

    setCurrentTab(tab);
  };

  const handleConfirmDiscard = () => {
    if (pendingTab) {
      setBillingCartCount(0);
      setCurrentTab(pendingTab);
    }
    setPendingTab(null);
    setIsDiscardModalOpen(false);
  };

  const handleCancelDiscard = () => {
    setPendingTab(null);
    setIsDiscardModalOpen(false);
  };

  const renderActivePage = () => {
    switch (currentTab) {
      case 'dashboard':
        return (
          <DashboardPage
            systemInfo={systemInfo}
            isNative={isNative}
            onNavigate={handleTabChange}
          />
        );
      case 'billing':
        return <BillingPage onCartChange={setBillingCartCount} />;
      case 'products':
        return <ProductsPage />;
      case 'customers':
        return <CustomersPage />;
      case 'purchases':
        return <PurchasesPage />;
      case 'sales':
        return <SalesPage onNavigate={handleTabChange} />;
      case 'reports':
        return <ReportsPage />;
      case 'settings':
        return (
          <SettingsPage systemInfo={systemInfo} isNative={isNative} />
        );
      default:
        return (
          <DashboardPage
            systemInfo={systemInfo}
            isNative={isNative}
            onNavigate={handleTabChange}
          />
        );
    }
  };

  return (
    <>
      <MainLayout
        currentTab={currentTab}
        onTabChange={handleTabChange}
        systemInfo={systemInfo}
        isNative={isNative}
        isLoading={isLoading}
      >
        {renderActivePage()}
      </MainLayout>

      {/* Unsaved Bill Navigation Protection Modal */}
      <Modal
        isOpen={isDiscardModalOpen}
        onClose={handleCancelDiscard}
        title="Unfinished Bill in Progress"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            You have an unfinished bill with <strong>{billingCartCount} item(s)</strong> in the POS counter.
          </p>
          <p className="text-sm text-slate-600 font-medium">
            Discard this bill and leave Billing?
          </p>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="secondary" size="md" onClick={handleCancelDiscard}>
              Cancel
            </Button>
            <Button variant="danger" size="md" onClick={handleConfirmDiscard}>
              Discard & Leave
            </Button>
          </div>
        </div>
      </Modal>

      {/* Settings PIN Authorization Modal */}
      <PinAuthModal
        isOpen={isSettingsPinModalOpen}
        onClose={() => setIsSettingsPinModalOpen(false)}
        onSuccess={() => {
          setIsSettingsPinModalOpen(false);
          authService.verifyManagerPin(shopProfile?.manager_pin || '1234', shopProfile?.manager_pin || '1234');
          setCurrentTab('settings');
        }}
        title="Settings Authorization"
        description="Enter Manager PIN to access System Settings & Database"
        configuredPin={shopProfile?.manager_pin || '1234'}
      />

      {/* POS Terminal Lock Screen */}
      <PinAuthModal
        isOpen={authState.isLocked}
        onClose={() => {}}
        onSuccess={() => authService.unlockTerminal(shopProfile?.manager_pin || '1234', shopProfile?.manager_pin || '1234')}
        title="POS Terminal Locked"
        description="Enter PIN to resume billing"
        configuredPin={shopProfile?.manager_pin || '1234'}
        isLockScreen={true}
      />
    </>
  );
};

export default App;
