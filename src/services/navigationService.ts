import prisma from '../config/database';

export class NavigationService {
  // --- Navbar APIs ---
  
  async getNavbar() {


    return prisma.navbarItem.findMany({
      where: { parentId: null },
      include: {
        children: {
          orderBy: { sortOrder: 'asc' },
          include: {
            children: {
              orderBy: { sortOrder: 'asc' }
            }
          }
        }
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createNavbarItem(data: any) {
    return prisma.navbarItem.create({ data });
  }

  async updateNavbarItem(id: string, data: any) {
    return prisma.navbarItem.update({ where: { id }, data });
  }

  async deleteNavbarItem(id: string) {
    const item = await prisma.navbarItem.findUnique({ where: { id } });
    if ((item as any)?.isSystem) {
      throw new Error("System navigation items cannot be deleted.");
    }
    return prisma.navbarItem.delete({ where: { id } });
  }

  async reorderNavbar(items: { id: string, sortOrder: number, parentId: string | null }[]) {
    // Run all updates in a transaction
    const transactions = items.map(item => 
      prisma.navbarItem.update({
        where: { id: item.id },
        data: { sortOrder: item.sortOrder, parentId: item.parentId }
      })
    );
    return prisma.$transaction(transactions);
  }

  async toggleNavbarStatus(id: string, isActive: boolean) {
    return prisma.navbarItem.update({ where: { id }, data: { isActive } });
  }

  // --- Footer APIs ---

  async getFooterSections() {
    return prisma.footerSection.findMany({
      include: {
        links: {
          orderBy: { sortOrder: 'asc' }
        }
      },
      orderBy: { sortOrder: 'asc' }
    });
  }

  async createFooterSection(data: any) {
    return prisma.footerSection.create({ data });
  }

  async updateFooterSection(id: string, data: any) {
    return prisma.footerSection.update({ where: { id }, data });
  }

  async deleteFooterSection(id: string) {
    return prisma.footerSection.delete({ where: { id } });
  }

  async reorderFooterSections(items: { id: string, sortOrder: number }[]) {
    const transactions = items.map(item => 
      prisma.footerSection.update({
        where: { id: item.id },
        data: { sortOrder: item.sortOrder }
      })
    );
    return prisma.$transaction(transactions);
  }

  async getFooterLinks(sectionId?: string) {
    const where = sectionId ? { sectionId } : {};
    return prisma.footerLink.findMany({
      where,
      orderBy: { sortOrder: 'asc' }
    });
  }

  async createFooterLink(data: any) {
    return prisma.footerLink.create({ data });
  }

  async updateFooterLink(id: string, data: any) {
    return prisma.footerLink.update({ where: { id }, data });
  }

  async deleteFooterLink(id: string) {
    return prisma.footerLink.delete({ where: { id } });
  }

  async reorderFooterLinks(items: { id: string, sortOrder: number, sectionId: string }[]) {
    const transactions = items.map(item => 
      prisma.footerLink.update({
        where: { id: item.id },
        data: { sortOrder: item.sortOrder, sectionId: item.sectionId }
      })
    );
    return prisma.$transaction(transactions);
  }
}
