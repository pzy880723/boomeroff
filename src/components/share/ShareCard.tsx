import { forwardRef } from 'react';
import logoUrl from '@/assets/boomer-off-vintage-logo.png';

export interface ShareCardData {
  name: string;
  category?: string;
  ip?: string | null;
  era?: string | null;
  origin?: string | null;
  coverUrl?: string | null;
  summary?: string | null;
  pitch?: string | null;
  points?: string[];
  tips?: string | null;
  suggestedPrice?: string | null;
  recentPrice?: string | null;
  link?: string | null;
  kind: 'official' | 'recognition';
  extras?: { label: string; value: string }[];
}

/**
 * 离屏渲染的分享长图卡片。固定宽度 390px（手机视口），由 html-to-image 以 2x 截图。
 * 不要给它加 dark: 类名，必须保持白底确保截图稳定。
 */
export const ShareCard = forwardRef<HTMLDivElement, { data: ShareCardData }>(
  ({ data }, ref) => {
    const points = (data.points || []).filter(Boolean).slice(0, 5);
    const summary = (data.summary || '').slice(0, 180);
    const pitch = (data.pitch || '').slice(0, 180);
    const tips = (data.tips || '').slice(0, 60);
    const subtitleParts = [data.ip, data.era, data.origin].filter(Boolean) as string[];
    const extras = (data.extras || []).filter((e) => e.value).slice(0, 3);

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
          {/* 顶部：仅类目徽章 */}
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

          {/* 标题 + 副标题 */}
          <div style={{ padding: '14px 16px 0' }}>
            <h1 style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.35, margin: 0 }}>
              {data.name}
            </h1>
            {subtitleParts.length > 0 && (
              <p style={{ marginTop: 6, fontSize: 12, color: '#737373', lineHeight: 1.5 }}>
                {subtitleParts.join(' · ')}
              </p>
            )}
          </div>

          {/* 一句话推荐 / 摘要 */}
          {(pitch || summary) && (
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
                }}
              >
                {pitch || summary}
              </div>
            </div>
          )}

          {/* 价格 */}
          {(data.suggestedPrice || data.recentPrice) && (
            <div style={{ padding: '12px 16px 0', display: 'flex', gap: 8 }}>
              {data.suggestedPrice && (
                <div
                  style={{
                    flex: 1,
                    background: '#fff7ed',
                    borderRadius: 10,
                    padding: '10px 12px',
                  }}
                >
                  <div style={{ fontSize: 11, color: '#a16207' }}>建议价</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#c2410c', marginTop: 2 }}>
                    {data.suggestedPrice}
                  </div>
                </div>
              )}
              {data.recentPrice && (
                <div
                  style={{
                    flex: 1,
                    background: '#f5f5f4',
                    borderRadius: 10,
                    padding: '10px 12px',
                  }}
                >
                  <div style={{ fontSize: 11, color: '#737373' }}>历史成交</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#404040', marginTop: 2 }}>
                    {data.recentPrice}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 卖点 */}
          {points.length > 0 && (
            <div style={{ padding: '14px 16px 0' }}>
              <div style={{ fontSize: 12, color: '#737373', marginBottom: 6 }}>核心卖点</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {points.map((p, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      gap: 8,
                      fontSize: 13,
                      lineHeight: 1.6,
                      color: '#262626',
                    }}
                  >
                    <span style={{ color: '#f59e0b', fontWeight: 700 }}>▸</span>
                    <span style={{ flex: 1 }}>{p.slice(0, 60)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 额外信息块 */}
          {extras.length > 0 && (
            <div style={{ padding: '14px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {extras.map((e, i) => (
                <div key={i} style={{ background: '#fafafa', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 11, color: '#737373', marginBottom: 2 }}>{e.label}</div>
                  <div style={{ fontSize: 13, color: '#262626', lineHeight: 1.6 }}>
                    {e.value.slice(0, 120)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 小贴士 */}
          {tips && (
            <div style={{ padding: '12px 16px 0' }}>
              <div
                style={{
                  background: '#fefce8',
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontSize: 12,
                  color: '#713f12',
                  lineHeight: 1.6,
                }}
              >
                💡 {tips}
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
