# Local Tools

The app uses sherpa-onnx as the default offline TTS engine. Its model files live under:

```text
tools/sherpa-onnx/matcha-icefall-zh-baker/
tools/sherpa-onnx/vocos-22khz-univ.onnx
```

Generated WAV audio is converted to MP3 with `ffmpeg`. Runtime/model folders under
`tools/` are ignored by git.
