import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AuthGuard from './components/AuthGuard';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Transaction from './pages/Transaction';
import Config from './pages/Config';
import ChangePassword from './pages/ChangePassword';
import AccountList from './pages/account/AccountList';
import AccountForm from './pages/account/AccountForm';
import CategoryList from './pages/category/CategoryList';
import CategoryForm from './pages/category/CategoryForm';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Navigate to="/accounts" replace />} />
        <Route
          path="/dashboard"
          element={
            <AuthGuard>
              <Dashboard />
            </AuthGuard>
          }
        />
        <Route
          path="/transactions"
          element={
            <AuthGuard>
              <Transaction />
            </AuthGuard>
          }
        />
        <Route
          path="/accounts"
          element={
            <AuthGuard>
              <AccountList />
            </AuthGuard>
          }
        />
        <Route
          path="/accounts/new"
          element={
            <AuthGuard>
              <AccountForm />
            </AuthGuard>
          }
        />
        <Route
          path="/accounts/:id/edit"
          element={
            <AuthGuard>
              <AccountForm />
            </AuthGuard>
          }
        />
        <Route
          path="/categories"
          element={
            <AuthGuard>
              <CategoryList />
            </AuthGuard>
          }
        />
        <Route
          path="/categories/new"
          element={
            <AuthGuard>
              <CategoryForm />
            </AuthGuard>
          }
        />
        <Route
          path="/categories/:id/edit"
          element={
            <AuthGuard>
              <CategoryForm />
            </AuthGuard>
          }
        />
        <Route
          path="/config"
          element={
            <AuthGuard>
              <Config />
            </AuthGuard>
          }
        />
        <Route
          path="/config/change-password"
          element={
            <AuthGuard>
              <ChangePassword />
            </AuthGuard>
          }
        />
        <Route path="*" element={<Navigate to="/accounts" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
