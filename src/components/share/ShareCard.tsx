import { forwardRef } from 'react';
import logoUrl from '@/assets/boomer-off-vintage-logo.png';

export interface ShareCardPoint {
  text: string;
  tag?: string;
  detail?: string;
}

export interface ShareCardData {
  name: string;
  category?: string;
  ip?: string | null;
  era?: string | null;
  origin?: string | null;
  coverUrl?: string | null;
  pronunciation?: string | null;
  aliases?: string[];
  oneLiner?: string | null;
  summary?: string | null;
  pitch?: string | null;
  quickFacts?: { label: string; value: string }[];
  customerPitches?: { scene: string; line: string }[];
  pointsRich?: ShareCardPoint[];
  points?: string[];
  comparisons?: { name: string; diff: string }[];
  tipsRich?: { memory?: string | null; objection?: string | null } | null;
  tips?: string | null;
  suggestedPrice?: string | null;
  recentPrice?: string | null;
  link?: string | null;
  kind: 'official' | 'recognition';
  extras?: { label: string; value: string }[];
}

const sectionTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#737373',
  marginBottom: 8,
  letterSpacing: 0.5,
};

/**
 * 离屏渲染的分享长图卡片。固定宽度 390px（手机视口），由 html-to-image 以 2x 截图。
 * 不要给它加 dark: 类名，必须保持白底确保截图稳定。
 */
