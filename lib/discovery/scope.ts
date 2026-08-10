import "server-only";

import { getCriteria, getProfile } from "../settings";
import { getDiscoveryConfig } from "./config";
import {
  formatDiscoveryScope,
  type DiscoveryScopeCopy,
} from "./scope-copy";

export async function getDiscoveryScopeCopy(): Promise<DiscoveryScopeCopy> {
  const [config, criteria, profile] = await Promise.all([
    getDiscoveryConfig(),
    getCriteria(),
    getProfile(),
  ]);
  return formatDiscoveryScope({ config, criteria, profile });
}
