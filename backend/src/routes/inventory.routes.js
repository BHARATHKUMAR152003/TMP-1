import { Router } from 'express';
import * as inventoryController from '../controllers/inventory.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { ROLES } from '../constants/roles.js';

const router = Router();
router.use(authenticate);

// Inventory is a standalone module both roles maintain; it is never touched
// automatically by orders.
const staff = authorize(ROLES.ACCOUNTANT);

router.get('/', staff, inventoryController.list);
router.post('/', staff, inventoryController.create);

// Taxonomy routes are declared before /:id so the string segments resolve
// unambiguously.
router.get('/taxonomy', staff, inventoryController.taxonomy);
router.get('/usage', staff, inventoryController.usage);

router.post('/groups', staff, inventoryController.createGroup);
router.put('/groups/:id', staff, inventoryController.updateGroup);
router.delete('/groups/:id', staff, inventoryController.removeGroup);

router.post('/categories', staff, inventoryController.createCategory);
router.put('/categories/:id', staff, inventoryController.updateCategory);
router.delete('/categories/:id', staff, inventoryController.removeCategory);

router.post('/types', staff, inventoryController.createType);
router.put('/types/:id', staff, inventoryController.updateType);
router.delete('/types/:id', staff, inventoryController.removeType);

router.post('/:id/consume', staff, inventoryController.consume);
router.post('/:id/adjust', staff, inventoryController.adjust);
router.put('/:id', staff, inventoryController.update);
router.delete('/:id', staff, inventoryController.remove);

export default router;

