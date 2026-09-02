from __future__ import annotations

import base64
import hashlib
import io
import json
import os
import random
import subprocess
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterable

import cv2
import numpy as np
import requests
from PIL import Image, ImageDraw, ImageFont, ImageOps

from worker.storefront_lock import resolve_storefront_reference


class CoverPipelineError(RuntimeError):
    pass


def build_faststart_command(input_path: str, output_path: str) -> list[str]:
    return [
        "ffmpeg",
        "-y",
        "-i",
        input_path,
        "-map",
        "0",
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        output_path,
    ]


def optimize_video_for_streaming(video: Path, output: Path) -> Path:
    output.parent.mkdir(parents=True, exist_ok=True)
    command = build_faststart_command(str(video), str(output))
    completed = subprocess.run(
        command,
        capture_output=True,
        text=True,
        timeout=180,
        check=False,
    )
    if completed.returncode != 0 or not output.exists() or output.stat().st_size < 1024:
        detail = (completed.stderr or completed.stdout or "unknown ffmpeg error")[-1200:]
        raise CoverPipelineError(f"视频 Fast Start 优化失败：{detail}")
    return output


@dataclass(slots=True)
class FrameCandidate:
    index: int
    timestamp_s: float
    image: np.ndarray
    face_boxes: list[tuple[int, int, int, int]]
    quality: float


@dataclass(frozen=True, slots=True)
class CoverStylePreset:
    key: str
    label: str
    prompt: str


COVER_STYLE_PRESETS = (
    CoverStylePreset(
        key="reaction_closeup",
        label="近景反应冲击",
        prompt=(
            "只借鉴近景冲击排版：18–24mm 超广角近摄，人物在真实中古店货架前做发现好物的自然强烈表情，"
            "前景商品占画面下方约 25%–35%，手、脸和商品形成三角构图；"
            "暖暗高密度中古陈列背景，标题与人物局部压叠，缩略图也要有强冲击。"
        ),
    ),
    CoverStylePreset(
        key="object_macro",
        label="中古物件微距",
        prompt=(
            "只借鉴手持物件微距排版：在真实中古店内由手掌托住脚本中的老物件、玩具、餐具或唱片，"
            "货架虚化为背景，主体岁月纹理清楚；大标题占上半区，手绘轮廓包围物件，"
            "搭配小型便签与轻松治愈的涂鸦。"
        ),
    ),
    CoverStylePreset(
        key="guide_card",
        label="探店攻略说明",
        prompt=(
            "只借鉴攻略说明排版：人物站在真实 BOOMER·OFF 中古店陈列前，手持脚本中实际出现的商品，"
            "中近景纪实摄影；标题像攻略警示，辅以三条以内短清单、箭头和下划线，"
            "画面必须让人一眼理解这是一家值得逛的中古杂货铺。"
        ),
    ),
    CoverStylePreset(
        key="store_atmosphere",
        label="店内氛围全景",
        prompt=(
            "只借鉴宽幅环境叙事排版：真实中古店入口、通道或高密度货架占主要面积，"
            "人物自然翻找、端详或交流；暖色胶片质感，标题醒目但不遮挡关键商品和门店特征，"
            "用手写计划卡与生活化小注释营造逛店的松弛感。"
        ),
    ),
    CoverStylePreset(
        key="large_title_depth",
        label="巨幅标题纵深",
        prompt=(
            "只借鉴大留白巨幅标题排版：用真实中古店纵深通道、门头上方或低细节墙面承载白色手写标题，"
            "人物从货架间走入、回头或指向宝藏商品，黄色太阳与下划线增强节奏；"
            "整体有立即进店探索的行动感，不能把留白替换成户外天空。"
        ),
    ),
    CoverStylePreset(
        key="emotion_checklist",
        label="情绪人物清单",
        prompt=(
            "只借鉴情绪人物加清单的排版：人物坐在或倚靠真实中古店的货架、翻筐或陈列区，"
            "表情呈现无聊到发现宝藏的反差，"
            "白黄标题形成强对比，四周用箭头、短清单和便签突出低门槛行动；"
            "背景必须是店内，不制造地铁、办公室或不存在的地点。"
        ),
    ),
    CoverStylePreset(
        key="quiet_corner",
        label="安静淘物角落",
        prompt=(
            "只借鉴安静独处的排版：人物在真实中古店暖色灯光或窗边陈列区阅读封套、挑选唱片或端详老物件，"
            "环境保留真实货架、桌面和商品；"
            "白黄手写大标题与光影共同构图，辅以极少量中英小字和便签涂鸦，"
            "气氛安静但标题必须有明确种草钩子。"
        ),
    ),
    CoverStylePreset(
        key="warm_store_walk",
        label="暖色店内漫游",
        prompt=(
            "只借鉴暖色电影感漫游排版：真实中古店内的灯具、货架与密集老物件形成暖橙背景，"
            "人物侧身回望、边走边逛或抬头观察陈列，"
            "大标题白黄交替，配合勾选清单、定位与相机涂鸦；"
            "高反差但保留真实肤色和中古店环境细节，不杜撰街区或夜市场景。"
        ),
    ),
    CoverStylePreset(
        key="cinematic_aisle",
        label="电影感货架剪影",
        prompt=(
            "只借鉴电影感剪影排版：真实中古店货架通道与暖色灯具形成纵深，人物推购物筐、抱着商品或慢步淘物，"
            "画面像生活方式杂志特辑；巨幅白色手写标题配黄色装饰线，"
            "仅在脚本明确包含节日时才出现相关文案，不凭空蹭热点。"
        ),
    ),
)


def select_cover_style(
    payload: dict[str, Any],
    *,
    allow_people: bool = True,
) -> CoverStylePreset:
    job = payload.get("job") if isinstance(payload.get("job"), dict) else payload
    generation = (
        job.get("cover_generation") if isinstance(job.get("cover_generation"), dict) else {}
    )
    variation = generation.get("variation") if isinstance(generation.get("variation"), dict) else {}
    requested = str(generation.get("style_key") or variation.get("style_key") or "").strip()
    if requested:
        matched = next((preset for preset in COVER_STYLE_PRESETS if preset.key == requested), None)
        if matched and (allow_people or matched.key in PEOPLE_OPTIONAL_STYLE_KEYS):
            return matched

    # 同一任务重试保持风格稳定；新任务 ID 会自然分散到不同风格。
    job_id = str(job.get("id") or "").strip()
    if not job_id:
        return (
            COVER_STYLE_PRESETS[0]
            if allow_people
            else next(preset for preset in COVER_STYLE_PRESETS if preset.key in PEOPLE_OPTIONAL_STYLE_KEYS)
        )
    index = int(hashlib.sha256(job_id.encode("utf-8")).hexdigest()[:16], 16)
    presets = (
        COVER_STYLE_PRESETS
        if allow_people
        else tuple(preset for preset in COVER_STYLE_PRESETS if preset.key in PEOPLE_OPTIONAL_STYLE_KEYS)
    )
    return presets[index % len(presets)]


