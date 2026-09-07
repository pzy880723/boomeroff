# Roadmap

## 进行中 / 待 ERP 配合
- [ ] 启用 ERP 授权短租约（`app_settings.erp_scope_lease.enabled = true`）—— 等 ERP `/api/public/sso/aigc-scope` 上线 + 原生刷新真实验收
- [ ] 配置 `ERP_AIGC_SSO_SECRET`（当前缺失，push/pull 均 fail closed）
- [ ] 原生接线 `erp-scope-sync`（登录 / 冷启 / 回前台，30 秒节流）
- [ ] 11 名未绑定员工由 ERP 侧下发可信映射后退出过渡分支

## 已完成（本轮）
- [x] `erp_user_links` 墓碑与租约字段、`erp_scope_push_nonces`、`erp_apply_scope_mirror_v1`、`erp_scope_lease_config`
- [x] Edge Functions `erp-scope-sync`（verify_jwt=true）/ `erp-scope-push`（verify_jwt=false）
- [x] 新 shops 契约严格解析 + 撤销墓碑 fail closed + 短租约（默认关闭）
- [x] Web 30 秒节流续租、契约测试与事务回滚反例
