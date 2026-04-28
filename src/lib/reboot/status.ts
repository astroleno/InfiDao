import { RouteError } from "@/lib/utils/errors";

export type RebootCapability = "search" | "annotate";

interface CapabilityState {
  ready: boolean;
  phase: string;
  message: string;
}

const CAPABILITY_STATES: Record<RebootCapability, CapabilityState> = {
  search: {
    ready: false,
    phase: "phase-2",
    message: "Reboot search contract is active, but the search closure lands in phase 2.",
  },
  annotate: {
    ready: false,
    phase: "phase-3",
    message: "Reboot annotation contract is active, but the annotation closure lands in phase 3.",
  },
};

export function createCapabilityNotReadyError(capability: RebootCapability): RouteError {
  const state = CAPABILITY_STATES[capability];

  return new RouteError(
    503,
    `${capability.toUpperCase()}_NOT_READY`,
    state.message,
    {
      capability,
      phase: state.phase,
    },
  );
}
