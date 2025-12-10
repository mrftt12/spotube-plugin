import { HTMLElement, parse } from "node-html-parser";
import type {
  SpotubeAlbumType,
  SpotubeImageObject,
  SpotubeSimpleAlbumObject,
  SpotubeSimpleArtistObject,
  SpotubeTrackObject,
} from "@spotube-app/plugin";

const BASE_URL = "https://www.edmliveset.com";
const TRACK_ID_PREFIX = "edmlive:";
const DEFAULT_PAGE_SIZE = 12;
const USER_AGENT = "Spotube-EDMLive-Plugin/1.0 (+https://spotube.org)";

export interface TrackSummary {
  id: string;
  title: string;
  url: string;
  image: string | null;
  artists: string[];
  addedDate: string | null;
}

export interface TrackDetail extends TrackSummary {
  genres: string[];
  event: string | null;
  audioUrl: string | null;
  durationMs: number;
}

interface ListingPage {
  posts: TrackSummary[];
  pageSize: number;
  total: number;
}

interface RangeResult {
  items: TrackSummary[];
  total: number;
  nextOffset: number | null;
  hasMore: boolean;
}

function normalizeArtist(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function ensureArtists(artists: string[]): string[] {
  const cleaned = artists.map(normalizeArtist).filter(Boolean);
  return cleaned.length > 0 ? cleaned : ["Unknown Artist"];
}

function buildArtistObjects(
  artists: string[],
  externalUri: string
): SpotubeSimpleArtistObject[] {
  return ensureArtists(artists).map((name) => ({
    typeName: "artist_simple",
    id: slugify(name) || `${TRACK_ID_PREFIX}${Math.random()}`,
    name,
    externalUri,
    images: null,
  }));
}

function buildAlbumObject(
  title: string,
  externalUri: string,
  artists: string[],
  image: string | null,
  releaseDate: string | null
): SpotubeSimpleAlbumObject {
  return {
    typeName: "album_simple",
    id: `${externalUri}#album`,
    name: title,
    externalUri,
    artists: buildArtistObjects(artists, externalUri),
    images: buildImageList(image),
    albumType: "Album" satisfies SpotubeAlbumType,
    releaseDate,
  };
}

function buildImageList(url: string | null): SpotubeImageObject[] {
  if (!url) return [];
  return [
    {
      typeName: "image",
      url,
      width: null,
      height: null,
    },
  ];
}

function guessArtistsFromTitle(title: string): string[] {
  const separators = [" - ", " – ", " — ", " — "];
  let artistBlock = title;
  for (const separator of separators) {
    const index = title.indexOf(separator);
    if (index > 0) {
      artistBlock = title.slice(0, index);
      break;
    }
  }

  const tokens = artistBlock.split(
    /\s+(?:b2b|vs\.?|x|and|feat\.?|ft\.?|with)\s+|[,;]+/gi
  );
  const cleaned = tokens
    .map((token) => token.replace(/\[[^\]]+\]/g, "").trim())
    .filter(Boolean);

  return ensureArtists(cleaned.length > 0 ? cleaned : [artistBlock]);
}

function parseDate(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const [day, month, year] = trimmed.split("/").map((part) => parseInt(part, 10));
    if (
      Number.isFinite(day) &&
      Number.isFinite(month) &&
      Number.isFinite(year)
    ) {
      return new Date(year, month - 1, day).toISOString().split("T")[0] ?? null;
    }
  }

  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString().split("T")[0] ?? null;
}

function normalizeUrl(url: string): string {
  try {
    return new URL(url, BASE_URL).toString();
  } catch {
    return url;
  }
}

function toTrackObject(summary: TrackSummary): SpotubeTrackObject {
  const artists = buildArtistObjects(summary.artists, summary.url);
  return {
    typeName: "track",
    id: summary.id,
    name: summary.title,
    externalUri: summary.url,
    artists,
    album: buildAlbumObject(
      summary.title,
      summary.url,
      summary.artists,
      summary.image,
      summary.addedDate
    ),
    durationMs: 0,
    isrc: "",
    explicit: false,
  };
}

