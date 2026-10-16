import { Router } from 'express';
import authRoutes from './auth.routes.js';
import orderRoutes from './order.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import customerRoutes from './customer.routes.js';
import employeeRoutes from './employee.routes.js';
import categoryRoutes from './category.routes.js';
import inventoryRoutes from './inventory.routes.js';
import paymentRoutes from './payment.routes.js';
import financeRoutes from './finance.routes.js';
import reportRoutes from './report.routes.js';
import notificationRoutes from './notification.routes.js';
import settingsRoutes from './settings.routes.js';
import importRoutes from './import.routes.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ success: true, message: 'PrintPress API is healthy', timestamp: new Date().toISOString() });
});

router.use('/auth', authRoutes);
router.use('/orders', orderRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/customers', customerRoutes);
router.use('/employees', employeeRoutes);
router.use('/categories', categoryRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/payments', paymentRoutes);
router.use('/finance', financeRoutes);
router.use('/reports', reportRoutes);
router.use('/notifications', notificationRoutes);
router.use('/settings', settingsRoutes);
router.use('/import', importRoutes);

export default router;

