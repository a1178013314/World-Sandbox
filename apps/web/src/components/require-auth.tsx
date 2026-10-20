import { Navigate, Outlet } from "react-router";
import { useAuth } from "@/lib/auth";

/** 未登录一律回登录页；登录/注册页本身不挂在守卫之下，避免循环 */
export function RequireAuth() {
  const { token } = useAuth();
  return token ? <Outlet /> : <Navigate to="/login" replace />;
}
