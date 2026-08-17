import { RouterProvider } from "react-router-dom";

import { AuthProvider } from "./providers/AuthProvider.tsx";
import { QueryProvider } from "./providers/QueryProvider.tsx";
import { router } from "./router.tsx";

export function App() {
  return (
    <QueryProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryProvider>
  );
}
