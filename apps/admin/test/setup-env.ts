// e2e 环境隔离：内存库 + 测试环境 + 静默 info 日志
process.env.NODE_ENV ??= "test";
process.env.DB_PATH = ":memory:";
process.env.LOG_LEVEL ??= "error";
process.env.SANDBOX_LLM_PROVIDER = "fake";
