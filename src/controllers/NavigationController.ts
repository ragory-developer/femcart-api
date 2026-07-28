import { Request, Response } from 'express';
import { NavigationService } from '../services/navigationService';
import { asyncHandler } from '../utils/helpers';
import { BaseController } from './BaseController';

const service = new NavigationService();

export class NavigationController extends BaseController {
  
  // --- Navbar APIs ---
  getNavbar = asyncHandler(async (req: Request, res: Response) => {
    const items = await service.getNavbar();
    res.json({ success: true, data: items });
  });

  createNavbarItem = asyncHandler(async (req: Request, res: Response) => {
    const item = await service.createNavbarItem(req.body);
    res.json({ success: true, data: item });
  });

  updateNavbarItem = asyncHandler(async (req: Request, res: Response) => {
    const item = await service.updateNavbarItem(req.params.id as string, req.body);
    res.json({ success: true, data: item });
  });

  deleteNavbarItem = asyncHandler(async (req: Request, res: Response) => {
    await service.deleteNavbarItem(req.params.id as string);
    res.json({ success: true, message: 'Navigation item deleted successfully' });
  });

  reorderNavbar = asyncHandler(async (req: Request, res: Response) => {
    await service.reorderNavbar(req.body.items);
    res.json({ success: true, message: 'Reordered successfully' });
  });

  toggleNavbarStatus = asyncHandler(async (req: Request, res: Response) => {
    const item = await service.toggleNavbarStatus(req.params.id as string, req.body.isActive);
    res.json({ success: true, data: item });
  });

  // --- Footer Sections ---
  getFooterSections = asyncHandler(async (req: Request, res: Response) => {
    const sections = await service.getFooterSections();
    res.json({ success: true, data: sections });
  });

  createFooterSection = asyncHandler(async (req: Request, res: Response) => {
    const section = await service.createFooterSection(req.body);
    res.json({ success: true, data: section });
  });

  updateFooterSection = asyncHandler(async (req: Request, res: Response) => {
    const section = await service.updateFooterSection(req.params.id as string, req.body);
    res.json({ success: true, data: section });
  });

  deleteFooterSection = asyncHandler(async (req: Request, res: Response) => {
    await service.deleteFooterSection(req.params.id as string);
    res.json({ success: true, message: 'Navigation item deleted successfully' });
  });

  reorderFooterSections = asyncHandler(async (req: Request, res: Response) => {
    await service.reorderFooterSections(req.body.items);
    res.json({ success: true, message: 'Reordered successfully' });
  });

  // --- Footer Links ---
  getFooterLinks = asyncHandler(async (req: Request, res: Response) => {
    const links = await service.getFooterLinks(req.query.sectionId as string);
    res.json({ success: true, data: links });
  });

  createFooterLink = asyncHandler(async (req: Request, res: Response) => {
    const link = await service.createFooterLink(req.body);
    res.json({ success: true, data: link });
  });

  updateFooterLink = asyncHandler(async (req: Request, res: Response) => {
    const link = await service.updateFooterLink(req.params.id as string, req.body);
    res.json({ success: true, data: link });
  });

  deleteFooterLink = asyncHandler(async (req: Request, res: Response) => {
    await service.deleteFooterLink(req.params.id as string);
    res.json({ success: true, message: 'Navigation item deleted successfully' });
  });

  reorderFooterLinks = asyncHandler(async (req: Request, res: Response) => {
    await service.reorderFooterLinks(req.body.items);
    res.json({ success: true, message: 'Reordered successfully' });
  });
}