export const ShareCard = forwardRef<HTMLDivElement, { data: ShareCardData }>(
  ({ data }, ref) => {
    const richPoints: ShareCardPoint[] =
      data.pointsRich && data.pointsRich.length > 0
        ? data.pointsRich
        : (data.points || []).filter(Boolean).map((t) => ({ text: t }));
    const subtitleParts = [data.ip, data.era, data.origin].filter(Boolean) as string[];
    const extras = (data.extras || []).filter((e) => e.value);
    const aliases = (data.aliases || []).filter(Boolean);
    const quickFacts = (data.quickFacts || []).filter((f) => f.value);
    const customerPitches = (data.customerPitches || []).filter((p) => p.line);
    const comparisons = (data.comparisons || []).filter((c) => c.diff);
    const tipsRich = data.tipsRich;
    const hasTips = !!(data.tips || tipsRich?.memory || tipsRich?.objection);

    return (
      <div
        ref={ref}
        style={{
          width: 390,
          background: 'linear-gradient(180deg, #fff7ed 0%, #ffffff 25%, #ffffff 100%)',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif',
          color: '#1f1f1f',
          padding: 16,
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            background: '#ffffff',
            borderRadius: 20,
            overflow: 'hidden',
            boxShadow: '0 6px 24px rgba(0,0,0,0.06)',
            border: '1px solid #f1f1f1',
          }}
        >
          {/* 顶部类目徽章 */}
          {data.category && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 16px 0' }}>
              <span
                style={{
                  fontSize: 11,
                  padding: '3px 10px',
                  background: '#fff7ed',
                  color: '#c2410c',
                  borderRadius: 999,
                  fontWeight: 500,
                }}
              >
                {data.category}
              </span>
            </div>
          )}

          {/* 主图 */}
          {data.coverUrl ? (
            <div style={{ padding: '12px 16px 0' }}>
              <div
                style={{
                  width: '100%',
                  aspectRatio: '1 / 1',
                  borderRadius: 14,
                  overflow: 'hidden',
                  background: '#f4f4f5',
                }}
              >
                <img
                  src={data.coverUrl}
                  alt=""
                  crossOrigin="anonymous"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </div>
            </div>
          ) : null}

          {/* 标题 + 读音 + 别名 */}
          <div style={{ padding: '14px 16px 0' }}>
            <h1 style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.35, margin: 0 }}>
              {data.name}
            </h1>
            {(data.pronunciation || aliases.length > 0) && (
              <p style={{ marginTop: 6, fontSize: 12, color: '#737373', lineHeight: 1.5 }}>
                {data.pronunciation ? <span>{data.pronunciation}</span> : null}
                {data.pronunciation && aliases.length > 0 ? <span> · </span> : null}
                {aliases.length > 0 ? <span>别名：{aliases.join(' / ')}</span> : null}
              </p>
            )}
            {subtitleParts.length > 0 && (
              <p style={{ marginTop: 4, fontSize: 12, color: '#737373', lineHeight: 1.5 }}>
                {subtitleParts.join(' · ')}
              </p>
            )}
          </div>

          {/* 一句话讲给客人 */}
          {data.oneLiner && (
            <div style={{ padding: '12px 16px 0' }}>
              <div
                style={{
                  background: 'linear-gradient(135deg, #fff7ed 0%, #fef3c7 100%)',
                  borderRadius: 12,
                  padding: '12px 14px',
                  border: '1px solid #fde68a',
                }}
              >
                <div style={{ fontSize: 10, color: '#a16207', letterSpacing: 1, marginBottom: 4 }}>
                  一句话讲给客人
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.5, color: '#1f1f1f' }}>
                  「{data.oneLiner}」
                </div>
              </div>
            </div>
          )}

          {/* 推荐语 / 摘要 */}
          {(data.pitch || data.summary) && (
            <div style={{ padding: '12px 16px 0' }}>
              <div
                style={{
                  background: '#fafaf9',
                  borderLeft: '3px solid #f59e0b',
                  borderRadius: 6,
                  padding: '10px 12px',
                  fontSize: 14,
                  lineHeight: 1.7,
                  color: '#3f3f46',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {data.pitch || data.summary}
              </div>
            </div>
          )}

          {/* 价格 */}
          {(data.suggestedPrice || data.recentPrice) && (
            <div style={{ padding: '12px 16px 0', display: 'flex', gap: 8 }}>
              {data.suggestedPrice && (
                <div style={{ flex: 1, background: '#fff7ed', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontSize: 11, color: '#a16207' }}>建议价</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#c2410c', marginTop: 2 }}>
                    {data.suggestedPrice}
                  </div>
                </div>
              )}
              {data.recentPrice && (
                <div style={{ flex: 1, background: '#f5f5f4', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontSize: 11, color: '#737373' }}>历史成交</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#404040', marginTop: 2 }}>
                    {data.recentPrice}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 速记卡 */}
          {quickFacts.length > 0 && (
            <div style={{ padding: '14px 16px 0' }}>
              <div style={sectionTitle}>速记卡</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {quickFacts.map((f, i) => (
                  <div key={i} style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 10, color: '#737373' }}>{f.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.4, marginTop: 2 }}>
                      {f.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 客户话术 */}
          {customerPitches.length > 0 && (
            <div style={{ padding: '14px 16px 0' }}>
              <div style={sectionTitle}>客户话术</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {customerPitches.map((p, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      gap: 8,
                      background: '#fafaf9',
                      borderRadius: 8,
                      padding: '8px 10px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        padding: '2px 8px',
                        background: '#e7e5e4',
                        color: '#44403c',
                        borderRadius: 999,
                        height: 'fit-content',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.scene}
                    </span>
                    <div style={{ flex: 1, fontSize: 13, lineHeight: 1.6, color: '#262626' }}>
                      {p.line}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 核心卖点 */}
          {richPoints.length > 0 && (
            <div style={{ padding: '14px 16px 0' }}>
              <div style={sectionTitle}>核心卖点</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {richPoints.map((p, i) => (
                  <div
                    key={i}
                    style={{
                      background: '#fafafa',
                      border: '1px solid #f0f0f0',
                      borderRadius: 8,
                      padding: '8px 10px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      {p.tag && (
                        <span
                          style={{
                            fontSize: 10,
                            padding: '1px 6px',
                            background: '#fef3c7',
                            color: '#92400e',
                            borderRadius: 4,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {p.tag}
                        </span>
                      )}
                      <span style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.5, color: '#1f1f1f' }}>
                        {p.text}
                      </span>
                    </div>
                    {p.detail && (
                      <div style={{ marginTop: 4, fontSize: 12, color: '#737373', lineHeight: 1.6 }}>
                        {p.detail}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 易混对比 */}
          {comparisons.length > 0 && (
            <div style={{ padding: '14px 16px 0' }}>
              <div style={sectionTitle}>易混对比</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {comparisons.map((c, i) => (
                  <div
                    key={i}
                    style={{
                      background: '#fafaf9',
                      borderRadius: 8,
                      padding: '8px 10px',
                      fontSize: 13,
                      lineHeight: 1.6,
                    }}
                  >
                    <span style={{ color: '#c2410c', fontWeight: 600 }}>vs {c.name}：</span>
                    <span style={{ color: '#3f3f46' }}>{c.diff}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 额外信息 */}
          {extras.length > 0 && (
            <div style={{ padding: '14px 16px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {extras.map((e, i) => (
                <div key={i} style={{ background: '#fafafa', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 11, color: '#737373', marginBottom: 2 }}>{e.label}</div>
                  <div style={{ fontSize: 13, color: '#262626', lineHeight: 1.6 }}>{e.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* 店员小贴士 */}
          {hasTips && (
            <div style={{ padding: '14px 16px 0' }}>
              <div style={sectionTitle}>店员小贴士</div>
              <div
                style={{
                  background: '#fefce8',
                  borderRadius: 8,
                  padding: '10px 12px',
                  fontSize: 13,
                  color: '#713f12',
                  lineHeight: 1.7,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                {tipsRich?.memory && (
                  <div>
                    <span style={{ fontWeight: 600 }}>记忆点：</span>
                    {tipsRich.memory}
                  </div>
                )}
                {tipsRich?.objection && (
                  <div>
                    <span style={{ fontWeight: 600 }}>应对疑问：</span>
                    {tipsRich.objection}
                  </div>
                )}
                {!tipsRich?.memory && !tipsRich?.objection && data.tips && <div>{data.tips}</div>}
              </div>
            </div>
          )}

          {/* 底部：居中 logo + 署名 */}
          <div
            style={{
              marginTop: 20,
              padding: '16px 16px 18px',
              borderTop: '1px dashed #e5e5e5',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 10,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#ffffff',
              }}
            >
              <img
                src={logoUrl}
                alt=""
                crossOrigin="anonymous"
                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
              />
            </div>
            <div style={{ fontSize: 12, color: '#737373' }}>由 boomeroff 官方生成</div>
          </div>
        </div>
      </div>
    );
  },
);
ShareCard.displayName = 'ShareCard';
