import type { HealthResponse } from "@/types";
import { HEALTH_STATUS_OK } from "@/types";
import { buildSuccessResponse } from "@/lib/utils/errors";

export async function GET() {
  return buildSuccessResponse<HealthResponse>({
    status: HEALTH_STATUS_OK,
  });
}
