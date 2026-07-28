const fs = require('fs');
const path = require('path');

const authServicePath = path.join(process.cwd(), 'src', 'services', 'authService.ts');
let code = fs.readFileSync(authServicePath, 'utf-8');

// Replace prisma.user.findUnique({ where: { email } }) with include
code = code.replace(
  /const user = await prisma\.user\.findUnique\(\{\s*where:\s*\{\s*email\s*\}\s*\}\);/g,
  `const user = await prisma.user.findUnique({ where: { email }, include: { adminRole: true } });`
);

// Replace prisma.user.findUnique({ where: { phone } }) with include
code = code.replace(
  /const user = await prisma\.user\.findUnique\(\{\s*where:\s*\{\s*phone\s*\}\s*\}\);/g,
  `const user = await prisma.user.findUnique({ where: { phone }, include: { adminRole: true } });`
);

// We need a helper to merge permissions
const mergeLogic = `
        permissions: Array.from(new Set([
          ...(user.permissions ? JSON.parse(user.permissions as any) : []),
          ...(user.adminRole?.permissions ? JSON.parse(user.adminRole.permissions as any) : [])
        ])),
`;

// Replace permissions line in completeRegistration, login, loginWithPhone
code = code.replace(
  /permissions:\s*user\.permissions\s*\?\s*JSON\.parse\(user\.permissions\s*as\s*any\)\s*:\s*\[\],/g,
  mergeLogic.trim()
);

fs.writeFileSync(authServicePath, code);
console.log('Updated authService.ts');

const userControllerPath = path.join(process.cwd(), 'src', 'controllers', 'UserController.ts');
let ucCode = fs.readFileSync(userControllerPath, 'utf-8');

// Update getProfile
ucCode = ucCode.replace(
  /select:\s*\{\s*id:\s*true,\s*email:\s*true,\s*name:\s*true,\s*phone:\s*true,\s*role:\s*true,\s*isGuest:\s*true,\s*address:\s*true,\s*city:\s*true,\s*area:\s*true,\s*gender:\s*true,\s*dateOfBirth:\s*true,\s*createdAt:\s*true,\s*avatar:\s*true,\s*notificationPrefs:\s*true\s*\},/g,
  `select: { id: true, email: true, name: true, phone: true, role: true, isGuest: true, address: true, city: true, area: true, gender: true, dateOfBirth: true, createdAt: true, avatar: true, notificationPrefs: true, permissions: true, adminRole: { select: { permissions: true } } },`
);

// Below in getProfile, merge permissions before sending
ucCode = ucCode.replace(
  /res\.json\(\{ success: true, data: user \}\);/g,
  `
    let mergedPermissions: string[] = [];
    if (user.permissions) mergedPermissions.push(...JSON.parse(user.permissions as any));
    if ((user as any).adminRole?.permissions) mergedPermissions.push(...JSON.parse((user as any).adminRole.permissions));
    mergedPermissions = Array.from(new Set(mergedPermissions));
    
    const { adminRole, ...userData } = user as any;
    res.json({ success: true, data: { ...userData, permissions: mergedPermissions } });
  `
);

fs.writeFileSync(userControllerPath, ucCode);
console.log('Updated UserController.ts');