function toDetailedTrackObject(detail: TrackDetail): SpotubeTrackObject {
  const artists = buildArtistObjects(detail.artists, detail.url);
  const albumName = detail.event ?? detail.title;
  return {
    typeName: "track",
    id: detail.id,
    name: detail.title,
    externalUri: detail.url,
    artists,
    album: buildAlbumObject(
      albumName,
      detail.url,
      detail.artists,
      detail.image,
      detail.addedDate
    ),
    durationMs: detail.durationMs,
    isrc: "",
    explicit: false,
  };
}

export function summaryToTrack(summary: TrackSummary): SpotubeTrackObject {
  return toTrackObject(summary);
}

export function detailToTrack(detail: TrackDetail): SpotubeTrackObject {
  return toDetailedTrackObject(detail);
}

export default class EdmLiveClient {
  private readonly trackCache = new Map<string, TrackDetail>();

  async listingRange(
    path: string,
    offset: number,
    limit: number
  ): Promise<RangeResult> {
    return this.collectRange(
      (page) => this.fetchListingPage(path, page),
      offset,
      limit
    );
  }

  async searchRange(
    query: string,
    offset: number,
    limit: number
  ): Promise<RangeResult> {
    return this.collectRange(
      (page) => this.fetchSearchPage(query, page),
      offset,
      limit
    );
  }

  async getTrack(idOrUrl: string): Promise<TrackDetail> {
    const url = this.resolveTrackUrl(idOrUrl);
    const id = this.idFromUrl(url);
    const cached = this.trackCache.get(id);
    if (cached) return cached;

    const document = await this.fetchDocument(url);
    const detail = this.parseTrackDetail(document, url);
    this.trackCache.set(id, detail);
    return detail;
  }

  private async collectRange(
    fetchPage: (page: number) => Promise<ListingPage>,
    offset: number,
    limit: number
  ): Promise<RangeResult> {
    const items: TrackSummary[] = [];
    let total = 0;
    let perPage = DEFAULT_PAGE_SIZE;
    let cursor = Math.max(0, offset);

    while (items.length < limit) {
      const page = Math.floor(cursor / perPage) + 1;
      const pageData = await fetchPage(page);
      if (pageData.pageSize > 0) {
        perPage = pageData.pageSize;
      }
      total = pageData.total;
      if (pageData.posts.length === 0) break;

      const startIndex = cursor % perPage;
      const chunk = pageData.posts.slice(startIndex);
      if (chunk.length === 0) break;

      for (const summary of chunk) {
        items.push(summary);
        cursor += 1;
        if (items.length >= limit) break;
      }

      if (cursor >= total) break;
    }

    const hasMore = offset + items.length < total;
    return {
      items,
      total,
      nextOffset: hasMore ? offset + items.length : null,
      hasMore,
    };
  }

  private async fetchListingPage(
    path: string,
    page: number
  ): Promise<ListingPage> {
    const url = this.buildListingUrl(path, page);
    const document = await this.fetchDocument(url);
    const grid = document.querySelector(".uc_post_grid_style_one");
    if (!grid) {
      return { posts: [], total: 0, pageSize: DEFAULT_PAGE_SIZE };
    }

    const queryDataRaw = grid.getAttribute("querydata");
    const queryData =
      queryDataRaw && queryDataRaw.length > 0
        ? this.safeParseQueryData(queryDataRaw)
        : null;
    const total = queryData?.total_posts ?? 0;
    const pageSize = queryData?.count_posts ?? DEFAULT_PAGE_SIZE;

    const posts = grid
      .querySelectorAll(".ue_post_grid_item")
      .map((item) => this.parseListingItem(item))
      .filter((item): item is TrackSummary => item !== null);

    return {
      posts,
      pageSize: pageSize || posts.length,
      total: total || posts.length,
    };
  }

