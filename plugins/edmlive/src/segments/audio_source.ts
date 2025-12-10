import type {
  IAudioSourceEndpoint,
  SpotubeAudioSourceContainerPreset,
  SpotubeAudioSourceMatchObject,
  SpotubeAudioSourceStreamObject,
  SpotubeTrackObject,
} from "@spotube-app/plugin";
import EdmLiveClient from "../clients/edm_live.js";

export default class AudioSourceEndpoint implements IAudioSourceEndpoint {
  private readonly presets: SpotubeAudioSourceContainerPreset[] = [
    {
      type: "lossy",
      data: {
        type: "lossy",
        name: "mp3",
        qualities: [{ bitrate: 320000 }],
      },
    },
  ];

  private readonly streamCache = new Map<string, string>();

  constructor(private readonly client: EdmLiveClient) {}

  supportedPresets(): SpotubeAudioSourceContainerPreset[] {
    return this.presets;
  }

  async matches(
    track: SpotubeTrackObject
  ): Promise<SpotubeAudioSourceMatchObject[]> {
    const detail = await this.client.getTrack(track.id);
    if (!detail.audioUrl) {
      return [];
    }

    this.streamCache.set(detail.id, detail.audioUrl);

    const thumbnail =
      detail.image ??
      track.album.images?.[0]?.url ??
      track.artists[0]?.images?.[0]?.url ??
      null;

    return [
      {
        typeName: "audio_source_match",
        id: detail.id,
        title: detail.title,
        artists: detail.artists,
        duration: detail.durationMs || track.durationMs || 0,
        thumbnail,
        externalUri: detail.url,
      },
    ];
  }

  async streams(
    matched: SpotubeAudioSourceMatchObject
  ): Promise<SpotubeAudioSourceStreamObject[]> {
    let stream = this.streamCache.get(matched.id);
    if (!stream) {
      const detail = await this.client.getTrack(matched.id);
      if (!detail.audioUrl) {
        return [];
      }
      stream = detail.audioUrl;
      this.streamCache.set(matched.id, stream);
    }

    return [
      {
        typeName: "audio_source_stream",
        url: stream,
        container: "mp3",
        type: "lossy",
        codec: "mp3",
        bitrate: 320000,
        bitDepth: null,
        sampleRate: 44100,
      },
    ];
  }
}
