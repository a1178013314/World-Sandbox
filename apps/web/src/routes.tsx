import type { RouteObject } from "react-router";
import { AppLayout } from "@/components/app-layout";
import { RequireAuth } from "@/components/require-auth";
import { HomePage } from "@/pages/home";
import { LoginPage } from "@/pages/login";
import { NotFoundPage } from "@/pages/not-found";
import { RegisterPage } from "@/pages/register";

/** 路由表驱动：公开页 → 鉴权守卫 → 布局壳 → 业务页 → 兜底 404 */
export const routes: RouteObject[] = [
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [{ index: true, element: <HomePage /> }],
      },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
];
