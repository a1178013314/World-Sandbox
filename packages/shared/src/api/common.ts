/**
 * 统一响应包装：需要附带提示语时使用；纯数据接口可直接返回 T。
 */
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

/** 分页请求参数（1-based） */
export interface PageQuery {
  page?: number;
  pageSize?: number;
}

/** 分页响应结构 */
export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface NormalizedPageQuery {
  page: number;
  pageSize: number;
  /** 供 TypeORM skip/offset 使用 */
  offset: number;
}

/** 把任意分页入参收敛成合法值：页码从 1 起、页大小封顶 MAX_PAGE_SIZE */
export function normalizePageQuery(query: PageQuery = {}): NormalizedPageQuery {
  const rawPage = query.page;
  const rawPageSize = query.pageSize;

  const page =
    typeof rawPage === "number" && Number.isFinite(rawPage) && rawPage >= 1
      ? Math.floor(rawPage)
      : 1;

  const pageSize =
    typeof rawPageSize === "number" && Number.isFinite(rawPageSize) && rawPageSize >= 1
      ? Math.min(Math.floor(rawPageSize), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

  return { page, pageSize, offset: (page - 1) * pageSize };
}
