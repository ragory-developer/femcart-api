import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTags, createTag, updateTag, deleteTag } from '../controllers/TagController';

// Mock database connection
vi.mock('../config/database', () => {
  const mockPrisma = {
    tag: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  return {
    default: mockPrisma,
  };
});

// Import prisma directly from the mocked module for assertions
import prisma from '../config/database';

describe('TagController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getTags', () => {
    it('should fetch all tags sorted by name asc', async () => {
      const mockTags = [
        { id: '1', name: 'Apples', slug: 'apples' },
        { id: '2', name: 'Bananas', slug: 'bananas' },
      ];
      (prisma.tag.findMany as any).mockResolvedValue(mockTags);

      const req: any = {};
      const res: any = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await getTags(req, res);

      expect(prisma.tag.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
      });
      expect(res.json).toHaveBeenCalledWith({ success: true, data: mockTags });
    });

    it('should handle errors and return 500 status', async () => {
      (prisma.tag.findMany as any).mockRejectedValue(new Error('DB Error'));

      const req: any = {};
      const res: any = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await getTags(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: 'Failed to fetch tags' })
      );
    });
  });

  describe('createTag', () => {
    it('should return 400 if name is missing', async () => {
      const req: any = { body: {} };
      const res: any = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await createTag(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Name is required' });
    });

    it('should create tag if it does not exist', async () => {
      const req: any = { body: { name: 'New Tag' } };
      const res: any = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      (prisma.tag.findUnique as any).mockResolvedValue(null);
      const createdTag = { id: 'new-id', name: 'New Tag', slug: 'new-tag' };
      (prisma.tag.create as any).mockResolvedValue(createdTag);

      await createTag(req, res);

      expect(prisma.tag.findUnique).toHaveBeenCalledWith({ where: { slug: 'new-tag' } });
      expect(prisma.tag.create).toHaveBeenCalledWith({
        data: { name: 'New Tag', slug: 'new-tag' },
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: createdTag });
    });

    it('should return existing tag if tag already exists without creating new one', async () => {
      const req: any = { body: { name: 'Existing Tag' } };
      const res: any = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      const existingTag = { id: 'existing-id', name: 'Existing Tag', slug: 'existing-tag' };
      (prisma.tag.findUnique as any).mockResolvedValue(existingTag);

      await createTag(req, res);

      expect(prisma.tag.findUnique).toHaveBeenCalledWith({ where: { slug: 'existing-tag' } });
      expect(prisma.tag.create).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: existingTag });
    });
  });

  describe('updateTag', () => {
    it('should update and return the updated tag', async () => {
      const req: any = { params: { id: 'tag-123' }, body: { name: 'Updated Tag Name' } };
      const res: any = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      const updatedTag = { id: 'tag-123', name: 'Updated Tag Name', slug: 'updated-tag-name' };
      (prisma.tag.update as any).mockResolvedValue(updatedTag);

      await updateTag(req, res);

      expect(prisma.tag.update).toHaveBeenCalledWith({
        where: { id: 'tag-123' },
        data: { name: 'Updated Tag Name', slug: 'updated-tag-name' },
      });
      expect(res.json).toHaveBeenCalledWith({ success: true, data: updatedTag });
    });
  });

  describe('deleteTag', () => {
    it('should delete the tag and return success message', async () => {
      const req: any = { params: { id: 'tag-123' } };
      const res: any = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      (prisma.tag.delete as any).mockResolvedValue({ id: 'tag-123' });

      await deleteTag(req, res);

      expect(prisma.tag.delete).toHaveBeenCalledWith({
        where: { id: 'tag-123' },
      });
      expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Tag deleted successfully' });
    });
  });
});
