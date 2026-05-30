# EmotiVoice TTS Worker

This worker exposes the small `/health` and `/speak` API consumed by SvelteKit.

It expects EmotiVoice model files under:

```text
tools/tts-models/emotivoice/
```

Run:

```bash
npm run tts:download
python -m pip install -r tools/tts-worker/requirements.txt
python -m pip install -r tools/tts-models/emotivoice/repo/requirements.txt
python -m pip install -r tools/tts-models/emotivoice/repo/requirements.openaiapi.txt
npm run tts:serve
```

`npm run tts:serve` starts both EmotiVoice's OpenAI-compatible TTS API at
`http://127.0.0.1:8000` and this worker at `http://127.0.0.1:8510`.
Override with `EMOTIVOICE_UPSTREAM_URL` if you run the upstream API yourself.
