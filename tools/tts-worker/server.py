from __future__ import annotations

import os
from pathlib import Path

import requests
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel


ROOT = Path(__file__).resolve().parents[2]
MODEL_ROOT = Path(os.getenv("EMOTIVOICE_MODEL_ROOT", ROOT / "tools" / "tts-models" / "emotivoice"))
UPSTREAM_URL = os.getenv("EMOTIVOICE_UPSTREAM_URL", "http://127.0.0.1:8000").rstrip("/")

app = FastAPI(title="Emotional Healing Companion TTS Worker")


class SpeakRequest(BaseModel):
	text: str
	voiceId: str
	speaker: int
	stylePrompt: str
	rate: float = 1.0
	volume: float = 1.0


def model_status():
	repo_ready = (MODEL_ROOT / "repo").exists()
	outputs_ready = (MODEL_ROOT / "repo" / "outputs").exists() or (MODEL_ROOT / "models" / "outputs").exists()
	bert_ready = (
		(MODEL_ROOT / "repo" / "WangZeJun" / "simbert-base-chinese").exists()
		or (MODEL_ROOT / "models" / "WangZeJun" / "simbert-base-chinese").exists()
	)
	return {
		"repoReady": repo_ready,
		"outputsReady": outputs_ready,
		"bertReady": bert_ready,
		"modelsReady": outputs_ready and bert_ready,
	}


@app.get("/health")
def health():
	status = model_status()
	upstream_ok = False
	upstream_error = ""
	try:
		res = requests.get(f"{UPSTREAM_URL}/docs", timeout=2)
		upstream_ok = res.status_code < 500
	except Exception as exc:
		upstream_error = str(exc)
	return {
		"ok": status["repoReady"] and status["modelsReady"] and upstream_ok,
		"modelRoot": str(MODEL_ROOT),
		**status,
		"upstreamUrl": UPSTREAM_URL,
		"upstreamOk": upstream_ok,
		"upstreamError": upstream_error,
	}


@app.post("/speak")
def speak(payload: SpeakRequest):
	if not payload.text.strip():
		raise HTTPException(status_code=400, detail="朗读文本为空")

	status = model_status()
	if not status["repoReady"] or not status["modelsReady"]:
		raise HTTPException(
			status_code=503,
			detail=(
				"EmotiVoice 模型未安装完整。请重新运行 npm run tts:download，"
				"或按 README 手动下载 outputs 与 WangZeJun/simbert-base-chinese。"
			),
		)

	body = {
		"model": "emotivoice",
		"input": payload.text,
		"voice": str(payload.speaker),
		"speaker": payload.speaker,
		"style_prompt": payload.stylePrompt,
		"prompt": payload.stylePrompt,
		"response_format": "wav",
		"speed": max(0.6, min(1.6, payload.rate)),
	}
	try:
		res = requests.post(f"{UPSTREAM_URL}/v1/audio/speech", json=body, timeout=120)
	except requests.RequestException as exc:
		raise HTTPException(
			status_code=503,
			detail=f"EmotiVoice OpenAI-compatible API 未启动或不可达：{exc}",
		) from exc

	if not res.ok:
		raise HTTPException(status_code=res.status_code, detail=res.text[:500] or "语音生成失败")
	return Response(content=res.content, media_type=res.headers.get("content-type", "audio/wav"))
