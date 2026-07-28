const fs = require('fs');
const path = require('path');

const authServicePath = path.join(process.cwd(), 'src', 'services', 'authService.ts');
let authCode = fs.readFileSync(authServicePath, 'utf-8');
authCode = authCode.replace(/user\.adminRole\?\.permissions/g, '(user as any).adminRole?.permissions');
authCode = authCode.replace(/user\.adminRole\.permissions/g, '(user as any).adminRole.permissions');
fs.writeFileSync(authServicePath, authCode);

const userControllerPath = path.join(process.cwd(), 'src', 'controllers', 'UserController.ts');
let ucCode = fs.readFileSync(userControllerPath, 'utf-8');

// The getProfile method should be:
// res.json({ success: true, data: { ...userData, permissions: mergedPermissions } });

// But in updateProfile, we just want to revert it back to normal.
// Actually, let's fix the type errors in updateProfile instead of reverting it if we want to keep mergedPermissions. Wait, I'll just remove mergedPermissions from updateProfile for now, because updateProfile returns the same select which doesn't have permissions or adminRole.

const updateProfileMatch = ucCode.match(/updateProfile = asyncHandler.*?res\.json.*?;/s);
if (updateProfileMatch) {
  let updateCode = updateProfileMatch[0];
  // Revert the bottom part of updateProfile
  updateCode = updateCode.replace(/let mergedPermissions: string\[\].*?res\.json\(\{ success: true, data: \{ \.\.\.userData, permissions: mergedPermissions \} \}\);/s, 'res.json({ success: true, data: user });');
  ucCode = ucCode.replace(updateProfileMatch[0], updateCode);
  fs.writeFileSync(userControllerPath, ucCode);
}
console.log('Fixed TS errors.');