PEOPLE_OPTIONAL_STYLE_KEYS = {
    "object_macro",
    "store_atmosphere",
    "large_title_depth",
}


def choose_reference_candidates(
    candidates: Iterable[FrameCandidate],
    *,
    max_frames: int = 4,
    min_gap_s: float = 1.5,
) -> list[FrameCandidate]:
    ranked = sorted(
        (candidate for candidate in candidates if candidate.face_boxes),
        key=lambda candidate: (-candidate.quality, candidate.timestamp_s),
    )
    selected: list[FrameCandidate] = []
    for candidate in ranked:
        if all(abs(candidate.timestamp_s - item.timestamp_s) >= min_gap_s for item in selected):
            selected.append(candidate)
            if len(selected) == max_frames:
                break
    return sorted(selected, key=lambda candidate: candidate.timestamp_s)


def choose_cover_base_candidate(
    candidates: Iterable[FrameCandidate],
    *,
    character_expected: bool = False,
) -> FrameCandidate:
    frames = list(candidates)
    if not frames:
        raise CoverPipelineError("视频里没有可读取的画面，无法制作封面。")
    if character_expected:
        # 惊喜视频规定主角从第一帧入画。优先锁定开场主角，避免瓷器纹样等
        # 被 Haar 误判成人脸后选到无人物商品帧。
        return min(frames, key=lambda candidate: abs(candidate.timestamp_s - 0.6))
    people = [candidate for candidate in frames if candidate.face_boxes]
    if people:
        return max(people, key=lambda candidate: candidate.quality)
    return max(frames, key=lambda candidate: candidate.quality)


def script_expects_character(job: dict[str, Any]) -> bool:
    script = job.get("script") if isinstance(job.get("script"), dict) else {}
    if isinstance(script.get("persona"), dict) or isinstance(script.get("character"), dict):
        return True
    payload = (
        script.get("__render_payload")
        if isinstance(script.get("__render_payload"), dict)
        else {}
    )
    return "【唯一主角】" in str(payload.get("prompt") or "")


def choose_scene_reference_candidates(
    candidates: Iterable[FrameCandidate],
    *,
    max_frames: int,
    min_gap_s: float = 1.5,
) -> list[FrameCandidate]:
    if max_frames <= 0:
        return []
    ranked = sorted(candidates, key=lambda candidate: (-candidate.quality, candidate.timestamp_s))
    selected: list[FrameCandidate] = []
    for candidate in ranked:
        if all(abs(candidate.timestamp_s - item.timestamp_s) >= min_gap_s for item in selected):
            selected.append(candidate)
            if len(selected) == max_frames:
                break
    return sorted(selected, key=lambda candidate: candidate.timestamp_s)


def select_reference_frames(
    video: Path,
    output_dir: Path,
    *,
    max_frames: int = 4,
    sampler: Callable[[Path], list[FrameCandidate]] | None = None,
) -> list[Path]:
    candidates = (sampler or _sample_video_frames)(video)
    people = choose_reference_candidates(candidates, max_frames=max_frames)
    selected_indexes = {candidate.index for candidate in people}
    scenes = choose_scene_reference_candidates(
        (candidate for candidate in candidates if candidate.index not in selected_indexes),
        max_frames=max(0, max_frames - len(people)),
    )
    selected: list[tuple[FrameCandidate, bool]] = [
        *((candidate, True) for candidate in people),
        *((candidate, False) for candidate in scenes),
    ][:max_frames]
    if not selected:
        raise CoverPipelineError("视频里没有可读取的清晰画面，无法生成封面参考板。")

    # Seedream receives a fixed three-panel evidence board. Short videos may only
    # expose one or two usable frames, so repeat the last valid frame instead of
    # failing the entire delivery.
    while len(selected) < min(3, max_frames):
        selected.append(selected[-1])

    output_dir.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    for position, (candidate, is_person) in enumerate(selected, start=1):
        image = (
            _person_crop(candidate.image, candidate.face_boxes[0])
            if is_person
            else candidate.image
        )
        prefix = "character-ref" if is_person else "scene-ref"
        path = output_dir / f"{prefix}-{position:02d}.jpg"
        if not cv2.imwrite(str(path), image, [cv2.IMWRITE_JPEG_QUALITY, 94]):
            raise CoverPipelineError(f"封面参考帧写入失败：{path.name}")
        paths.append(path)
    return paths