  private async fetchSearchPage(
    query: string,
    page: number
  ): Promise<ListingPage> {
    const url = this.buildSearchUrl(query, page);
    const document = await this.fetchDocument(url);
    const container = document.querySelector(".elementor-posts-container");
    if (!container) {
      return { posts: [], total: 0, pageSize: DEFAULT_PAGE_SIZE };
    }

    const posts = container
      .querySelectorAll("article")
      .map((article) => this.parseSearchArticle(article))
      .filter((article): article is TrackSummary => article !== null);

    const perPage = posts.length || DEFAULT_PAGE_SIZE;
    const maxPageAttr =
      document
        .querySelector(".e-load-more-anchor")
        ?.getAttribute("data-max-page") ?? null;
    let totalPages = parseInt(maxPageAttr ?? "", 10);
    if (!Number.isFinite(totalPages) || totalPages <= 0) {
      totalPages = Math.max(page, 1);
    }

    return {
      posts,
      pageSize: perPage,
      total: totalPages * perPage,
    };
  }

  private parseListingItem(element: HTMLElement): TrackSummary | null {
    const titleNode = element.querySelector(".uc_post_title");
    const link = element.querySelector(
      ".uc_post_grid_style_one_image"
    ) as HTMLElement | null;
    const imageNode = element.querySelector(".uc_post_image img");

    const href = link?.getAttribute("href");
    const title = titleNode?.innerText?.trim();

    if (!href || !title) return null;

    const url = normalizeUrl(href);
    const id = this.idFromUrl(url);

    return {
      id,
      title,
      url,
      image: imageNode?.getAttribute("src") ?? null,
      artists: guessArtistsFromTitle(title),
      addedDate: null,
    };
  }

  private parseSearchArticle(article: HTMLElement): TrackSummary | null {
    const link =
      article.querySelector(".elementor-post__thumbnail__link") ??
      article.querySelector(".elementor-post__title a");
    const titleNode = article.querySelector(".elementor-post__title");
    const imageNode = article.querySelector(".elementor-post__thumbnail img");
    const dateNode = article.querySelector(".elementor-post-date");

    const href = link?.getAttribute("href");
    const title = titleNode?.innerText?.trim();
    if (!href || !title) return null;

    const url = normalizeUrl(href);
    const id = this.idFromUrl(url);
    const date = parseDate(dateNode?.innerText ?? null);

    return {
      id,
      title,
      url,
      image: imageNode?.getAttribute("src") ?? null,
      artists: guessArtistsFromTitle(title),
      addedDate: date,
    };
  }

  private parseTrackDetail(root: HTMLElement, url: string): TrackDetail {
    const headerImage = root
      .querySelector(".elementor-widget-theme-post-featured-image img")
      ?.getAttribute("src");

    const infoItems = root.querySelectorAll(
      ".elementor-post-info li.elementor-icon-list-item"
    );
    const artists = this.extractInfoValues(infoItems, "artist:") ?? [];
    const genres = this.extractInfoValues(infoItems, "genre:") ?? [];
    const event =
      this.extractInfoValues(infoItems, "event:")?.at(0) ??
      null;
    const addedDate =
      this.extractDateValue(infoItems, "added:") ??
      null;

    const audioUrl = this.extractAudioUrl(root);
    const durationMs = this.extractDurationMs(root);
    const titleNode = root.querySelector("h1");
    const title =
      titleNode?.innerText?.trim() ??
      root.querySelector(".entry-title")?.innerText?.trim() ??
      "Unknown Liveset";

    const id = this.idFromUrl(url);

    return {
      id,
      title,
      url,
      image: headerImage ?? null,
      artists:
        artists.length > 0 ? artists : guessArtistsFromTitle(title),
      addedDate,
      genres,
      event,
      audioUrl,
      durationMs,
    };
  }

