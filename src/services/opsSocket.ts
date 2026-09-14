import { socketManager } from "../core/socket.js";

export const ADMIN_OPS_ROOM = "admin_OPS";

export type OpsDomain =
  | "bookings"
  | "approvals"
  | "whatsapp"
  | "payments"
  | "clinics"
  | "support"
  | "reviews";

export async function broadcastOpsInvalidate(domain: OpsDomain): Promise<void> {
  const payload = JSON.stringify({ event: "ops_invalidate", domain });
  await socketManager.broadcastToRoom(ADMIN_OPS_ROOM, payload);
  // Also push to legacy admin help pool listeners.
  await socketManager.broadcastToAdmins({
    event: "ops_invalidate",
    domain,
  });
}
