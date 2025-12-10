import type { ITrackEndpoint, SpotubeTrackObject } from "@spotube-app/plugin";
import EdmLiveClient, {
  detailToTrack,
  summaryToTrack,
} from "../clients/edm_live.js";

const DEFAULT_RADIO_LIMIT = 50;
const DEFAULT_BROWSE_PATH = "/livesets-dj-mixes/";

export default class TrackEndpoint implements ITrackEndpoint {
  constructor(private readonly client: EdmLiveClient) {}

  async getTrack(id: string): Promise<SpotubeTrackObject> {
    const detail = await this.client.getTrack(id);
    return detailToTrack(detail);
  }

  async save(_ids: string[]): Promise<void> {
    // EDM Live is a public catalog without user accounts,
    // so saving tracks is effectively a no-op.
  }

  async unsave(_ids: string[]): Promise<void> {
    // No-op for the same reason as save().
  }

  async radio(id: string): Promise<SpotubeTrackObject[]> {
    const [current, range] = await Promise.all([
      this.client.getTrack(id),
      this.client.listingRange(
        DEFAULT_BROWSE_PATH,
        0,
        DEFAULT_RADIO_LIMIT + 1
      ),
    ]);

    return range.items
      .filter((item) => item.id !== current.id)
      .slice(0, DEFAULT_RADIO_LIMIT)
      .map(summaryToTrack);
  }
}
