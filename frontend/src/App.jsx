import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/routing/ProtectedRoute.jsx';
import UnifiedLayout from './components/layout/UnifiedLayout.jsx';
import { ROLES } from './config/constants.js';

import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';

import Customers from './pages/Customers.jsx';
import CustomerDetail from './pages/CustomerDetail.jsx';
import Orders from './pages/Orders.jsx';
import OrderForm from './pages/OrderForm.jsx';
import Payments from './pages/Payments.jsx';
import Bills from './pages/Bills.jsx';
import Reports from './pages/Reports.jsx';
import Inventory from './pages/Inventory.jsx';
import Profile from './pages/Profile.jsx';

import Users from './pages/admin/Users.jsx';
import Settings from './pages/admin/Settings.jsx';

const ADMIN_ONLY = [ROLES.ADMIN];

/**
 * Single unified router. Every authenticated route lives under the shared
 * UnifiedLayout. Admin-only routes carry an `allow` list; the backend enforces
 * the same rule, so hiding the menu item is never the only protection.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <UnifiedLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="profile" element={<Profile />} />

        {/* Admin + accountant */}
        <Route path="customers" element={<Customers />} />
        <Route path="customers/:id" element={<CustomerDetail />} />
        <Route path="orders" element={<Orders />} />
        <Route path="orders/new" element={<OrderForm />} />
        <Route path="orders/:id/edit" element={<OrderForm />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="payments" element={<Payments />} />
        <Route path="bills" element={<Bills />} />
        <Route path="reports" element={<Reports />} />

        {/* Admin only */}
        <Route path="users" element={<ProtectedRoute allow={ADMIN_ONLY}><Users /></ProtectedRoute>} />
        <Route path="settings" element={<ProtectedRoute allow={ADMIN_ONLY}><Settings /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

