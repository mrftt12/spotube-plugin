import type {
  ISearchEndpoint,
  SpotubeFullAlbumObject,
  SpotubeFullArtistObject,
  SpotubeFullPlaylistObject,
  SpotubePaginationResponseObject,
  SpotubeSearchResponseObject,
  SpotubeTrackObject,
} from "@spotube-app/plugin";
import EdmLiveClient, {
  summaryToTrack,
} from "../clients/edm_live.js";

function emptyPagination<T extends { typeName: string }>(
  limit: number
): SpotubePaginationResponseObject<T> {
  return {
    limit,
    nextOffset: null,
    total: 0,
    hasMore: false,
    items: [],
  };
}

export default class SearchEndpoint implements ISearchEndpoint {
  constructor(private readonly client: EdmLiveClient) {}

  chips(): string[] {
    return ["all", "tracks"];
  }

  async all(query: string): Promise<SpotubeSearchResponseObject> {
    const range = await this.client.searchRange(query, 0, 20);
    return {
      typeName: "search_response",
      albums: [],
      artists: [],
      playlists: [],
      tracks: range.items.map(summaryToTrack),
    };
  }

  async tracks(
    query: string,
    offset = 0,
    limit = 20
  ): Promise<SpotubePaginationResponseObject<SpotubeTrackObject>> {
    const range = await this.client.searchRange(query, offset, limit);
    return {
      limit,
      nextOffset: range.nextOffset,
      total: range.total,
      hasMore: range.hasMore,
      items: range.items.map(summaryToTrack),
    };
  }

  async albums(
    _query: string,
    _offset = 0,
    limit = 20
  ): Promise<SpotubePaginationResponseObject<SpotubeFullAlbumObject>> {
    return emptyPagination(limit);
  }

  async artists(
    _query: string,
    _offset = 0,
    limit = 20
  ): Promise<SpotubePaginationResponseObject<SpotubeFullArtistObject>> {
    return emptyPagination(limit);
  }

  async playlists(
    _query: string,
    _offset = 0,
    limit = 20
  ): Promise<SpotubePaginationResponseObject<SpotubeFullPlaylistObject>> {
    return emptyPagination(limit);
  }
}
