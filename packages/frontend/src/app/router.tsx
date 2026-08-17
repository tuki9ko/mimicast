/**
 * ルート定義。React Router への依存はこのファイルと pages 層へ限定する（設計 3.4）。
 * Astro へ移行する場合、置き換えるのは主にこの層とする。
 */

import { createBrowserRouter } from "react-router-dom";

import { LoginPage } from "../pages/LoginPage.tsx";
import { NotFoundPage } from "../pages/NotFoundPage.tsx";
import { VideoDetailPage } from "../pages/VideoDetailPage.tsx";
import { VideoListPage } from "../pages/VideoListPage.tsx";
import { VideoUploadPage } from "../pages/VideoUploadPage.tsx";
import { AppLayout } from "./AppLayout.tsx";
import { RequireAuth } from "./RequireAuth.tsx";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    path: "/",
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <VideoListPage /> },
      { path: "upload", element: <VideoUploadPage /> },
      { path: "videos/:id", element: <VideoDetailPage /> },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
]);
