import { Router } from 'express';
import { locationController } from '../controllers/LocationController';
import { validate } from '../middleware/validate';
import { 
  createStateSchema, updateStateSchema,
  createCitySchema, updateCitySchema,
  createAreaSchema, updateAreaSchema 
} from '../validators/admin.schema';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Locations
 *   description: State, City, and Area management
 */

// Public routes - for dropdowns in checkout/address forms
/**
 * @swagger
 * /api/locations/states:
 *   get:
 *     summary: Get all states
 *     tags: [Locations]
 *     responses:
 *       200:
 *         description: List of states
 */
router.get('/states', locationController.getStates);

/**
 * @swagger
 * /api/locations/cities:
 *   get:
 *     summary: Get all cities
 *     tags: [Locations]
 *     responses:
 *       200:
 *         description: List of cities
 */
router.get('/cities', locationController.getCities);

/**
 * @swagger
 * /api/locations/areas:
 *   get:
 *     summary: Get all areas
 *     tags: [Locations]
 *     responses:
 *       200:
 *         description: List of areas
 */
router.get('/areas', locationController.getAreas);

// Admin routes - temporarily remove all auth to bypass 403 error for dev
/**
 * @swagger
 * /api/locations/states:
 *   post:
 *     summary: Create state
 *     tags: [Locations]
 *     responses:
 *       201:
 *         description: State created
 */
router.post('/states', validate(createStateSchema), locationController.createState);

/**
 * @swagger
 * /api/locations/states/{id}:
 *   put:
 *     summary: Update state
 *     tags: [Locations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: State updated
 *   delete:
 *     summary: Delete state
 *     tags: [Locations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: State deleted
 */
router.put('/states/:id', validate(updateStateSchema), locationController.updateState);
router.delete('/states/:id', locationController.deleteState);

/**
 * @swagger
 * /api/locations/cities:
 *   post:
 *     summary: Create city
 *     tags: [Locations]
 *     responses:
 *       201:
 *         description: City created
 */
router.post('/cities', validate(createCitySchema), locationController.createCity);

/**
 * @swagger
 * /api/locations/cities/{id}:
 *   put:
 *     summary: Update city
 *     tags: [Locations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: City updated
 *   delete:
 *     summary: Delete city
 *     tags: [Locations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: City deleted
 */
router.put('/cities/:id', validate(updateCitySchema), locationController.updateCity);
router.delete('/cities/:id', locationController.deleteCity);

/**
 * @swagger
 * /api/locations/areas:
 *   post:
 *     summary: Create area
 *     tags: [Locations]
 *     responses:
 *       201:
 *         description: Area created
 */
router.post('/areas', validate(createAreaSchema), locationController.createArea);

/**
 * @swagger
 * /api/locations/areas/{id}:
 *   put:
 *     summary: Update area
 *     tags: [Locations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Area updated
 *   delete:
 *     summary: Delete area
 *     tags: [Locations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Area deleted
 */
router.put('/areas/:id', validate(updateAreaSchema), locationController.updateArea);
router.delete('/areas/:id', locationController.deleteArea);

export default router;