def build_cover_prompt(
    payload: dict[str, Any],
    *,
    style: CoverStylePreset | None = None,
    has_storefront_reference: bool = False,
    has_character_reference: bool = True,
) -> str:
    job = payload.get("job") if isinstance(payload.get("job"), dict) else payload
    script = job.get("script") if isinstance(job.get("script"), dict) else {}
    generation = (
        job.get("cover_generation") if isinstance(job.get("cover_generation"), dict) else {}
    )
    copy = generation.get("copy") if isinstance(generation.get("copy"), dict) else {}
    variation = generation.get("variation") if isinstance(generation.get("variation"), dict) else {}
    script_title = str(script.get("title") or job.get("title") or "探店视频").strip()
    headline = str(copy.get("headline") or script_title).strip()
    subtitle = str(copy.get("subtitle") or "").strip()
    highlight = str(copy.get("highlight_keyword") or "").strip()
    action = str(variation.get("action") or "discover_product").strip()
    product = str(variation.get("product") or "script_product").strip()
    camera = str(variation.get("camera") or "wide_closeup").strip()
    dialogue = str(script.get("continuous_dialogue") or "").strip()
    people_count = variation.get("people_count")
    style = style or select_cover_style(payload)
    if style.key == "reaction_closeup" and people_count == 1:
        people_instruction = (
            "本张采用单人物构图，只让视频主角出现一次，以一个夸张表情和一个明确商品动作形成强透视；"
        )
    elif style.key == "reaction_closeup" and people_count == 2:
        people_instruction = (
            "本张采用编辑式双重人物构图：允许同一位视频主角在同一封面出现两次，"
            "前景是一张占比更大的夸张表情和伸向镜头的商品动作，后景是较小的第二表情与不同动作；"
            "两次出现必须一大一小、前后分层、表情与动作不同，不能做成两个同尺寸人物平铺；"
        )
    elif people_count == 2:
        people_instruction = (
            "可采用两人同场或同一位视频主角前后分层的编辑式叙事，但人物身份必须一致且比例自然；"
        )
    else:
        people_instruction = "以一位视频主角自然进入本次风格场景，不强迫夸张表情或超广角近脸；"
    normalized_product = product.lower().replace("·", "").replace(" ", "")
    product_instruction = (
        "从脚本口播中选择实际出现的商品作为前景互动商品，品牌名不能被当作商品"
        if normalized_product in {"boomer", "boomeroff", "script_product"}
        else product
    )

    evidence_instruction = (
        "图一是本条视频的三格内容证据板：第一格是真实门店门头原件，必须保持入口结构、招牌与 Logo 原样；"
        "其余格来自本条成片。只能使用证据板里真实存在的人物、门店和商品，不得另造门店或改写 Logo。"
        if has_storefront_reference
        else "图一是本条视频提取的三格内容证据板，只能使用其中真实存在的人物、场景和商品。"
    )
    character_instruction = (
        "若证据板中出现同一位主角，保持脸型、五官比例、发型、肤色、年龄感、服装和主要配饰一致；"
        if has_character_reference
        else "证据板没有可靠人物脸部参考，本张以真实门店、货架和商品为主体，禁止凭空生成人物或人脸；"
    )

    return (
        "创作一张竖版 3:4 的中国社交媒体探店爆款完整封面，不是无字底图。"
        f"{evidence_instruction}{character_instruction}"
        "图二只参考本次生活方式杂志封面的构图、白黄粗笔刷字、涂鸦装饰和视觉密度。"
        f"本次随机版式：{style.label}。版式执行：{style.prompt}"
        "不得照抄参考图中的人物、地点、物品或文字；只学习版式、光线、字形层级和涂鸦节奏。"
        "所有内容都必须属于 BOOMER·OFF 中古杂货铺：真实门头、店内货架、翻筐、老物件、玩具、餐具、唱片和脚本实际商品。"
        "禁止生成草原、乡村、地铁、咖啡店、普通街景、旅游景点或任何素材与脚本中不存在的场景。"
        "必须重新生成全新的场景、表情、肢体动作和商品互动，不能复制任何一张视频截图。"
        f"{people_instruction}"
        f"内容主题：{script_title}。"
        f"脚本口播：{dialogue[:320]}。"
        f"动作：{action}；主商品：{product_instruction}；镜头：{camera}。"
        "人物必须像真实近距离摄影：保留自然毛孔、细小面部绒毛、独立发丝、唇纹和轻微面部不对称，"
        "皮肤有真实透光与细微色差；禁止塑料皮、蜡像感、过度磨皮、假睫毛糊成一片或 AI 美颜脸。"
        "背景必须来自内容主题所对应的真实门店、商品或生活语境，光线、景别和色调严格服从本次随机风格，"
        "同时保留真实景深并降低非主体区域对比度；不能编造视频脚本之外的店名、地址、商品、价格、折扣或活动。"
        "顶部标题区与人物、商品互相压叠，保留可读空间但不能做成大片空白、普通海报或证件照构图。"
        f"标题必须逐字写成“{headline}”，使用白色粗粝干刷手写字，位于顶部并占最大视觉层级；"
        f"副标题必须逐字写成“{subtitle}”，使用较小的白色或黄色手写字；"
        f"高亮关键词必须逐字写成“{highlight}”，使用明黄色粗粝干刷字并形成第二视觉焦点。"
        "除以上明确给出的中文文字外，不要生成任何其他文字、英文、数字、乱码、Logo、水印、招牌或品牌标识。"
        "任何参考图中若出现门头 Logo，只能原样保留，禁止改写、重绘或创造相似 Logo。"
        "不能生成普通站姿、普通微笑或商品证件照；人物手部必须完整自然。"
        "真实纪实摄影质感，高细节，高对比，缩略图尺寸也能看清人物表情、前景商品和准确中文标题。"
    )


def resolve_cover_style_reference() -> Path:
    fallback = Path(
        os.environ.get("COVER_STYLE_REFERENCE")
        or "/home/ubuntu/social-auto-upload/worker/assets/boomer-local-shock-cover-v1.png"
    ).expanduser()
    if fallback.is_file():
        return fallback
    raise CoverPipelineError(f"批准的 BOOMER·OFF 中古店封面参考不存在：{fallback}")


def generate_cover_candidates(
    client: Any,
    prompt: str,
    character_references: list[Path],
    style_reference: Path,
    *,
    storefront_reference: Path | None = None,
    count: int = 4,
) -> list[bytes]:
    content_references = (
        [storefront_reference, *character_references[:2]]
        if storefront_reference is not None
        else character_references[:3]
    )
    content_board = _build_content_reference_board(content_references)
    references = [content_board, style_reference]
    variants = [
        "正面超广角，人物与前景商品形成三角构图",
        "略低机位斜拍，人物指向伸到镜头前的商品",
        "人物前倾回头，商品从画面下方冲向镜头",
        "对角线动态构图，人物表情与商品距离形成强反差",
    ]
    return [
        client.generate(
            f"{prompt} 候选构图编号：{index}，本张采用：{variants[(index - 1) % len(variants)]}。"
            "图二只用于学习爆款封面的广角、层次、暖暗色调和视觉密度，"
            "绝对不能复制其中的人物、商品、文字或标识；人物与门店事实只参考图一的三格内容证据板。",
            references,
        )
        for index in range(1, max(1, count) + 1)
    ]


def _build_content_reference_board(content_references: list[Path]) -> Path:
    if not content_references:
        raise CoverPipelineError("生成封面至少需要一张内容参考图。")
    normalized = list(content_references[:3])
    while len(normalized) < 3:
        normalized.append(normalized[-1])
    target = normalized[0].parent / "content-reference-board.jpg"
    panels: list[Image.Image] = []
    try:
        for path in normalized:
            with Image.open(path) as source:
                panels.append(
                    ImageOps.fit(
                        source.convert("RGB"),
                        (512, 768),
                        method=Image.Resampling.LANCZOS,
                    )
                )
        board = Image.new("RGB", (1536, 768), "white")
        for index, panel in enumerate(panels):
            board.paste(panel, (index * 512, 0))
        board.save(target, format="JPEG", quality=88, optimize=True)
    except (OSError, ValueError) as exc:
        raise CoverPipelineError("视频内容参考板生成失败。") from exc
    return target


