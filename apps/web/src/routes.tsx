import type { RouteObject } from "react-router";
import { SandboxLayout } from "@/components/sandbox-layout";
import { ComparePage } from "@/pages/compare";
import { LoginPage } from "@/pages/login";
import { NotFoundPage } from "@/pages/not-found";
import { RegisterPage } from "@/pages/register";
import { WorldPage } from "@/pages/world";
import { WorldDebugPage } from "@/pages/world-debug";
import { WorldsPage } from "@/pages/worlds";

/** 沙盘全部公开；登录/注册保留为独立页面，不进入沙盘布局。 */
export const routes: RouteObject[] = [
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  {
    element: <SandboxLayout />,
    children: [
      { index: true, element: <WorldsPage /> },
      { path: "world/:id", element: <WorldPage /> },
      { path: "world/:id/debug", element: <WorldDebugPage /> },
      { path: "compare/:a", element: <ComparePage /> },
      { path: "compare/:a/:b", element: <ComparePage /> },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
];
