import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import AuthGuard from './components/AuthGuard';
import AdminGuard from './components/AdminGuard';
import RoleGuard from './components/RoleGuard';
import Sidebar from './components/Sidebar';
import BottomNav from './components/BottomNav';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Config from './pages/Config';
import ChangePassword from './pages/ChangePassword';
import ConfigPreferences from './pages/ConfigPreferences';
import BudgetPage from './pages/budget/BudgetPage';
import AccountList from './pages/account/AccountList';
import AccountForm from './pages/account/AccountForm';
import AccountPayment from './pages/account/AccountPayment';
import AccountTransactions from './pages/account/AccountTransactions';
import CategoryList from './pages/category/CategoryList';
import CategoryForm from './pages/category/CategoryForm';
import CategoryTransactions from './pages/category/CategoryTransactions';
import TransactionList from './pages/transaction/TransactionList';
import TransactionForm from './pages/transaction/TransactionForm';
import TransactionReceiptImport from './pages/transaction/TransactionReceiptImport';
import TransactionCsvImport from './pages/transaction/TransactionCsvImport';
import UserList from './pages/user/UserList';
import UserForm from './pages/user/UserForm';
import TrackedItemList from './pages/tracked-item/TrackedItemList';
import TrackedItemForm from './pages/tracked-item/TrackedItemForm';
import TrackedItemAlerts from './pages/tracked-item/TrackedItemAlerts';

function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-canvas md:h-screen md:overflow-hidden">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col bg-bg md:h-screen md:overflow-hidden">
        <main className="flex-1 pb-16 md:overflow-y-auto md:pb-0">{children}</main>
        <BottomNav />
      </div>
    </div>
  );
}

function LegacyCategoryEditRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/config/categories/${id}/edit` : '/config/categories'} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route
          path="/dashboard"
          element={
            <AuthGuard>
              <AuthLayout>
                <Dashboard />
              </AuthLayout>
            </AuthGuard>
          }
        />
        <Route
          path="/transactions"
          element={
            <AuthGuard>
              <AuthLayout>
                <TransactionList />
              </AuthLayout>
            </AuthGuard>
          }
        />
        <Route
          path="/transactions/new"
          element={
            <AuthGuard>
              <AuthLayout>
                <TransactionForm />
              </AuthLayout>
            </AuthGuard>
          }
        />
        <Route
          path="/transactions/import"
          element={
            <RoleGuard allowedRoles={['admin', 'user']}>
              <AuthLayout>
                <TransactionReceiptImport />
              </AuthLayout>
            </RoleGuard>
          }
        />
        <Route
          path="/transactions/import-csv"
          element={
            <RoleGuard allowedRoles={['admin', 'user']}>
              <AuthLayout>
                <TransactionCsvImport />
              </AuthLayout>
            </RoleGuard>
          }
        />
        <Route
          path="/transactions/:id/edit"
          element={
            <AuthGuard>
              <AuthLayout>
                <TransactionForm />
              </AuthLayout>
            </AuthGuard>
          }
        />
        <Route
          path="/tracked-items/alerts"
          element={
            <RoleGuard allowedRoles={['admin', 'user']}>
              <AuthLayout>
                <TrackedItemAlerts />
              </AuthLayout>
            </RoleGuard>
          }
        />
        <Route
          path="/accounts"
          element={
            <RoleGuard allowedRoles={['admin', 'user']}>
              <AuthLayout>
                <AccountList />
              </AuthLayout>
            </RoleGuard>
          }
        />
        <Route
          path="/accounts/new"
          element={
            <RoleGuard allowedRoles={['admin', 'user']}>
              <AuthLayout>
                <AccountForm />
              </AuthLayout>
            </RoleGuard>
          }
        />
        <Route
          path="/accounts/:id/edit"
          element={
            <RoleGuard allowedRoles={['admin', 'user']}>
              <AuthLayout>
                <AccountForm />
              </AuthLayout>
            </RoleGuard>
          }
        />
        <Route
          path="/account/:id/transaction"
          element={
            <RoleGuard allowedRoles={['admin', 'user']}>
              <AuthLayout>
                <AccountTransactions />
              </AuthLayout>
            </RoleGuard>
          }
        />
        <Route
          path="/account/:id/transactions"
          element={
            <RoleGuard allowedRoles={['admin', 'user']}>
              <AuthLayout>
                <AccountTransactions />
              </AuthLayout>
            </RoleGuard>
          }
        />
        <Route
          path="/categories/:id/transactions"
          element={
            <RoleGuard allowedRoles={['admin', 'user']}>
              <AuthLayout>
                <CategoryTransactions />
              </AuthLayout>
            </RoleGuard>
          }
        />
        <Route
          path="/account/:id/payment"
          element={
            <RoleGuard allowedRoles={['admin', 'user']}>
              <AuthLayout>
                <AccountPayment />
              </AuthLayout>
            </RoleGuard>
          }
        />
        <Route
          path="/accounts/:id/payment"
          element={
            <RoleGuard allowedRoles={['admin', 'user']}>
              <AuthLayout>
                <AccountPayment />
              </AuthLayout>
            </RoleGuard>
          }
        />
        <Route
          path="/config/budgets"
          element={
            <RoleGuard allowedRoles={['admin', 'user']}>
              <AuthLayout>
                <BudgetPage />
              </AuthLayout>
            </RoleGuard>
          }
        />
        <Route
          path="/config/categories"
          element={
            <RoleGuard allowedRoles={['admin', 'user']}>
              <AuthLayout>
                <CategoryList />
              </AuthLayout>
            </RoleGuard>
          }
        />
        <Route
          path="/config/tracked-items"
          element={
            <RoleGuard allowedRoles={['admin', 'user']}>
              <AuthLayout>
                <TrackedItemList />
              </AuthLayout>
            </RoleGuard>
          }
        />
        <Route
          path="/config/tracked-items/new"
          element={
            <RoleGuard allowedRoles={['admin', 'user']}>
              <AuthLayout>
                <TrackedItemForm />
              </AuthLayout>
            </RoleGuard>
          }
        />
        <Route
          path="/config/tracked-items/:id/edit"
          element={
            <RoleGuard allowedRoles={['admin', 'user']}>
              <AuthLayout>
                <TrackedItemForm />
              </AuthLayout>
            </RoleGuard>
          }
        />
        <Route
          path="/config/categories/new"
          element={
            <RoleGuard allowedRoles={['admin', 'user']}>
              <AuthLayout>
                <CategoryForm />
              </AuthLayout>
            </RoleGuard>
          }
        />
        <Route
          path="/config/categories/:id/edit"
          element={
            <RoleGuard allowedRoles={['admin', 'user']}>
              <AuthLayout>
                <CategoryForm />
              </AuthLayout>
            </RoleGuard>
          }
        />
        <Route path="/categories" element={<Navigate to="/config/categories" replace />} />
        <Route path="/categories/new" element={<Navigate to="/config/categories/new" replace />} />
        <Route path="/categories/:id/edit" element={<LegacyCategoryEditRedirect />} />
        <Route
          path="/config"
          element={
            <AuthGuard>
              <AuthLayout>
                <Config />
              </AuthLayout>
            </AuthGuard>
          }
        />
        <Route
          path="/config/preferences"
          element={
            <RoleGuard allowedRoles={['admin', 'user']}>
              <AuthLayout>
                <ConfigPreferences />
              </AuthLayout>
            </RoleGuard>
          }
        />
        <Route
          path="/config/change-password"
          element={
            <AuthGuard>
              <AuthLayout>
                <ChangePassword />
              </AuthLayout>
            </AuthGuard>
          }
        />
        <Route
          path="/config/users"
          element={
            <AdminGuard>
              <AuthLayout>
                <UserList />
              </AuthLayout>
            </AdminGuard>
          }
        />
        <Route
          path="/config/users/new"
          element={
            <AdminGuard>
              <AuthLayout>
                <UserForm />
              </AuthLayout>
            </AdminGuard>
          }
        />
        <Route
          path="/config/users/:id/edit"
          element={
            <AdminGuard>
              <AuthLayout>
                <UserForm />
              </AuthLayout>
            </AdminGuard>
          }
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