def choose_cover_candidate(
    candidates: Iterable[bytes],
    *,
    scorer: Callable[[bytes], float] | None = None,
) -> bytes:
    ranked = [
        ((scorer or _cover_candidate_score)(candidate), candidate)
        for candidate in candidates
    ]
    if not ranked:
        raise CoverPipelineError("图像模型没有返回可筛选的封面候选。")
    score, selected = max(ranked, key=lambda item: item[0])
    if not np.isfinite(score):
        raise CoverPipelineError("图像模型返回的封面候选都无法读取。")
    return selected


class GptImage2Client:
    def __init__(
        self,
        *,
        api_key: str,
        model: str = "gpt-image-2-ssvip",
        endpoint: str = "https://www.dmxapi.cn/v1/images/edits",
        session: Any | None = None,
    ):
        if not api_key.strip():
            raise CoverPipelineError("缺少 DMXAPI_API_KEY，无法调用 GPT Image 2。")
        self.api_key = api_key
        self.model = model
        self.endpoint = endpoint
        self.session = session or requests.Session()

    def generate(self, prompt: str, references: list[Path]) -> bytes:
        if not references:
            raise CoverPipelineError("GPT Image 2 至少需要一张参考图。")
        files = [
            (
                "image",
                (
                    path.name,
                    path.read_bytes(),
                    "image/png" if path.suffix.lower() == ".png" else "image/jpeg",
                ),
            )
            for path in references
        ]
        response = self.session.post(
            self.endpoint,
            headers={"Authorization": f"Bearer {self.api_key}"},
            data={
                "model": self.model,
                "prompt": prompt,
                "size": os.environ.get("GPT_IMAGE_COVER_SIZE", "1024x1360"),
                "background": "opaque",
                "output_format": "png",
                "quality": os.environ.get("GPT_IMAGE_COVER_QUALITY", "high"),
                "n": "1",
            },
            files=files,
            timeout=int(os.environ.get("GPT_IMAGE_TIMEOUT_SECONDS", "1000")),
        )
        response.raise_for_status()
        return _gpt_image_bytes(response.json(), self.session)


class SeedreamClient:
    def __init__(
        self,
        *,
        api_key: str,
        model: str = "doubao-seedream-5-0-lite-260128",
        endpoint: str = "https://ark.cn-beijing.volces.com/api/v3/images/generations",
        session: Any | None = None,
    ):
        if not api_key.strip():
            raise CoverPipelineError("缺少 ARK_API_KEY，无法调用 Seedream。")
        self.api_key = api_key
        self.model = model
        self.endpoint = endpoint
        self.session = session or requests.Session()

    def generate(self, prompt: str, references: list[Path]) -> bytes:
        if not references:
            raise CoverPipelineError("Seedream 至少需要一张视频人物参考帧。")
        images = [_image_data_uri(path) for path in references]
        response = self.session.post(
            self.endpoint,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self.model,
                "prompt": prompt,
                "image": images,
                "size": os.environ.get("SEEDREAM_COVER_SIZE", "2K"),
                "response_format": "b64_json",
                "watermark": False,
            },
            timeout=180,
        )
        response.raise_for_status()
        return _seedream_image_bytes(response.json(), self.session)


class SeedreamProxyClient:
    def __init__(
        self,
        *,
        endpoint: str,
        worker_token: str,
        session: Any | None = None,
        max_attempts: int = 3,
        sleep: Callable[[float], None] = time.sleep,
    ):
        if not endpoint.strip() or not worker_token.strip():
            raise CoverPipelineError("缺少 Seedream 云端代理地址或 Worker Token。")
        self.endpoint = endpoint
        self.worker_token = worker_token
        self.session = session or requests.Session()
        self.max_attempts = max(1, max_attempts)
        self.sleep = sleep

    def generate(self, prompt: str, references: list[Path]) -> bytes:
        if not references:
            raise CoverPipelineError("Seedream 至少需要一张视频人物参考帧。")
        request = {
            "headers": {
                "X-Worker-Token": self.worker_token,
                "Content-Type": "application/json",
                "Accept": "text/event-stream",
            },
            "json": {
                "prompt": prompt,
                "image": [_image_data_uri(path) for path in references],
                "size": os.environ.get("SEEDREAM_COVER_SIZE", "2K"),
            },
            "timeout": 180,
            "stream": True,
        }
        for attempt in range(1, self.max_attempts + 1):
            response = self.session.post(self.endpoint, **request)
            if response.ok:
                content_type = str(response.headers.get("Content-Type") or "").lower()
                payload = (
                    _seedream_stream_payload(response)
                    if "text/event-stream" in content_type
                    else response.json()
                )
                return _seedream_image_bytes(payload, self.session)
            if response.status_code in {502, 503, 504} and attempt < self.max_attempts:
                self.sleep(min(5.0, float(2 ** (attempt - 1))))
                continue
            response.raise_for_status()
        raise CoverPipelineError("Seedream 云端代理重试后仍未返回图片。")


def build_cover_clients() -> list[tuple[str, Any]]:
    """Return configured cover providers in production priority order."""
    clients: list[tuple[str, Any]] = []
    cloud_base_url = (
        os.environ.get("COVER_CLOUD_BASE_URL")
        or os.environ.get("WORKER_CLOUD_BASE_URL")
        or ""
    ).strip().rstrip("/")
    worker_token = (
        os.environ.get("COVER_WORKER_TOKEN")
        or os.environ.get("COMPOSE_WORKER_TOKEN")
        or ""
    ).strip()
    if cloud_base_url and worker_token:
        clients.append(
            (
                "seedream-5.0-lite",
                SeedreamProxyClient(
                    endpoint=(
                        os.environ.get("SEEDREAM_PROXY_URL")
                        or f"{cloud_base_url}/functions/v1/cover-seedream-generate"
                    ),
                    worker_token=worker_token,
                ),
            )
        )

    ark_api_key = (os.environ.get("ARK_API_KEY") or "").strip()
    if ark_api_key:
        clients.append(
            (
                "seedream-5.0-lite-direct",
                SeedreamClient(
                    api_key=ark_api_key,
                    model=os.environ.get(
                        "SEEDREAM_MODEL",
                        "doubao-seedream-5-0-lite-260128",
                    ),
                ),
            )
        )

    dmx_api_key = (os.environ.get("DMXAPI_API_KEY") or "").strip()
    if dmx_api_key:
        clients.append(
            (
                "gpt-image-2-ssvip",
                GptImage2Client(
                    api_key=dmx_api_key,
                    model=os.environ.get("GPT_IMAGE_MODEL", "gpt-image-2-ssvip"),
                    endpoint=os.environ.get(
                        "DMXAPI_IMAGE_EDIT_URL",
                        "https://www.dmxapi.cn/v1/images/edits",
                    ),
                ),
            )
        )
    if not clients:
        raise CoverPipelineError("没有配置可用的封面生成模型。")
    return clients


