import type {
  ICoreEndpoint,
  PluginConfiguration,
  PluginUpdateAvailable,
  ScrobbleDetails,
} from "@spotube-app/plugin";

export default class CoreEndpoint implements ICoreEndpoint {
  async checkUpdate(
    _pluginConfig: PluginConfiguration
  ): Promise<PluginUpdateAvailable | null> {
    return null;
  }

  support(): string {
    return [
      "### EDM Live Sets Plugin",
      "",
      "- Source: https://www.edmliveset.com",
      "- Built for Spotube and maintained by the community.",
      "- Please report plugin-specific issues at https://github.com/KRTirtho/spotube.",
    ].join("\n");
  }

  async scrobble(_details: ScrobbleDetails): Promise<void> {
    // The EDM Live catalog doesn't expose a scrobbling API.
  }
}
