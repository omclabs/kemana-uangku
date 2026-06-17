import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import AuthGuard from './components/AuthGuard';
import AdminGuard from './components/AdminGuard';
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
import AccountTransactions from './pages/account/AccountTransactions';
import CategoryList from './pages/category/CategoryList';
import CategoryForm from './pages/category/CategoryForm';
import TransactionList from './pages/transaction/TransactionList';
import TransactionForm from './pages/transaction/TransactionForm';
import TransactionReceiptImport from './pages/transaction/TransactionReceiptImport';
import UserList from './pages/user/UserList';
import UserForm from './pages/user/UserForm';

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
          path="/account/:id/transaction"
          element={
            <AuthGuard>
              <AuthLayout>
                <AccountTransactions />
              </AuthLayout>
            </AuthGuard>
          }
        />
        <Route
          path="/account/:id/transactions"
          element={
            <AuthGuard>
              <AuthLayout>
                <AccountTransactions />
              </AuthLayout>
            </AuthGuard>
          }
        />
        <Route
          path="/config/budgets"
          element={
            <AuthGuard>
              <AuthLayout>
                <BudgetPage />
              </AuthLayout>
            </AuthGuard>
          }
        />
        <Route
          path="/config/categories"
          element={
            <AuthGuard>
              <AuthLayout>
                <CategoryList />
              </AuthLayout>
            </AuthGuard>
          }
        />
        <Route
          path="/config/categories/new"
          element={
            <AuthGuard>
              <AuthLayout>
                <CategoryForm />
              </AuthLayout>
            </AuthGuard>
          }
        />
        <Route
          path="/config/categories/:id/edit"
          element={
            <AuthGuard>
              <AuthLayout>
                <CategoryForm />
              </AuthLayout>
            </AuthGuard>
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
