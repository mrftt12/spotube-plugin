import type {
  IBrowseEndpoint,
  SpotubeBrowseSectionObject,
  SpotubePaginationResponseObject,
} from "@spotube-app/plugin";
import EdmLiveClient, {
  summaryToTrack,
} from "../clients/edm_live.js";

interface SectionDefinition {
  id: string;
  title: string;
  path: string;
  externalUri: string;
}

const SECTION_DEFINITIONS: SectionDefinition[] = [
  {
    id: "livesets-dj-mixes",
    title: "Latest Livesets & DJ Mixes",
    path: "/livesets-dj-mixes/",
    externalUri: "https://www.edmliveset.com/livesets-dj-mixes/",
  },
  {
    id: "classic-livesets",
    title: "Classic Livesets",
    path: "/classic-livesets/",
    externalUri: "https://www.edmliveset.com/classic-livesets/",
  },
];

export default class BrowseEndpoint implements IBrowseEndpoint {
  constructor(private readonly client: EdmLiveClient) {}

  async sections(
    offset = 0,
    limit = SECTION_DEFINITIONS.length
  ): Promise<SpotubePaginationResponseObject<SpotubeBrowseSectionObject>> {
    const start = Math.max(0, offset);
    const slice = SECTION_DEFINITIONS.slice(start, start + limit);

    const items = await Promise.all(
      slice.map(async (section) => {
        const range = await this.client.listingRange(section.path, 0, 12);
        return {
          typeName: "browse_section",
          id: section.id,
          title: section.title,
          externalUri: section.externalUri,
          browseMore: range.hasMore,
          items: range.items.map(summaryToTrack),
        } as SpotubeBrowseSectionObject;
      })
    );

    const total = SECTION_DEFINITIONS.length;
    const hasMore = start + slice.length < total;

    return {
      limit,
      nextOffset: hasMore ? start + slice.length : null,
      total,
      hasMore,
      items,
    };
  }

  async sectionItems<T extends { typeName: string }>(
    id: string,
    offset = 0,
    limit = 20
  ): Promise<SpotubePaginationResponseObject<T>> {
    const section = SECTION_DEFINITIONS.find((candidate) => candidate.id === id);
    if (!section) {
      throw new Error(`Unknown browse section: ${id}`);
    }

    const range = await this.client.listingRange(section.path, offset, limit);
    const tracks = range.items.map(summaryToTrack) as unknown as T[];

    return {
      limit,
      nextOffset: range.nextOffset,
      total: range.total,
      hasMore: range.hasMore,
      items: tracks,
    };
  }
}
