import { Router } from 'express';
import * as financeController from '../controllers/finance.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { ROLES } from '../constants/roles.js';

const router = Router();
router.use(authenticate);

// Bills, invoices and their PDFs are available to both roles.
const staff = authorize(ROLES.ACCOUNTANT);

router.get('/invoices', staff, financeController.listInvoices);
router.get('/invoices/:id', staff, financeController.getInvoice);
router.get('/outstanding', staff, financeController.listOutstanding);
router.get('/bills', staff, financeController.listBills);
router.get('/financial-years', staff, financeController.listFinancialYears);
router.get('/orders/:id/bill.pdf', staff, financeController.billPdf);
// Cancelling an issued invoice is an admin decision.
router.post('/orders/:id/cancel', authorize(), financeController.cancelInvoice);

export default router;

