import { Link } from 'react-router-dom';
import { Mail, ShieldCheck, Trash2 } from 'lucide-react';
import brandWordmarkUrl from '@/assets/boomer-go-wordmark.png';

const SUPPORT_EMAIL = '87113811@qq.com';

function LegalShell({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/70 bg-background/95">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link to="/" aria-label="返回 BOOMER GO 首页">
            <img src={brandWordmarkUrl} alt="BOOMER GO" className="h-5 w-auto" />
          </Link>
          <Link to="/support" className="text-sm font-medium text-primary">帮助与支持</Link>
        </div>
      </header>
      <article className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">BOOMER GO</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">更新日期：{updated}</p>
        <div className="mt-9 space-y-8 text-[15px] leading-7 text-foreground/80">{children}</div>
      </article>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export function PrivacyPolicy() {
  return (
    <LegalShell title="隐私政策" updated="2026 年 9 月 3 日">
      <p>
        BOOMER GO 是 BOOMER OFF 团队面向门店成员提供的运营与 AI 营销工具。我们重视个人信息和业务资料安全，本政策说明在您使用 BOOMER GO 时，我们如何处理相关信息。
      </p>

      <Section title="1. 我们处理的信息">
        <p>账号与身份信息：手机号、邮箱、姓名或昵称、所属门店、岗位和账号标识，用于登录、权限管理和门店协作。</p>
        <p>用户提交内容：您主动拍摄或上传的图片、视频、文字、商品资料、营销脚本和发布内容，用于完成识别、生成、保存与分发功能。</p>
        <p>设备与运行信息：推送令牌、设备类型、应用版本、错误和必要的操作日志，用于消息通知、安全保障和故障排查。</p>
      </Section>

      <Section title="2. 相机、相册与通知权限">
        <p>相机用于拍摄商品并进行 AI 识别；相册用于选择素材及保存生成的图片、封面和视频；通知权限用于接收任务进度、运营和系统消息。您可以在 iOS 系统设置中随时关闭这些权限。</p>
      </Section>

      <Section title="3. AI 服务与受托处理">
        <p>为提供商品识别、文案和视频生成功能，您选择提交的内容可能被发送至经我们接入的云存储、AI 模型、短信、推送或媒体处理服务。我们仅在实现对应功能所需范围内处理，并要求服务提供方采取合理的安全措施。</p>
      </Section>

      <Section title="4. 信息使用、共享与出售">
        <p>我们使用相关信息来提供账号登录、门店权限、商品识别、内容生成、素材管理、团队协作和内容发布等功能，并用于保障服务安全与改进体验。</p>
        <p>我们不会出售您的个人信息，也不会将您的信息用于跨 App 或网站的广告追踪。除实现功能所必需、获得您的授权或法律法规另有要求外，我们不会向无关第三方披露。</p>
      </Section>

      <Section title="5. 保存与安全">
        <p>我们会在提供服务、履行法定义务及解决争议所需期间保存信息，并采用访问控制、传输加密、权限隔离、日志审计等合理措施保护数据。互联网服务无法保证绝对安全，如发生安全事件，我们将依法处理。</p>
      </Section>

      <Section title="6. 您的权利与账号注销">
        <p>您可以在 App 中查看和更正部分账号资料，也可以通过支持页面申请访问、更正、删除个人信息或注销账号。账号注销后，我们将停止提供相关服务并按适用规则删除或匿名化处理信息，但法律法规要求保留的除外。</p>
        <Link to="/support" className="inline-flex items-center gap-2 font-semibold text-primary">
          <Trash2 className="h-4 w-4" /> 前往账号注销与支持
        </Link>
      </Section>

      <Section title="7. 联系我们">
        <p>如对本政策或个人信息处理有疑问，请发送邮件至 {SUPPORT_EMAIL}。我们会核实身份后处理相关请求。</p>
      </Section>
    </LegalShell>
  );
}

export function Support() {
  const deletionSubject = encodeURIComponent('BOOMER GO 账号注销申请');
  const supportSubject = encodeURIComponent('BOOMER GO 使用帮助');

  return (
    <LegalShell title="帮助与支持" updated="2026 年 9 月 3 日">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <h2 className="font-bold text-foreground">BOOMER GO 支持中心</h2>
            <p className="mt-1 text-sm text-muted-foreground">适用于登录、门店权限、AI 识别、营销视频、素材下载和内容发布等问题。</p>
          </div>
        </div>
      </div>

      <Section title="获得使用帮助">
        <p>请在邮件中说明您的手机号后四位、所属门店、问题发生时间和页面，并附上截图。请不要通过邮件发送密码、验证码或平台 Cookie。</p>
        <a href={`mailto:${SUPPORT_EMAIL}?subject=${supportSubject}`} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground">
          <Mail className="h-4 w-4" /> 联系客服
        </a>
      </Section>

      <Section title="申请注销账号">
        <p>您可以通过下方入口发起账号注销。请提供注册手机号后四位和所属门店，我们会进行身份核验。核验完成后将停用账号，并按隐私政策删除或匿名化处理相关个人信息与非必要数据。</p>
        <a href={`mailto:${SUPPORT_EMAIL}?subject=${deletionSubject}`} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-3 font-semibold text-foreground">
          <Trash2 className="h-4 w-4 text-primary" /> 发起账号注销
        </a>
      </Section>

      <Section title="处理时间">
        <p>一般使用问题会在收到邮件后尽快处理；账号注销申请将在完成身份核验后按适用法律法规和业务规则办理。</p>
      </Section>

      <Section title="相关政策">
        <Link to="/privacy" className="font-semibold text-primary">查看 BOOMER GO 隐私政策</Link>
      </Section>
    </LegalShell>
  );
}
