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
}

/**
 * 离屏渲染的分享长图卡片。固定宽度 750px，由 html-to-image 截图。
 * 不要给它加 dark: 类名，必须保持白底确保截图稳定。
 */
export const ShareCard = forwardRef<HTMLDivElement, { data: ShareCardData }>(
  ({ data }, ref) => {
    const points = (data.points || []).slice(0, 3);
    const summary = (data.summary || '').slice(0, 120);
    const subtitleParts = [data.ip, data.era, data.origin].filter(Boolean);

    return (
      <div
        ref={ref}
        style={{
          width: 750,
          background: 'linear-gradient(180deg, #fff7ed 0%, #ffffff 30%, #ffffff 100%)',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif',
          color: '#1f1f1f',
          padding: 32,
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            background: '#ffffff',
            borderRadius: 28,
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.06)',
            border: '1px solid #f1f1f1',
          }}
        >
          {/* 顶部品牌条 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '20px 28px 12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src={logoUrl} alt="" crossOrigin="anonymous" style={{ width: 36, height: 36, borderRadius: 8 }} />
              <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>BOOMER-OFF</span>
            </div>
            {data.category && (
              <span
                style={{
                  fontSize: 13,
                  padding: '4px 12px',
                  background: '#fff7ed',
                  color: '#c2410c',
                  borderRadius: 999,
                  fontWeight: 500,
                }}
              >
                {data.category}
              </span>
            )}
          </div>

          {/* 主图 */}
          {data.coverUrl ? (
            <div style={{ padding: '0 28px' }}>
              <div
                style={{
                  width: '100%',
                  aspectRatio: '1 / 1',
                  borderRadius: 18,
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
          <div style={{ padding: '20px 28px 0' }}>
            <h1 style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.3, margin: 0 }}>
              {data.name}
            </h1>
            {subtitleParts.length > 0 && (
              <p style={{ marginTop: 8, fontSize: 15, color: '#737373' }}>
                {subtitleParts.join(' · ')}
              </p>
            )}
          </div>

          {/* 一句话推荐 / 摘要 */}
          {(data.pitch || summary) && (
            <div style={{ padding: '14px 28px 0' }}>
              <div
                style={{
                  background: '#fafaf9',
                  borderLeft: '3px solid #f59e0b',
                  borderRadius: 8,
                  padding: '14px 16px',
                  fontSize: 15,
                  lineHeight: 1.7,
                  color: '#3f3f46',
                }}
              >
                {data.pitch || summary}
              </div>
            </div>
          )}

          {/* 价格 */}
          {(data.suggestedPrice || data.recentPrice) && (
            <div style={{ padding: '16px 28px 0', display: 'flex', gap: 12 }}>
              {data.suggestedPrice && (
                <div
                  style={{
                    flex: 1,
                    background: '#fff7ed',
                    borderRadius: 12,
                    padding: '12px 14px',
                  }}
                >
                  <div style={{ fontSize: 12, color: '#a16207' }}>建议价</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#c2410c', marginTop: 2 }}>
                    {data.suggestedPrice}
                  </div>
                </div>
              )}
              {data.recentPrice && (
                <div
                  style={{
                    flex: 1,
                    background: '#f5f5f4',
                    borderRadius: 12,
                    padding: '12px 14px',
                  }}
                >
                  <div style={{ fontSize: 12, color: '#737373' }}>历史成交</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#404040', marginTop: 2 }}>
                    {data.recentPrice}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 卖点 */}
          {points.length > 0 && (
            <div style={{ padding: '18px 28px 0' }}>
              <div style={{ fontSize: 13, color: '#737373', marginBottom: 8 }}>核心卖点</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {points.map((p, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      gap: 10,
                      fontSize: 15,
                      lineHeight: 1.6,
                      color: '#262626',
                    }}
                  >
                    <span style={{ color: '#f59e0b', fontWeight: 700 }}>▸</span>
                    <span style={{ flex: 1 }}>{p}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 小贴士 */}
          {data.tips && (
            <div style={{ padding: '14px 28px 0' }}>
              <div
                style={{
                  background: '#fefce8',
                  borderRadius: 10,
                  padding: '10px 14px',
                  fontSize: 13,
                  color: '#713f12',
                  lineHeight: 1.6,
                }}
              >
                💡 {data.tips}
              </div>
            </div>
          )}

          {/* 底部品牌 */}
          <div
            style={{
              marginTop: 24,
              padding: '18px 28px',
              borderTop: '1px dashed #e5e5e5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <img src={logoUrl} alt="" crossOrigin="anonymous" style={{ width: 28, height: 28, borderRadius: 6 }} />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>BOOMER-OFF</span>
                <span style={{ fontSize: 11, color: '#737373' }}>中古好物识别助手</span>
              </div>
            </div>
            {data.link && (
              <span style={{ fontSize: 11, color: '#a3a3a3', maxWidth: 320, textAlign: 'right', wordBreak: 'break-all' }}>
                {data.link.replace(/^https?:\/\//, '')}
              </span>
            )}
          </div>
        </div>

        <div style={{ textAlign: 'center', fontSize: 11, color: '#a3a3a3', marginTop: 14 }}>
          由 BOOMER-OFF 生成 · 长按或点击下载保存图片
        </div>
      </div>
    );
  },
);
ShareCard.displayName = 'ShareCard';
