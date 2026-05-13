import toast from 'svelte-french-toast';
import type { Writable } from 'svelte/store';
import { datetimeNow } from '$lib/utils';

export interface ApiProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: { id: string; name: string }[];
}

interface OpenAIMessage {
  role: string;
  content: string;
  images?: string[];
}

interface ChatContext {
  messages: any[];
  history: any;
  stopResponseFlag: boolean;
  autoScroll: boolean;
  selectedModels: string[];
  settings: Record<string, any>;
  db: any;
  chats: Writable<any[]>;
  chatId: Writable<string>;
  notifyUpdate: () => void;
}

// 获取所有配置的第三方提供商
export function getProviders(): ApiProvider[] {
  try {
    return JSON.parse(localStorage.getItem('apiProviders') ?? '[]');
  } catch {
    return [];
  }
}

// 查找模型所属的提供商（模型名为 "提供商名/模型ID" 格式）
export function findProvider(modelName: string): ApiProvider | null {
  const parts = modelName.split('/');
  // 先用完整名匹配，再用模型ID匹配
  return getProviders().find(p =>
    p.models.some(m => m.id === modelName || (parts.length > 1 && m.id === parts.slice(1).join('/')))
  ) ?? null;
}

// 获取所有第三方模型（供 ModelSelector 使用）
export function getAllThirdPartyModels(): { name: string; provider: string }[] {
  return getProviders().flatMap(p =>
    p.models.map(m => ({ name: m.id, provider: p.name }))
  );
}

// 获取第三方模型列表（Ollama models 格式，直接合并到 $models）
export function getThirdPartyModels(): any[] {
  try {
    return getProviders().flatMap((p: any) =>
      p.models.map((m: any) => ({
        name: `${p.name}/${m.id}`,
        details: { family: p.name, parameter_size: 'API', quantization_level: '' },
        size: 0
      }))
    );
  } catch { return []; }
}

// 从 OpenAI 兼容 API 获取模型列表
export async function fetchModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const url = baseUrl.replace(/\/+$/, '') + '/models';
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return (data.data ?? []).map((m: any) => m.id).filter((id: string) =>
    !id.startsWith('dall-e') && !id.startsWith('whisper') && !id.startsWith('tts')
  );
}

// OpenAI 兼容流式聊天
export async function sendPromptOpenAI(
  provider: ApiProvider,
  model: string,
  userPrompt: string,
  parentId: string | null,
  _chatId: string,
  ctx: ChatContext,
  onTitleSet: (t: string) => void
) {
  const { settings, db, history, messages, title, selectedModels, autoScroll, notifyUpdate } = ctx;
  const uuid = await import('uuid');
  const { tick } = await import('svelte');

  let responseMessageId = uuid.v4();
  let responseMessage: any = {
    parentId,
    id: responseMessageId,
    childrenIds: [],
    role: 'assistant',
    content: '',
    model: `${provider.name}/${model}`,
    timestamp: datetimeNow()
  };

  history.messages[responseMessageId] = responseMessage;
  history.currentId = responseMessageId;
  if (parentId !== null) {
    history.messages[parentId].childrenIds = [
      ...history.messages[parentId].childrenIds,
      responseMessageId
    ];
  }
  notifyUpdate();
  await tick();
  window.scrollTo({ top: document.body.scrollHeight });

  // 构建 OpenAI 格式消息
  const apiMessages: OpenAIMessage[] = messages.map((msg: any) => ({
    role: msg.role,
    content: msg.content,
    ...(msg.images?.length ? {
      content: [
        { type: 'text', text: msg.content },
        ...msg.images.map((img: string) => ({
          type: 'image_url' as const,
          image_url: { url: img.includes(',') ? img : `data:image/jpeg;base64,${img}` }
        }))
      ]
    } : {})
  }));

  // 注入 system prompt
  let systemPrompt = settings.systemPrompt ?? '';
  if (settings.emotionSensing !== false) {
    systemPrompt = systemPrompt || '你是一个温暖共情的AI助手。';
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const baseUrl = provider.baseUrl.replace(/\/+$/, '');
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
          ...apiMessages
        ] as any[],
        stream: true,
        temperature: settings.temperature ?? undefined,
        top_p: settings.top_p ?? undefined,
        max_tokens: settings.max_tokens ?? undefined,
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${res.status}`);
    }

    const reader = res.body!
      .pipeThrough(new TextDecoderStream())
      .getReader();

    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done || ctx.stopResponseFlag || _chatId !== ctx.chatId) {
        responseMessage.done = true;
        notifyUpdate();
        break;
      }

      buffer += value;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const jsonStr = trimmed.slice(6);
        if (jsonStr === '[DONE]') {
          responseMessage.done = true;
          notifyUpdate();
          break;
        }
        try {
          const data = JSON.parse(jsonStr);
          const delta = data.choices?.[0]?.delta?.content;
          if (delta) {
            responseMessage.content += delta;
            notifyUpdate();
          }
        } catch { /* skip malformed lines */ }
      }

      if (ctx.autoScroll) {
        window.scrollTo({ top: document.body.scrollHeight });
      }
    }
  } catch (error: any) {
    clearTimeout(timeout);
    responseMessage.error = true;
    responseMessage.done = true;
    if (!responseMessage.content) {
      responseMessage.content = error.name === 'AbortError'
        ? '请求超时，请稍后重试'
        : `API 调用失败：${error.message || '未知错误'}`;
    }
    toast.error('API 请求失败：' + (error.message || '未知错误'));
    notifyUpdate();
  }

  ctx.stopResponseFlag = false;
  await tick();
  if (ctx.autoScroll) {
    window.scrollTo({ top: document.body.scrollHeight });
  }

  // 隐私模式跳过保存
  const curSettings = ctx.settings;
  if (!curSettings.privacyMode) {
    await db.updateChatById(_chatId, {
      title: title === '' ? 'New Chat' : title,
      models: selectedModels,
      options: {},
      messages: ctx.messages,
      history
    });
  }

  // 生成标题
  const latestMessages = ctx.messages;
  if (latestMessages.length === 2 && latestMessages.at(1)?.content !== '') {
    window.history.replaceState(history.state, '', `/c/${_chatId}`);
    if (!curSettings.privacyMode) {
      await generateOpenAITitle(provider, model, userPrompt, _chatId, onTitleSet, settings, ctx);
    }
  }
}

async function generateOpenAITitle(
  provider: ApiProvider,
  model: string,
  userPrompt: string,
  _chatId: string,
  onTitleSet: (t: string) => void,
  settings: Record<string, any>,
  ctx: ChatContext
) {
  if (!(settings.titleAutoGenerate ?? true)) {
    await ctx.db.updateChatById(_chatId, { title: userPrompt });
    onTitleSet(userPrompt);
    return;
  }
  try {
    const baseUrl = provider.baseUrl.replace(/\/+$/, '');
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'user', content: `请根据以下对话内容生成一个简洁的标题（5个词以内）。\n语言规则：检测用户输入语言，标题使用相同语言。只回复标题文本。\n\n用户输入：${userPrompt}` }
        ],
        max_tokens: 20,
        temperature: 0.3
      })
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    const newTitle = data.choices?.[0]?.message?.content?.trim() || 'New Chat';
    await ctx.db.updateChatById(_chatId, { title: newTitle });
    onTitleSet(newTitle);
  } catch {
    await ctx.db.updateChatById(_chatId, { title: userPrompt });
    onTitleSet(userPrompt);
  }
}
