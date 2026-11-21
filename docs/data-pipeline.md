# 全量 JSONL 数据流水线

## 运行环境与命令

流水线需要 Node.js 22.15 或更新的 22.x 版本。项目的 `.node-version` 已指定 `22.15.0`；Node 的 Zstandard 解压流从 v22.15.0 开始提供。

把 `year-YYYY.jsonl.zst` 文件放在项目根目录后运行：

```sh
npm run data:process
npm run db:init
npm run data:import
```

`data:process` 按年份流式解压、逐行校验和清洗，输出至 `data-batches/`。每个 SQL 文件最多 2,000 条记录；每条 INSERT 最多合并 200 行，并额外受 90 KB 安全阈值约束。大文本记录会让 INSERT 提前拆分。无效行和超大 SQL 行分别记录在 `logs/pipeline-errors.log`；已生成的批次不会被覆盖，重新处理会从该年份下一个批次号继续。

`db:init` 会创建 `shard_index` 表。`data:import` 使用 Wrangler 的 `--yes` 跳过远程执行确认，按年份和批次号串行导入，失败最多重试 3 次，错误写入 `logs/import-errors.log`。每个成功批次会记录在 `data-batches/.imported-batches.txt`，重复运行会跳过已完成文件。可用 `BATCH_DIR`、`D1_DATABASE`、`IMPORT_MAX_RETRIES` 覆盖默认值。

年份分桶固定为 `year % 6 + 1`，例如 2000 年写入 `R2_BUCKET_3`。批次文件会用 `INSERT OR IGNORE` 写入相应的 `shard_index` 行。

## R2 配置和对象格式

Wrangler 配置文件是根目录的 `wrangler.toml`，已声明 6 个绑定，对应桶名 `xingyaoziwei-shard-1` 至 `xingyaoziwei-shard-6`。部署前须在 Cloudflare R2 创建这 6 个桶。

API 使用 D1 的 `shard_index` 查年份对应的绑定，再从相应 R2 桶读取对象。对象 key 必须与完整命盘 key 完全相同，例如 `2000-01-01-0-male`。对象内容可以是原始 JSONL 记录（13 个维度位于 `c` 对象中），也可以是带 `text_overview` 等扁平字段的 JSON 记录。

当前两个脚本会生成和导入 D1 SQL；它们**不会上传 R2 对象**。需先将清洗后的每条记录以其 `k` 为对象 key 上传到按上述公式选定的 R2 桶，API 才能通过 R2 返回正文。

## 容量限制

全量文本不适合写入单个 D1 数据库：Cloudflare 当前 D1 单库硬上限为 10 GB，单条 SQL 上限为 100 KB，单条记录上限为 2 MB，`d1 execute --file` 文件上限为 5 GB。流水线遵守 SQL 与文件大小限制，但如果全量 SQL 数据超过 D1 存储容量，`data:import` 最终仍会失败；完整 56 GB 正文应放在 R2，D1 只保留必要索引。详见 [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/)。
