import { saveGatewayConfig } from "../../config/gateway-config";
import type { SetupPanel } from "./panel";

export async function runFirstRunSetup(setup: SetupPanel | null): Promise<void> {
  if (!setup) {
    return;
  }
  setup.setOnSave(async (url, token) => {
    await saveGatewayConfig({ url, token: token ?? "" });
  });
  await setup.openAndWait();
}
