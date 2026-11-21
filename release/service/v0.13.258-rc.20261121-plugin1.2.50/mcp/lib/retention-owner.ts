import {BridgeError, type User} from './bridge-engine.ts';
/** ID is configured by the installer from canonical get_profile, never first-caller binding.
 * caller() must be Sites dispatch's verified identity; a device bearer is insufficient. */
export function requireMaintenanceOwner(user: User, installedOwner: string | undefined) {
  if (!user.id?.trim()) throw new BridgeError('UNAUTHENTICATED',401);
  if (!installedOwner?.trim() || installedOwner.length>256) throw new BridgeError('MAINTENANCE_OWNER_NOT_CONFIGURED',503);
  if (user.id!==installedOwner) throw new BridgeError('MAINTENANCE_OWNER_REQUIRED',403);
}
