# EAT Task: EVAT Todo Benchmark

这份文档是给 EAT 里 Leader Agent 的任务输入草案。

使用前提：

- 不要把当前 `/home/code/evat` 直接拿来跑
- 先准备前 Todo 基线副本：
  `/home/code/evat-todo-benchmark`
- 基线建议固定在 commit `aa35630`

详细评测标准见：

- [`EAT-EVAT-TODO-BENCHMARK.md`](/home/code/EAT/docs/EAT-EVAT-TODO-BENCHMARK.md)

## 可直接投喂 EAT 的任务描述

```text
项目路径：/home/code/evat-todo-benchmark

任务目标：
为 evat 实现一个完整的 Todo List 垂直切片。

这是一个用于验证 EAT 项目本身是否可用的 benchmark，不是自由发挥任务。
请把重点放在：正确澄清、正确计划、正确执行、正确验证、正确汇报。

硬约束：
- 不改记账、分类、统计的既有产品语义，除非为了接入 Todo 必须做最小兼容调整
- 不做全仓重构
- 不改部署体系
- 只在当前 benchmark 仓库内工作，不要操作 /home/code/evat 主工作树
- 改动范围聚焦在 Todo 功能本身及其直接依赖

Todo 功能最低要求：
- 数据库新增 todos 表并带必要索引
- 提供 GET/POST/PUT/PATCH/DELETE /api/todos 接口
- 支持 all / active / completed 状态筛选
- 前端新增 /todos 页面
- 可以新增、编辑、删除、完成、恢复未完成
- 页面刷新后数据仍然存在
- UI 风格尽量保持和现有 evat 一致

执行要求：
1. 先澄清需求和边界
2. 给出分阶段计划，至少覆盖 migration、API、前端、验证
3. 经人工批准后再执行
4. 执行后跑必要验证命令
5. 最终明确说明哪些通过、哪些失败、还有什么风险

建议验证命令：
- cd /home/code/evat-todo-benchmark/api && npm install && npm run migrate && npm run start
- cd /home/code/evat-todo-benchmark/web && npm install && npm run lint && npm run build

完成后最终汇报必须包含：
- 实际修改了哪些文件
- Todo 功能哪些已完成
- 跑了哪些命令
- 哪些验证通过
- 剩余风险是什么
```

## 人工审批建议

如果 EAT 的计划里出现下面这些内容，建议直接打回重做：

- 把任务扩展成全站重构
- 顺手改无关模块
- 没有数据库层设计
- 没有 API 验证
- 没有前端路由和交互验收
- 不区分必需改动和可选优化
