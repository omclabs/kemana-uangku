import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AuthGuard from './components/AuthGuard';
import Sidebar from './components/Sidebar';
import BottomNav from './components/BottomNav';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Config from './pages/Config';
import ChangePassword from './pages/ChangePassword';
import ConfigPreferences from './pages/ConfigPreferences';
import AccountList from './pages/account/AccountList';
import AccountForm from './pages/account/AccountForm';
import CategoryList from './pages/category/CategoryList';
import CategoryForm from './pages/category/CategoryForm';
import TransactionList from './pages/transaction/TransactionList';
import TransactionForm from './pages/transaction/TransactionForm';
import TransactionReceiptImport from './pages/transaction/TransactionReceiptImport';

function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col bg-bg">
        <main className="flex-1 pb-16 md:pb-0">{children}</main>
        <BottomNav />
      </div>
    </div>
  );
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
            <AuthGuard>
              <AuthLayout>
                <TransactionReceiptImport />
              </AuthLayout>
            </AuthGuard>
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
          path="/accounts"
          element={
            <AuthGuard>
              <AuthLayout>
                <AccountList />
              </AuthLayout>
            </AuthGuard>
          }
        />
        <Route
          path="/accounts/new"
          element={
            <AuthGuard>
              <AuthLayout>
                <AccountForm />
              </AuthLayout>
            </AuthGuard>
          }
        />
        <Route
          path="/accounts/:id/edit"
          element={
            <AuthGuard>
              <AuthLayout>
                <AccountForm />
              </AuthLayout>
            </AuthGuard>
          }
        />
        <Route
          path="/categories"
          element={
            <AuthGuard>
              <AuthLayout>
                <CategoryList />
              </AuthLayout>
            </AuthGuard>
          }
        />
        <Route
          path="/categories/new"
          element={
            <AuthGuard>
              <AuthLayout>
                <CategoryForm />
              </AuthLayout>
            </AuthGuard>
          }
        />
        <Route
          path="/categories/:id/edit"
          element={
            <AuthGuard>
              <AuthLayout>
                <CategoryForm />
              </AuthLayout>
            </AuthGuard>
          }
        />
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
            <AuthGuard>
              <AuthLayout>
                <ConfigPreferences />
              </AuthLayout>
            </AuthGuard>
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
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
