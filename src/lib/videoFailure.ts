// 把视频渲染相关的英文报错翻译成"人话"+给出一键修复选项。
// 任何前端在 poll/render/stitch 路径上拿到的 error 字符串都丢进 classifyVideoFailure 即可。

export type FixKind =
  | 'switch_model'        // 切换渲染模型
  | 'lower_resolution'    // 降到 720p
  | 'disable_frames'      // 去掉首尾帧(只留参考图)
  | 'text_only'           // 纯文字 prompt(去掉所有图)
  | 'regen_storyboard'    // 重新生成分镜静帧
  | 'restart'             // 整条重新生成
  | 'retry'               // 同参数重试
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
  };
  /** 这条修复需不需要重新提交渲染(true=自动重渲,false=只是提示) */
  reRender?: boolean;
}

export interface VideoFailure {
  code:
    | 'resolution_not_supported'
    | 'real_person_blocked'
    | 'model_not_activated'
    | 'ref_and_lastframe_conflict'
    | 'segment_url_expired'
    | 'stitch_failed'
    | 'timeout'
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

  // 2) 真人内容被拦
  if (
    has(r, /may\s+contain\s+real\s+person/) ||
    has(r, /input\s*image\s*sensitive/) ||
    has(r, /privacyinformation/) ||
    has(r, /sensitivecontent/)
  ) {
    return {
      code: 'real_person_blocked',
      title: '分镜画面被判定为"真人照片"被火山拦了',
      detail:
        '安全策略把分镜静帧识别成真实人物。先试着扔掉静帧只留角色板参考,如果还不行就改成纯文字渲染(画面会偏自由,但能出片)。',
      fixes: [
        { id: 'no_frames', label: '不用静帧,仅用参考图', kind: 'disable_frames',
          patch: { disable_storyboard: true }, reRender: true },
        { id: 'text_only', label: '退回纯文字渲染', kind: 'text_only',
          patch: { disable_storyboard: true, disable_references: true }, reRender: true },
        { id: 'regen_sb', label: '重新生成更"插画感"的分镜', kind: 'regen_storyboard' },
      ],
      raw,
    };
  }

  // 3) 模型未开通
  if (has(r, /has\s+not\s+activated\s+the\s+model/) || has(r, /not\s+activated/) || has(r, /model.*permission/)) {
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