  private extractInfoValues(
    items: HTMLElement[],
    label: string
  ): string[] | null {
    const lowerLabel = label.toLowerCase();
    for (const item of items) {
      const prefix = item
        .querySelector(".elementor-post-info__item-prefix")
        ?.innerText?.trim()
        .toLowerCase();
      if (!prefix || !prefix.startsWith(lowerLabel)) continue;
      const links = item.querySelectorAll("a");
      if (links.length > 0) {
        return links
          .map((link) => link.innerText?.trim())
          .filter(Boolean) as string[];
      }
      const textContent = item
        .querySelector(".elementor-post-info__item")
        ?.innerText?.replace(/^.*?:/, "")
        .trim();
      if (textContent) {
        return [textContent];
      }
    }
    return null;
  }

  private extractDateValue(
    items: HTMLElement[],
    label: string
  ): string | null {
    const values = this.extractInfoValues(items, label);
    if (values && values.length > 0) {
      return parseDate(values[0]);
    }
    const timeValue = items
      .find((item) =>
        item
          .querySelector(".elementor-post-info__item-prefix")
          ?.innerText?.trim()
          .toLowerCase()
          .startsWith(label.toLowerCase())
      )
      ?.querySelector("time")?.innerText;
    return parseDate(timeValue ?? null);
  }

  private extractAudioUrl(root: HTMLElement): string | null {
    const audioSource =
      root.querySelector("audio source")?.getAttribute("src") ??
      root
        .querySelector("audio a")
        ?.getAttribute("href") ??
      root
        .querySelector("a[href*='hearthis.at'][href*='listen']")
        ?.getAttribute("href");
    return audioSource ? normalizeUrl(audioSource) : null;
  }

  private extractDurationMs(root: HTMLElement): number {
    const content = root
      .querySelector(".elementor-widget-theme-post-content")
      ?.innerText;
    if (!content) return 0;

    const matches = Array.from(
      content.matchAll(/\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g)
    );
    if (matches.length === 0) return 0;

    const last = matches[matches.length - 1][1];
    return this.timestampToMs(last);
  }

  private timestampToMs(value: string): number {
    const parts = value.split(":").map((part) => parseInt(part, 10));
    if (parts.some((part) => Number.isNaN(part))) return 0;
    return parts
      .reverse()
      .reduce((acc, part, index) => acc + part * 60 ** index, 0) * 1000;
  }

  private async fetchDocument(url: string): Promise<HTMLElement> {
    const response = await fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to load ${url}: ${response.status}`);
    }
    const html = await response.text();
    return parse(html);
  }

  private buildListingUrl(path: string, page: number): string {
    const normalized = path.endsWith("/") ? path : `${path}/`;
    if (page <= 1) {
      return new URL(normalized, BASE_URL).toString();
    }
    return new URL(`${normalized}page/${page}/`, BASE_URL).toString();
  }

  private buildSearchUrl(query: string, page: number): string {
    const url = new URL("/", BASE_URL);
    if (page > 1) {
      url.pathname = `/page/${page}/`;
    }
    url.searchParams.set("s", query);
    url.searchParams.set("post_type", "post");
    return url.toString();
  }

  private safeParseQueryData(value: string): any | null {
    try {
      const normalized = value.replace(/&quot;/g, '"');
      return JSON.parse(normalized);
    } catch {
      return null;
    }
  }

  private resolveTrackUrl(idOrUrl: string): string {
    if (idOrUrl.startsWith(TRACK_ID_PREFIX)) {
      const relative = idOrUrl.slice(TRACK_ID_PREFIX.length);
      return new URL(relative, BASE_URL).toString();
    }
    return normalizeUrl(idOrUrl);
  }

  private idFromUrl(url: string): string {
    try {
      const { pathname } = new URL(url);
      const normalizedPath = pathname.endsWith("/")
        ? pathname.slice(0, -1)
        : pathname;
      return `${TRACK_ID_PREFIX}${normalizedPath || "/"}`;
    } catch {
      return `${TRACK_ID_PREFIX}${url}`;
    }
  }
}
