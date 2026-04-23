import { GatewayClient } from "../../gateway/client";
import type { SettingsPanel } from "./panel";

export class SettingsController {
  private readonly client: GatewayClient;
  private readonly panel: SettingsPanel;
  private connected = false;

  constructor(client: GatewayClient, panel: SettingsPanel) {
    this.client = client;
    this.panel = panel;
    this.panel.onRefresh = () => this.refresh();
  }

  setConnected(connected: boolean): void {
    this.connected = connected;
    if (!connected) {
      this.panel.setWaiting();
    }
  }

  async refresh(): Promise<void> {
    if (!this.connected) {
      this.panel.setWaiting();
      return;
    }
    this.panel.setLoading();
    try {
      const snapshot = await this.client.request<unknown>("config.get", {});
      this.panel.setLoaded(snapshot);
    } catch {
      this.panel.setError();
    }
  }
}
