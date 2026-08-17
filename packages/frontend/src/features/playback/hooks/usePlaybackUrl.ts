import { useMutation } from "@tanstack/react-query";

import type { PlaybackUrlResponse } from "@mimicast/shared";

import * as videosApi from "../../../lib/api/videos.ts";

export function usePlaybackUrl(id: string) {
  return useMutation<PlaybackUrlResponse, Error, number>({
    mutationFn: (expiresIn: number) =>
      videosApi.createPlaybackUrl(id, expiresIn),
  });
}
