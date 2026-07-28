import { Request, Response } from 'express';
import prisma from '../config/database';
import logger from '../utils/logger';

export const locationController = {

  // --- STATES ---
  getStates: async (_req: Request, res: Response) => {
    try {
      const states = await prisma.state.findMany({
        orderBy: { name: 'asc' },
        include: { _count: { select: { cities: true } } },
      });
      res.json({ success: true, data: states });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to fetch states.', error });
    }
  },

  createState: async (req: Request, res: Response) => {
    try {
      const { name, status } = req.body;
      const state = await prisma.state.create({
        data: { name, status: status || 'active' },
      });
      res.status(201).json({ success: true, data: state });
    } catch (error: any) {
      if (error.code === 'P2002') {
        return res.status(400).json({ success: false, message: 'State name already exists.' });
      }
      res.status(500).json({ success: false, message: 'Failed to create state.', error });
    }
  },

  updateState: async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { name, status } = req.body;
      const state = await prisma.state.update({ where: { id }, data: { name, status } });
      res.json({ success: true, data: state });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to update state.', error });
    }
  },

  deleteState: async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      await prisma.state.delete({ where: { id } });
      res.json({ success: true, message: 'State deleted successfully' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to delete state.', error });
    }
  },

  // --- CITIES ---
  getCities: async (req: Request, res: Response) => {
    try {
      const stateId = req.query.stateId as string | undefined;
      const cities = await prisma.city.findMany({
        where: stateId ? { stateId } : undefined,
        include: { state: true, _count: { select: { areas: true } } },
        orderBy: { name: 'asc' },
      });
      res.json({ success: true, data: cities });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to fetch cities.', error });
    }
  },

  createCity: async (req: Request, res: Response) => {
    try {
      const { name, stateId, status, deliveryCharge } = req.body;
      const city = await prisma.city.create({
        data: {
          name,
          stateId,
          status: status || 'active',
          deliveryCharge: parseFloat(deliveryCharge) || 0,
        },
        include: { state: true },
      });
      res.status(201).json({ success: true, data: city });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to create city.', error });
    }
  },

  updateCity: async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { name, stateId, status, deliveryCharge } = req.body;
      const city = await prisma.city.update({
        where: { id },
        data: {
          name,
          stateId,
          status,
          ...(deliveryCharge !== undefined && { deliveryCharge: parseFloat(deliveryCharge) || 0 }),
        },
        include: { state: true },
      });
      res.json({ success: true, data: city });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to update city.', error });
    }
  },

  deleteCity: async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      await prisma.city.delete({ where: { id } });
      res.json({ success: true, message: 'City deleted successfully' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to delete city.', error });
    }
  },

  // --- AREAS ---
  getAreas: async (req: Request, res: Response) => {
    try {
      const cityId = req.query.cityId as string | undefined;
      const stateId = req.query.stateId as string | undefined;

      let where: any = undefined;
      if (cityId) {
        where = { cityId };
      } else if (stateId) {
        where = { city: { stateId } };
      }

      const areas = await prisma.area.findMany({
        where,
        include: { city: { include: { state: true } } },
        orderBy: [{ city: { name: 'asc' } }, { name: 'asc' }],
      });
      res.json({ success: true, data: areas });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to fetch areas.', error });
    }
  },

  createArea: async (req: Request, res: Response) => {
    try {
      const { name, cityId, status, deliveryCharge } = req.body;
      const area = await prisma.area.create({
        data: {
          name,
          cityId,
          status: status || 'active',
          deliveryCharge: parseFloat(deliveryCharge) || 0,
        },
        include: { city: { include: { state: true } } },
      });
      res.status(201).json({ success: true, data: area });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to create area.', error });
    }
  },

  updateArea: async (req: Request, res: Response) => {
    logger.debug('updateArea controller called', { body: req.body });
    try {
      const id = req.params.id as string;
      const { name, cityId, status, deliveryCharge } = req.body;
      const area = await prisma.area.update({
        where: { id },
        data: {
          name,
          cityId,
          status,
          ...(deliveryCharge !== undefined && { deliveryCharge: parseFloat(deliveryCharge) || 0 }),
        },
        include: { city: { include: { state: true } } },
      });
      res.json({ success: true, data: area });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to update area.', error });
    }
  },

  deleteArea: async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      await prisma.area.delete({ where: { id } });
      res.json({ success: true, message: 'Area deleted successfully' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to delete area.', error });
    }
  },
};
