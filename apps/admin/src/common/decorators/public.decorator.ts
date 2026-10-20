import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

/** 标记免鉴权路由；当前骨架尚未接入鉴权守卫，为后续模块预留 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
