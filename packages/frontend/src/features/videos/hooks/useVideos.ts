import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";

import {
  DEFAULT_PAGE_SIZE,
  type DistributionStatus,
  type ListVideosResponse,
  type VideoDto,
} from "@mimicast/shared";

import * as videosApi from "../../../lib/api/videos.ts";

const IN_PROGRESS_STATUSES = new Set(["UPLOADING", "UPLOADED", "TRANSCODING"]);

export const videoKeys = {
  all: ["videos"] as const,
  list: (cursor?: string) => ["videos", "list", cursor ?? null] as const,
  detail: (id: string) => ["videos", "detail", id] as const,
};

/** 変換中の動画があるあいだはポーリングする。 */
function refetchIntervalFor(
  videos: VideoDto[] | undefined,
): number | false {
  if (videos === undefined) return false;
  return videos.some((video) => IN_PROGRESS_STATUSES.has(video.status))
    ? 10_000
    : false;
}

export function useVideos(cursor?: string): UseQueryResult<ListVideosResponse> {
  return useQuery({
    queryKey: videoKeys.list(cursor),
    queryFn: () =>
      videosApi.listVideos(
        cursor === undefined
          ? { limit: DEFAULT_PAGE_SIZE }
          : { limit: DEFAULT_PAGE_SIZE, cursor },
      ),
    refetchInterval: (query) => refetchIntervalFor(query.state.data?.items),
  });
}

export function useVideo(id: string): UseQueryResult<VideoDto> {
  return useQuery({
    queryKey: videoKeys.detail(id),
    queryFn: () => videosApi.getVideo(id),
    refetchInterval: (query) =>
      query.state.data === undefined
        ? false
        : refetchIntervalFor([query.state.data]),
  });
}

export function useDeleteVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => videosApi.deleteVideo(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: videoKeys.all });
    },
  });
}

export function useUpdateDistribution(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (distributionStatus: DistributionStatus) =>
      videosApi.updateDistribution(id, distributionStatus),
    onSuccess: (updated) => {
      queryClient.setQueryData(videoKeys.detail(id), updated);
      void queryClient.invalidateQueries({ queryKey: videoKeys.all });
    },
  });
}