def render_cover_text(
    image_bytes: bytes,
    copy: dict[str, Any],
    font_path: Path,
    body_font_path: Path | None = None,
) -> bytes:
    try:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as exc:
        raise CoverPipelineError("Seedream 返回的图片无法读取。") from exc
    if not font_path.is_file():
        raise CoverPipelineError(f"封面中文字体不存在：{font_path}")
    body_font_path = body_font_path or _default_body_font_path(font_path)
    if not body_font_path.is_file():
        raise CoverPipelineError(f"封面贴纸字体不存在：{body_font_path}")

    width, height = image.size
    headline = str(copy.get("headline") or "").strip()
    subtitle = str(copy.get("subtitle") or "").strip()
    highlight = str(copy.get("highlight_keyword") or "").strip()
    badges_raw = copy.get("badges")
    badges = (
        [str(item).strip() for item in badges_raw if str(item).strip()]
        if isinstance(badges_raw, list)
        else []
    )
    if subtitle and subtitle not in badges:
        badges.insert(0, subtitle)
    badges = badges[:2]
    if not headline:
        raise CoverPipelineError("封面文案缺少主标题。")

    draw = ImageDraw.Draw(image)
    seed = int(hashlib.sha256(f"{headline}|{subtitle}".encode()).hexdigest()[:16], 16)
    rng = random.Random(seed)
    margin_x = max(34, width // 24)
    cursor_y = max(24, height // 45)
    line_gap = max(4, height // 240)
    headline_lines = _editorial_headline_lines(headline, highlight, max_chars=7)

    for line_index, line in enumerate(headline_lines):
        font = _fit_font(
            font_path,
            line,
            max_width=width - margin_x * 2,
            start_size=max(84, width // 6),
            minimum_size=max(58, width // 12),
        )
        box = draw.textbbox((0, 0), line, font=font, stroke_width=max(2, width // 300))
        text_width = box[2] - box[0]
        text_height = box[3] - box[1]
        x = margin_x + rng.randint(-max(2, width // 180), max(2, width // 180))
        pad_x = max(18, width // 70)
        pad_y = max(10, height // 150)
        plate = (
            x - pad_x,
            cursor_y - pad_y,
            min(width - margin_x // 2, x + text_width + pad_x),
            cursor_y + text_height + pad_y,
        )
        _draw_rough_plate(draw, plate, rng, fill="#0A0807")
        is_highlight = bool(
            highlight
            and (
                highlight in line
                or line in highlight
                or (line_index == len(headline_lines) - 1 and highlight in headline)
            )
        )
        text_color = "#FFD21F" if is_highlight else "#FFF8EA"
        text_mask = Image.new("L", image.size, 0)
        mask_draw = ImageDraw.Draw(text_mask)
        mask_draw.text(
            (x, cursor_y - box[1]),
            line,
            font=font,
            fill=255,
            stroke_width=max(1, width // 500),
            stroke_fill=255,
        )
        scratch_draw = ImageDraw.Draw(text_mask)
        scratch_width = max(2, width // 420)
        for _ in range(max(7, text_width // max(1, width // 22))):
            scratch_y = rng.randint(
                max(0, cursor_y),
                min(height - 1, cursor_y + max(1, text_height)),
            )
            scratch_x = rng.randint(x, max(x, x + text_width - scratch_width))
            scratch_length = rng.randint(
                max(5, width // 120),
                max(8, width // 45),
            )
            scratch_draw.line(
                (
                    scratch_x,
                    scratch_y,
                    min(width - 1, scratch_x + scratch_length),
                    scratch_y + rng.randint(-2, 2),
                ),
                fill=rng.randint(0, 65),
                width=scratch_width,
            )
        color_layer = Image.new("RGB", image.size, text_color)
        image.paste(color_layer, (0, 0), text_mask)
        draw = ImageDraw.Draw(image)
        cursor_y = plate[3] + line_gap

    sticker_y = max(int(height * 0.67), cursor_y + line_gap * 2)
    if badges:
        plate_height = len(badges) * max(78, height // 13) + max(44, height // 28)
        _draw_rough_plate(
            draw,
            (
                margin_x // 2,
                sticker_y - max(18, height // 90),
                int(width * 0.82),
                min(height - max(28, height // 50), sticker_y + plate_height),
            ),
            rng,
            fill="#0A0807",
        )
    for index, badge in enumerate(badges):
        _draw_fact_sticker(
            image,
            badge,
            body_font_path,
            x=margin_x + (index % 2) * max(8, width // 140),
            y=sticker_y + index * max(78, height // 13),
            angle=-3.0 if index % 2 == 0 else 2.0,
        )

    _draw_editorial_doodles(image, seed)

    output = io.BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()


def _frame_cover_bytes(candidate: FrameCandidate) -> bytes:
    try:
        rgb = cv2.cvtColor(candidate.image, cv2.COLOR_BGR2RGB)
        frame = Image.fromarray(rgb)
        cover = ImageOps.fit(
            frame,
            (1080, 1440),
            method=Image.Resampling.LANCZOS,
            centering=(0.5, 0.5),
        )
        output = io.BytesIO()
        cover.save(output, format="PNG", optimize=True)
        return output.getvalue()
    except Exception as exc:
        raise CoverPipelineError("视频主角帧无法转换为封面底图。") from exc


def resolve_cover_font() -> Path:
    candidates = [
        Path(os.environ.get("COVER_HEADLINE_FONT_PATH", "")),
        Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"),
        Path("/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"),
        Path("/System/Library/Fonts/STHeiti Medium.ttc"),
        Path("/System/Library/Fonts/PingFang.ttc"),
    ]
    font = next((path for path in candidates if path.is_file()), None)
    if font is None:
        raise CoverPipelineError("服务器缺少可用的中文封面字体。")
    return font


def normalize_cover_png(image_bytes: bytes) -> bytes:
    try:
        with Image.open(io.BytesIO(image_bytes)) as source:
            image = source.convert("RGBA" if "A" in source.getbands() else "RGB")
            output = io.BytesIO()
            image.save(output, format="PNG", optimize=True)
            return output.getvalue()
    except Exception as exc:
        raise CoverPipelineError("封面模型返回的图片无法转换为 PNG。") from exc


def _editorial_headline_lines(
    headline: str,
    highlight: str,
    *,
    max_chars: int,
) -> list[str]:
    compact = "".join(headline.split())
    if highlight and compact.endswith(highlight) and len(highlight) <= max_chars:
        prefix = compact[: -len(highlight)]
        return [*_headline_lines(prefix, max_chars=max_chars)[:2], highlight]
    return _headline_lines(compact, max_chars=max_chars)


def _default_body_font_path(headline_font_path: Path) -> Path:
    candidates = [
        Path(os.environ.get("COVER_BODY_FONT_PATH", "")),
        Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"),
        Path("/System/Library/Fonts/STHeiti Medium.ttc"),
        headline_font_path,
    ]
    return next((path for path in candidates if path.is_file()), headline_font_path)


def _fit_font(
    font_path: Path,
    text: str,
    *,
    max_width: int,
    start_size: int,
    minimum_size: int,
) -> ImageFont.FreeTypeFont:
    size = start_size
    while size > minimum_size:
        font = ImageFont.truetype(str(font_path), size)
        box = font.getbbox(text, stroke_width=max(1, size // 80))
        if box[2] - box[0] <= max_width:
            return font
        size -= max(2, start_size // 30)
    return ImageFont.truetype(str(font_path), minimum_size)


def _draw_rough_plate(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    rng: random.Random,
    *,
    fill: str,
) -> None:
    left, top, right, bottom = (int(value) for value in box)
    jitter = max(3, (bottom - top) // 15)
    segments = 7
    top_edge = [
        (
            int(left + (right - left) * index / segments),
            top + rng.randint(-jitter, jitter),
        )
        for index in range(segments + 1)
    ]
    bottom_edge = [
        (
            int(left + (right - left) * index / segments),
            bottom + rng.randint(-jitter, jitter),
        )
        for index in reversed(range(segments + 1))
    ]
    draw.polygon([*top_edge, *bottom_edge], fill=fill)


def _draw_fact_sticker(
    image: Image.Image,
    text: str,
    font_path: Path,
    *,
    x: int,
    y: int,
    angle: float,
) -> None:
    width, height = image.size
    font = _fit_font(
        font_path,
        text,
        max_width=int(width * 0.46),
        start_size=max(34, width // 22),
        minimum_size=max(26, width // 34),
    )
    text_box = font.getbbox(text)
    pad_x = max(18, width // 55)
    pad_y = max(10, height // 140)
    sticker_width = text_box[2] - text_box[0] + pad_x * 2
    sticker_height = text_box[3] - text_box[1] + pad_y * 2
    sticker = Image.new(
        "RGBA",
        (sticker_width + pad_x, sticker_height + pad_y),
        (0, 0, 0, 0),
    )
    sticker_draw = ImageDraw.Draw(sticker)
    sticker_rng = random.Random(
        int(hashlib.sha256(text.encode()).hexdigest()[:16], 16)
    )
    _draw_rough_plate(
        sticker_draw,
        (
            pad_x // 2,
            pad_y // 2,
            pad_x // 2 + sticker_width,
            pad_y // 2 + sticker_height,
        ),
        sticker_rng,
        fill="#FFD21F",
    )
    sticker_draw.text(
        (pad_x + pad_x // 2, pad_y - text_box[1] + pad_y // 2),
        text,
        font=font,
        fill="#15110D",
    )
    rotated = sticker.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
    image.paste(rotated, (int(x), int(y)), rotated)


def _draw_editorial_doodles(image: Image.Image, seed: int) -> None:
    width, height = image.size
    draw = ImageDraw.Draw(image)
    white = "#FFF8EA"
    yellow = "#FFD21F"
    thick = max(7, width // 95)

    draw.arc(
        (int(width * 0.03), int(height * 0.48), int(width * 0.27), int(height * 0.66)),
        205,
        350,
        fill=white,
        width=thick,
    )
    draw.line(
        [
            (int(width * 0.23), int(height * 0.62)),
            (int(width * 0.27), int(height * 0.66)),
            (int(width * 0.20), int(height * 0.66)),
        ],
        fill=white,
        width=thick,
        joint="curve",
    )
    draw.arc(
        (int(width * 0.70), int(height * 0.76), int(width * 0.96), int(height * 0.94)),
        15,
        155,
        fill=white,
        width=thick,
    )
    draw.line(
        [
            (int(width * 0.72), int(height * 0.82)),
            (int(width * 0.70), int(height * 0.76)),
            (int(width * 0.77), int(height * 0.78)),
        ],
        fill=white,
        width=thick,
        joint="curve",
    )
    _draw_star(draw, int(width * 0.08), int(height * 0.72), max(18, width // 42), white, thick)
    _draw_star(draw, int(width * 0.43), int(height * 0.82), max(16, width // 48), white, thick)
    _draw_star(draw, int(width * 0.88), int(height * 0.50), max(20, width // 38), white, thick)
    for offset in range(3):
        y = int(height * (0.43 + offset * 0.018))
        draw.line(
            [(int(width * 0.04), y), (int(width * (0.09 + offset * 0.008)), y - thick)],
            fill=yellow,
            width=max(5, thick // 2),
        )


def _draw_star(
    draw: ImageDraw.ImageDraw,
    center_x: int,
    center_y: int,
    radius: int,
    fill: str,
    width: int,
) -> None:
    points = [
        (center_x, center_y - radius),
        (center_x + radius // 4, center_y - radius // 4),
        (center_x + radius, center_y),
        (center_x + radius // 4, center_y + radius // 4),
        (center_x, center_y + radius),
        (center_x - radius // 4, center_y + radius // 4),
        (center_x - radius, center_y),
        (center_x - radius // 4, center_y - radius // 4),
        (center_x, center_y - radius),
    ]
    draw.line(points, fill=fill, width=max(3, width // 2), joint="curve")


def generate_cover(
    payload: dict[str, Any],
    progress_cb: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    job = payload.get("job") if isinstance(payload.get("job"), dict) else {}
    job_id = str(job.get("id") or "").strip()
    video_url = str(
        job.get("video_url") or job.get("final_video_url") or job.get("output_url") or ""
    ).strip()
    if not job_id or not video_url:
        raise CoverPipelineError("封面任务缺少 job.id 或 video_url。")

    public_dir_raw = os.environ.get("COVER_PUBLIC_DIR")
    public_base_url = (os.environ.get("COVER_PUBLIC_BASE_URL") or "").rstrip("/")
    delivery_base_url = (
        os.environ.get("COVER_VIDEO_PUBLIC_BASE_URL")
        or f"{public_base_url}/optimized-videos"
    ).rstrip("/")
    if not public_dir_raw or not public_base_url:
        raise CoverPipelineError("缺少 COVER_PUBLIC_DIR 或 COVER_PUBLIC_BASE_URL。")

    output_root = Path(os.environ.get("COVER_OUTPUT_DIR", "/tmp/boomer-cover")).expanduser()
    public_dir = Path(public_dir_raw).expanduser()
    output_root.mkdir(parents=True, exist_ok=True)
    public_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix=f"cover-{_safe_name(job_id)}-", dir=output_root) as tmp:
        temp_dir = Path(tmp)
        _progress(progress_cb, 5, "download", "正在下载 Seedance 成片")
        video = _download(video_url, temp_dir / "video.mp4")
        delivery_source = video
        storefront_reference_url = resolve_storefront_reference(job)
        storefront_locked = False
        storefront: Path | None = None
        if storefront_reference_url:
            _progress(progress_cb, 11, "storefront_reference", "正在读取真实门头参考")
            storefront = _download(storefront_reference_url, temp_dir / "storefront-reference.jpg")
        _progress(progress_cb, 15, "optimize_video", "正在优化手机端视频加载")
        optimized_filename = f"{_safe_name(job_id)}-faststart.mp4"
        optimized_video = optimize_video_for_streaming(
            delivery_source,
            temp_dir / optimized_filename,
        )
        optimized_dir = public_dir / "optimized-videos"
        optimized_dir.mkdir(parents=True, exist_ok=True)
        optimized_public_path = optimized_dir / optimized_filename
        optimized_public_path.write_bytes(optimized_video.read_bytes())
        _progress(progress_cb, 20, "extract_character", "正在从视频提取主角参考帧")
        frame_candidates = _sample_video_frames(delivery_source)
        references = select_reference_frames(
            delivery_source,
            temp_dir / "references",
            sampler=lambda _video: frame_candidates,
        )
        character_expected = script_expects_character(job)
        has_character_reference = (
            any(path.name.startswith("character-ref-") for path in references)
            or character_expected
        )
        style = select_cover_style(payload, allow_people=has_character_reference)
        generation = (
            job.get("cover_generation")
            if isinstance(job.get("cover_generation"), dict)
            else {}
        )
        copy = generation.get("copy") if isinstance(generation.get("copy"), dict) else {}
        script = job.get("script") if isinstance(job.get("script"), dict) else {}
        normalized_copy = {
            "headline": str(copy.get("headline") or script.get("title") or "中古好物太好逛").strip(),
            "subtitle": str(copy.get("subtitle") or "").strip(),
            "highlight_keyword": str(copy.get("highlight_keyword") or "").strip(),
            "badges": (
                [str(item).strip() for item in copy.get("badges", []) if str(item).strip()]
                if isinstance(copy.get("badges"), list)
                else []
            ),
        }
        selected_source: str
        generated_candidate_count = 1
        if has_character_reference:
            _progress(progress_cb, 45, "lock_character", "正在锁定成片中的同一位主角")
            base = choose_cover_base_candidate(
                frame_candidates,
                character_expected=character_expected,
            )
            final_bytes = render_cover_text(
                _frame_cover_bytes(base),
                normalized_copy,
                resolve_cover_font(),
            )
            selected_source = "video-frame-editorial"
        else:
            _progress(progress_cb, 45, "generate", "正在生成无人物商品封面")
            style_reference = resolve_cover_style_reference()
            candidate_count = max(
                1,
                min(4, int(os.environ.get("COVER_CANDIDATE_COUNT", "1"))),
            )
            prompt = build_cover_prompt(
                payload,
                style=style,
                has_storefront_reference=storefront is not None,
                has_character_reference=False,
            )
            candidates = []
            selected_source = ""
            provider_errors: list[str] = []
            for source, client in build_cover_clients():
                try:
                    candidates = generate_cover_candidates(
                        client,
                        prompt,
                        references,
                        style_reference,
                        storefront_reference=storefront,
                        count=candidate_count,
                    )
                    selected_source = source
                    break
                except Exception as exc:
                    provider_errors.append(f"{source}: {exc}")
            if not candidates:
                raise CoverPipelineError(
                    "所有封面生成模型均失败：" + " | ".join(provider_errors)
                )
            _progress(progress_cb, 68, "select_cover", "正在筛选最接近批准风格的封面")
            final_bytes = choose_cover_candidate(candidates)
            generated_candidate_count = len(candidates)
        final_bytes = normalize_cover_png(final_bytes)

        cover_digest = hashlib.sha256(final_bytes).hexdigest()[:12]
        filename = f"{_safe_name(job_id)}-cover-{cover_digest}.png"
        final_path = public_dir / filename
        final_path.write_bytes(final_bytes)
        variation = (
            generation.get("variation")
            if isinstance(generation.get("variation"), dict)
            else {}
        )
        _progress(progress_cb, 100, "done", "封面生成完成")
        return {
            "cover_url": f"{public_base_url}/{filename}",
            "optimized_video_url": (
                f"{public_base_url}/optimized-videos/{optimized_filename}"
            ),
            "delivery_video_url": f"{delivery_base_url}/{optimized_filename}",
            "reference_frame_count": len(references),
            "candidate_count": generated_candidate_count,
            "cover_source": selected_source,
            "cover_style_key": style.key,
            "cover_style_label": style.label,
            "storefront_locked": storefront_locked,
            "storefront_reference_url": storefront_reference_url,
            "copy_fingerprint": _fingerprint(normalized_copy),
            "variation_key": _fingerprint(variation),
        }


def _sample_video_frames(video: Path, sample_count: int = 12) -> list[FrameCandidate]:
    capture = cv2.VideoCapture(str(video))
    if not capture.isOpened():
        raise CoverPipelineError("视频无法读取，不能提取人物参考帧。")
    try:
        fps = capture.get(cv2.CAP_PROP_FPS) or 25.0
        frame_count = capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0.0
        duration_s = frame_count / fps if frame_count > 0 else 15.0
        start = min(0.4, max(0.0, duration_s * 0.05))
        end = max(start, duration_s - 0.4)
        timestamps = np.linspace(start, end, num=max(1, sample_count))
        detector = cv2.CascadeClassifier(
            str(Path(cv2.data.haarcascades) / "haarcascade_frontalface_default.xml")
        )
        candidates: list[FrameCandidate] = []
        for index, timestamp in enumerate(timestamps):
            capture.set(cv2.CAP_PROP_POS_MSEC, float(timestamp) * 1000)
            ok, frame = capture.read()
            if not ok or frame is None:
                continue
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = detector.detectMultiScale(
                gray,
                scaleFactor=1.1,
                minNeighbors=5,
                minSize=(max(32, frame.shape[1] // 14), max(32, frame.shape[0] // 14)),
            )
            boxes = sorted(
                [tuple(int(value) for value in face) for face in faces],
                key=lambda box: box[2] * box[3],
                reverse=True,
            )
            candidates.append(
                FrameCandidate(
                    index=index,
                    timestamp_s=float(timestamp),
                    image=frame,
                    face_boxes=boxes,
                    quality=_frame_quality(gray, boxes),
                )
            )
        return candidates
    finally:
        capture.release()


def _frame_quality(gray: np.ndarray, faces: list[tuple[int, int, int, int]]) -> float:
    if not faces:
        return 0.0
    height, width = gray.shape[:2]
    face = faces[0]
    face_ratio = (face[2] * face[3]) / max(1, width * height)
    sharpness = min(float(cv2.Laplacian(gray, cv2.CV_64F).var()) / 1200.0, 1.0)
    brightness = float(gray.mean())
    exposure = max(0.0, 1.0 - abs(brightness - 130.0) / 130.0)
    return face_ratio * 5.0 + sharpness * 0.35 + exposure * 0.15


def _cover_candidate_score(image_bytes: bytes) -> float:
    encoded = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
    if image is None or image.size == 0:
        return float("-inf")

    height, width = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    detector = cv2.CascadeClassifier(
        str(Path(cv2.data.haarcascades) / "haarcascade_frontalface_default.xml")
    )
    faces = detector.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(max(32, width // 16), max(32, height // 16)),
    )
    face_areas = sorted(
        (int(face[2]) * int(face[3]) for face in faces),
        reverse=True,
    )
    face_ratio = (face_areas[0] / max(1, width * height)) if face_areas else 0.0
    face_score = min(face_ratio / 0.09, 1.0)
    sharpness = min(float(cv2.Laplacian(gray, cv2.CV_64F).var()) / 1200.0, 1.0)
    saturation = min(float(cv2.cvtColor(image, cv2.COLOR_BGR2HSV)[:, :, 1].mean()) / 110.0, 1.0)
    lower_third = gray[int(height * 0.62) :, :]
    foreground_detail = min(float(lower_third.std()) / 65.0, 1.0)
    return face_score * 0.45 + sharpness * 0.20 + saturation * 0.15 + foreground_detail * 0.20


def _person_crop(
    image: np.ndarray,
    face: tuple[int, int, int, int],
) -> np.ndarray:
    x, y, width, height = face
    image_height, image_width = image.shape[:2]
    left = max(0, int(x - width * 1.0))
    right = min(image_width, int(x + width * 2.0))
    top = max(0, int(y - height * 0.8))
    bottom = min(image_height, int(y + height * 3.0))
    crop = image[top:bottom, left:right]
    return crop if crop.size else image


def _image_data_uri(path: Path) -> str:
    mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def _first_seedream_item(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {}
    data = payload.get("data")
    if not isinstance(data, list) or not data or not isinstance(data[0], dict):
        return {}
    return data[0]


def _seedream_stream_payload(response: Any) -> dict[str, Any]:
    completed: dict[str, Any] | None = None
    for raw_line in response.iter_lines(decode_unicode=True):
        line = raw_line.decode("utf-8") if isinstance(raw_line, bytes) else str(raw_line)
        if not line.startswith("data:"):
            continue
        body = line[5:].strip()
        if not body or body == "[DONE]":
            continue
        try:
            event = json.loads(body)
        except json.JSONDecodeError:
            continue
        if isinstance(event, dict) and _first_seedream_item(event):
            completed = event
            continue
        if isinstance(event, dict):
            for key in ("result", "response", "output"):
                nested = event.get(key)
                if isinstance(nested, dict) and _first_seedream_item(nested):
                    completed = nested
                    break
    if completed is None:
        raise CoverPipelineError("Seedream 流式响应没有返回图片。")
    return completed


def _seedream_image_bytes(payload: Any, session: Any) -> bytes:
    item = _first_seedream_item(payload)
    encoded = item.get("b64_json")
    if isinstance(encoded, str) and encoded:
        try:
            return base64.b64decode(encoded, validate=True)
        except ValueError as exc:
            raise CoverPipelineError("Seedream 返回了无效的图片编码。") from exc

    url = item.get("url")
    if isinstance(url, str) and url:
        image_response = session.get(url, timeout=120)
        image_response.raise_for_status()
        return image_response.content
    raise CoverPipelineError("Seedream 没有返回图片。")


def _gpt_image_bytes(payload: Any, session: Any) -> bytes:
    if not isinstance(payload, dict):
        raise CoverPipelineError("GPT Image 2 返回了无法识别的响应。")
    data = payload.get("data")
    if not isinstance(data, list) or not data or not isinstance(data[0], dict):
        raise CoverPipelineError("GPT Image 2 没有返回图片。")
    item = data[0]
    encoded = item.get("b64_json")
    if isinstance(encoded, str) and encoded:
        try:
            return base64.b64decode(encoded, validate=True)
        except ValueError as exc:
            raise CoverPipelineError("GPT Image 2 返回了无效的图片编码。") from exc
    url = item.get("url")
    if isinstance(url, str) and url:
        image_response = session.get(url, timeout=120)
        image_response.raise_for_status()
        return image_response.content
    raise CoverPipelineError("GPT Image 2 没有返回图片。")


def _headline_lines(headline: str, max_chars: int) -> list[str]:
    explicit = [line.strip() for line in headline.splitlines() if line.strip()]
    if len(explicit) > 1:
        return explicit[:3]
    text = explicit[0] if explicit else ""
    if len(text) <= max_chars:
        return [text] if text else []
    line_count = min(3, (len(text) + max_chars - 1) // max_chars)
    base, extra = divmod(len(text), line_count)
    sizes = [base + (1 if index < extra else 0) for index in range(line_count)]
    lines: list[str] = []
    cursor = 0
    for size in sizes:
        lines.append(text[cursor : cursor + size])
        cursor += size
    return lines


def _download(url: str, target: Path) -> Path:
    with requests.get(url, stream=True, timeout=180) as response:
        response.raise_for_status()
        with target.open("wb") as file:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    file.write(chunk)
    return target


def _fingerprint(value: Any) -> str:
    serialized = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _safe_name(value: str) -> str:
    return "".join(character if character.isalnum() or character in "-_" else "-" for character in value)


def _progress(
    callback: Callable[[dict[str, Any]], None] | None,
    percent: int,
    stage: str,
    message: str,
) -> None:
    if callback:
        callback({"percent": percent, "stage": stage, "message": message})
