// 把视频渲染相关的英文报错翻译成"人话"+给出一键修复选项。
// 任何前端在 submit/poll/render/stitch 路径上拿到的 error 字符串都丢进 classifyVideoFailure 即可。

export type FixKind =
  | 'switch_model'        // 切换渲染模型
  | 'lower_resolution'    // 降到 720p
  | 'disable_frames'      // 去掉分镜静帧(只留角色参考)
  | 'text_only'           // 纯文字 prompt(去掉所有图)
  | 'soft_pass_face'      // 给角色照片做 Character Sheet 软通过
  | 'use_bbroll'          // 改用素材库里的无脸 B-roll(背影/手部/产品/门头)
  | 'verify_identity'     // 拉起真人活体认证
  | 'regen_storyboard'    // 重新生成分镜静帧
  | 'rewrite_safe_prompt' // 让 AI 改写为安全表达
  | 'restart'             // 整条重新生成
  | 'retry'               // 同参数重试
  | 'retry_later'         // 稍后再试(限流)
  | 'topup'               // 充值
  | 'delete';             // 删除该失败任务

export interface VideoFix {
  id: string;
  label: string;
  kind: FixKind;
  /** 一键应用的参数补丁 */
  patch?: {
    modelId?: string;
    resolution?: string;
    disable_storyboard?: boolean;
    disable_references?: boolean;
    render_strategy?: 'auto' | 'one_shot' | 'per_shot';
    face_pipeline?: 'auto' | 'character_sheet' | 'illustration' | 'faceless';
  };
  /** 这条修复需不需要重新提交渲染(true=自动重渲,false=只是提示) */
  reRender?: boolean;
}

export interface VideoFailure {
  code:
    | 'resolution_not_supported'
    | 'real_person_blocked'
    | 'output_sensitive'
    | 'text_sensitive'
    | 'rate_limited'
    | 'balance_not_enough'
    | 'model_not_activated'
    | 'segment_url_expired'
    | 'stitch_failed'
    | 'timeout'
    | 'network'
    | 'invalid_param'
    | 'unknown';
  title: string;
  detail: string;
  fixes: VideoFix[];
  raw: string;
}

const has = (s: string, re: RegExp) => re.test(s);

export function classifyVideoFailure(rawIn: string | null | undefined): VideoFailure {
  const raw = (rawIn || '').trim();
  const r = raw.toLowerCase();

  // 1) 分辨率不被该模型支持(Fast/Mini 限制在 720p/1080p,Pro 才能跑 4K)
  if (
    has(r, /parameter\s+resolution.*not\s+valid/) ||
    has(r, /resolution.*not\s+supported/)
  ) {
    return {
      code: 'resolution_not_supported',
      title: '这个模型不支持当前的分辨率',
      detail:
        'Fast / Mini 只能跑到 1080p,4K 必须用 Pro。要么换成 Pro 跑更高画质,要么把分辨率降到 720p 继续用快的。',
      fixes: [
        { id: 'pro_keep_res', label: '换成 Pro(画质更稳)', kind: 'switch_model',
          patch: { modelId: 'doubao-seedance-2-0-pro-260128' }, reRender: true },
        { id: 'drop_res_720', label: '降到 720p 继续跑', kind: 'lower_resolution',
          patch: { resolution: '720p' }, reRender: true },
      ],
      raw,
    };
  }

  // 2) 真人内容被拦(InputImageSensitiveContent / PrivacyInformation)
  if (
    has(r, /may\s+contain\s+real\s+person/) ||
    has(r, /inputimagesensitivecontent/) ||
    has(r, /input\s*image\s*sensitive/) ||
    has(r, /privacyinformation/) ||
    has(r, /真实人物/) || has(r, /真人/)
  ) {
    return {
      code: 'real_person_blocked',
      title: '角色照片被火山判定为"真人",安全策略拦下来了',
      detail:
        '不用怕,这是火山的人脸保护机制,不是 bug。你可以让系统自动给角色照片打上"参考素材"水印再试一次(软通过,99% 能过);也可以改用素材库里的背影/手部/产品图;实在不行就走真·活体认证。',
      fixes: [
        { id: 'soft_pass', label: '一键软通过(推荐)', kind: 'soft_pass_face',
          patch: { face_pipeline: 'character_sheet' }, reRender: true },
        { id: 'bbroll', label: '改用无脸 B-roll', kind: 'use_bbroll',
          patch: { face_pipeline: 'faceless' }, reRender: true },
        { id: 'verify', label: '去做活体认证', kind: 'verify_identity' },
        { id: 'no_frames', label: '只用角色参考(去掉分镜)', kind: 'disable_frames',
          patch: { disable_storyboard: true }, reRender: true },
        { id: 'text_only', label: '退回纯文字渲染', kind: 'text_only',
          patch: { disable_storyboard: true, disable_references: true }, reRender: true },
      ],
      raw,
    };
  }

  // 2b) 出片画面命中敏感
  if (
    has(r, /outputimagesensitivecontent/) ||
    has(r, /outputvideosensitive/) ||
    has(r, /output.*sensitive/)
  ) {
    return {
      code: 'output_sensitive',
      title: '生成出来的画面命中了敏感策略',
      detail: '火山在出片那一刻又做了一次审核,这条画面没过。建议让 AI 改写一下脚本表达,或者切到插画风规避。',
      fixes: [
        { id: 'rewrite', label: '让 AI 改写为安全表达', kind: 'rewrite_safe_prompt', reRender: true },
        { id: 'regen_sb', label: '重新生成更"插画感"的分镜', kind: 'regen_storyboard' },
        { id: 'retry', label: '原样再试一次', kind: 'retry', reRender: true },
      ],
      raw,
    };
  }

  // 2c) 文案命中敏感
  if (has(r, /contenttextsensitive/) || has(r, /text.*sensitive/) || has(r, /文案.*违规/)) {
    return {
      code: 'text_sensitive',
      title: '脚本文案被判定违规',
      detail: '脚本里有敏感词被火山拦了。让 AI 改写一版安全表达再渲染就行。',
      fixes: [
        { id: 'rewrite', label: '让 AI 改写文案', kind: 'rewrite_safe_prompt', reRender: true },
      ],
      raw,
    };
  }

  // 2d) 限流
  if (
    has(r, /ratelimitexceeded/) || has(r, /rate\s*limit/) ||
    has(r, /\bqps\b/) || has(r, /too\s+many\s+requests/) ||
    has(r, /429/)
  ) {
    return {
      code: 'rate_limited',
      title: '火山那边正在限流',
      detail: '同一时间提的任务太多了,稍等 30 秒再试就行,模型本身没问题。',
      fixes: [
        { id: 'retry_later', label: '30 秒后再试', kind: 'retry_later', reRender: true },
      ],
      raw,
    };
  }

  // 2e) 余额不足
  if (
    has(r, /balance\s*not\s*enough/) || has(r, /insufficient\s*balance/) ||
    has(r, /余额不足/) || has(r, /欠费/)
  ) {
    return {
      code: 'balance_not_enough',
      title: '火山账号余额不足',
      detail: '当前火山方舟账号没钱了,需要管理员去 volcengine.com 控制台充值后再来。',
      fixes: [
        { id: 'topup', label: '我知道了,去充值', kind: 'topup' },
        { id: 'retry', label: '充完再重试', kind: 'retry', reRender: true },
      ],
      raw,
    };
  }

  // 3) 模型未开通
  if (
    has(r, /has\s+not\s+activated\s+the\s+model/) || has(r, /not\s+activated/) ||
    has(r, /modelaccessdenied/) || has(r, /model.*permission/) || has(r, /no.*permission/)
  ) {
    return {
      code: 'model_not_activated',
      title: '当前火山账号没开通这个模型',
      detail:
        '你账号下还没开通这个 Seedance 模型。可以先切到已开通的 Fast / Mini 应急,等开通好了再回来选 Pro。',
      fixes: [
        { id: 'sw_fast', label: '切到 Fast', kind: 'switch_model',
          patch: { modelId: 'doubao-seedance-2-0-fast-260128' }, reRender: true },
        { id: 'sw_mini', label: '切到 Mini(最省)', kind: 'switch_model',
          patch: { modelId: 'doubao-seedance-2-0-mini-260615' }, reRender: true },
      ],
      raw,
    };
  }


  // 5) 分段链接 403 / 过期
  if (
    has(r, /分段读取失败/) || has(r, /\(403\)/) || has(r, /forbidden/) ||
    has(r, /\bexpired\b/) || has(r, /signature.*expired/)
  ) {
    return {
      code: 'segment_url_expired',
      title: '视频分段链接已过期',
      detail:
        '火山的分段下载地址只有 24 小时有效期,这条任务超时了,旧分段拼不回来。最稳的就是重新跑一条同样的视频。',
      fixes: [
        { id: 'restart', label: '重新生成整条视频', kind: 'restart', reRender: true },
        { id: 'delete', label: '删除这条失败任务', kind: 'delete' },
      ],
      raw,
    };
  }

  // 6) 拼接失败
  if (has(r, /拼接/) || has(r, /stitch/) || has(r, /mediabunny/) || has(r, /encode/)) {
    return {
      code: 'stitch_failed',
      title: '视频拼接失败',
      detail:
        '浏览器端把多段视频合成一条时出了问题。可以切到「一次成片」模式让 Seedance 直接出一条 ≤15s 的整段,绕开拼接;也可以直接重试一次。',
      fixes: [
        { id: 'retry', label: '重新拼接一次', kind: 'retry', reRender: true },
        { id: 'one_shot', label: '改用一次成片(不拼接)', kind: 'restart',
          patch: { render_strategy: 'one_shot' }, reRender: true },
      ],
      raw,
    };
  }

  // 7) 超时
  if (has(r, /timeout/) || has(r, /timed?\s*out/) || has(r, /超时/)) {
    return {
      code: 'timeout',
      title: '渲染超时',
      detail: '火山那边响应过慢或者长时间没出结果。建议切到更快的 Fast 模型再试一次。',
      fixes: [
        { id: 'sw_fast', label: '切到 Fast 重试', kind: 'switch_model',
          patch: { modelId: 'doubao-seedance-2-0-fast-260128' }, reRender: true },
        { id: 'retry', label: '同参数再试一次', kind: 'retry', reRender: true },
      ],
      raw,
    };
  }

  // 7b) 网络/边缘函数挂了
  if (
    has(r, /failed\s+to\s+fetch/) || has(r, /networkerror/) ||
    has(r, /network\s*request\s*failed/) || has(r, /\bedge\s+function\b.*\b(error|failed)\b/)
  ) {
    return {
      code: 'network',
      title: '网络请求失败,没连上火山',
      detail: '可能是网络抖动或边缘函数瞬时不可用,绝大多数情况下再试一次就好。',
      fixes: [
        { id: 'retry', label: '再试一次', kind: 'retry', reRender: true },
      ],
      raw,
    };
  }

  // 7c) 参数不合法
  if (
    has(r, /invalidargument\.parameter/) ||
    has(r, /parameter.*invalid/) || has(r, /参数.*不合法/) || has(r, /参数.*错误/)
  ) {
    return {
      code: 'invalid_param',
      title: '提交参数不合规,被火山拒收',
      detail: '通常是分辨率、时长或参考图数量超出该模型限制。先按推荐降配再试。',
      fixes: [
        { id: 'drop_res_720', label: '降到 720p 再试', kind: 'lower_resolution',
          patch: { resolution: '720p' }, reRender: true },
        { id: 'sw_fast', label: '切到 Fast', kind: 'switch_model',
          patch: { modelId: 'doubao-seedance-2-0-fast-260128' }, reRender: true },
        { id: 'no_frames', label: '只用角色参考', kind: 'disable_frames',
          patch: { disable_storyboard: true }, reRender: true },
      ],
      raw,
    };
  }

  // 8) 兜底
  return {
    code: 'unknown',
    title: '渲染失败',
    detail: raw || '没拿到具体原因,可以先重试一次,或者换成更稳的 Fast 模型。',
    fixes: [
      { id: 'retry', label: '原样重试', kind: 'retry', reRender: true },
      { id: 'sw_fast', label: '换 Fast 重试', kind: 'switch_model',
        patch: { modelId: 'doubao-seedance-2-0-fast-260128' }, reRender: true },
    ],
    raw,
  };
}
