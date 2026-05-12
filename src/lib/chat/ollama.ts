import { v4 as uuidv4 } from 'uuid';
import { tick } from 'svelte';
import { goto } from '$app/navigation';
import toast from 'svelte-french-toast';
import { OLLAMA_API_BASE_URL } from '$lib/constants';
import { splitStream, convertMessagesToHistory, datetimeNow } from '$lib/utils';
import type { Writable } from 'svelte/store';

interface Message {
  id: string;
  parentId: string | null;
  childrenIds: string[];
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;
  timestamp?: string;
  done?: boolean;
  error?: boolean;
  context?: any;
  info?: Record<string, any>;
}

interface History {
  messages: Record<string, Message>;
  currentId: string | null;
}

export function copyToClipboard(text: string) {
  if (!navigator.clipboard) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.position = 'fixed';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
    } catch {}
    document.body.removeChild(textArea);
    return;
  }
  navigator.clipboard.writeText(text).catch(() => {});
}

interface ChatContext {
  messages: Message[];
  history: History;
  title: string;
  selectedModels: string[];
  stopResponseFlag: boolean;
  autoScroll: boolean;
  settings: Record<string, any>;
  db: any;
  chats: Writable<any[]>;
  chatId: Writable<string>;
  isNewChat: boolean;
  notifyUpdate: () => void;
}

export function createChatHandlers(ctx: () => ChatContext) {
  const c = () => ctx();

  const setChatTitle = async (_chatId: string, _title: string) => {
    const { db, chatId, title } = c();
    await db.updateChatById(_chatId, { title: _title });
    // title is a string primitive in context, updated via callback
  };

  const generateChatTitle = async (_chatId: string, userPrompt: string, onTitleSet: (t: string) => void) => {
    const { settings, selectedModels } = c();
    if (settings.titleAutoGenerate ?? true) {
      const res = await fetch(`${settings.API_BASE_URL ?? OLLAMA_API_BASE_URL}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/event-stream' },
        body: JSON.stringify({
          model: selectedModels[0],
          prompt: `请根据以下对话内容生成一个简洁的标题（5个词以内）。

语言规则（非常重要，必须严格遵守）：
- 检测用户输入的主要语言
- 标题必须使用与用户输入完全相同的语言
- 用户输入为中文 → 标题用中文
- 用户输入为英文 → 标题用英文
- 用户输入为日文 → 标题用日文
- 用户输入为韩文 → 标题用韩文
- 无法确定语言时默认使用中文

只回复标题文本，不要加引号、解释或任何额外内容。

用户输入：${userPrompt}`,
          stream: false
        })
      })
        .then(async (res) => {
          if (!res.ok) throw await res.json();
          return res.json();
        })
        .catch((error) => {
          if ('detail' in error) toast.error(error.detail);
          return null;
        });

      if (res) {
        const newTitle = res.response === '' ? 'New Chat' : res.response;
        await c().db.updateChatById(_chatId, { title: newTitle });
        onTitleSet(newTitle);
      }
    } else {
      await c().db.updateChatById(_chatId, { title: userPrompt });
      onTitleSet(userPrompt);
    }
  };

  const sendPromptOllama = async (
    model: string,
    userPrompt: string,
    parentId: string | null,
    _chatId: string,
    onTitleSet: (t: string) => void
  ) => {
    const ctx = c();
    const { settings, db, chatId, history, messages, title, selectedModels, autoScroll } = ctx;

    let responseMessageId = uuidv4();
    let responseMessage: Message = {
      parentId,
      id: responseMessageId,
      childrenIds: [],
      role: 'assistant',
      content: '',
      model,
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
    c().notifyUpdate();

    await tick();
    window.scrollTo({ top: document.body.scrollHeight });

    // 联网搜索：如果开启了搜索，先获取搜索结果注入上下文
    let searchContext = '';
    if (settings.searchEnabled && userPrompt.trim()) {
      try {
        const userStr = localStorage.getItem('user');
        const token = userStr ? JSON.parse(userStr).token : null;
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const searchRes = await fetch(`/api/search?q=${encodeURIComponent(userPrompt.trim())}`, { headers });
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          if (searchData.context) {
            searchContext = searchData.context;
          }
        }
      } catch {}
    }

    const chatMessages = messages.map((message) => ({
      role: message.role,
      content: message.content
    }));

    if (searchContext) {
      chatMessages.unshift({ role: 'system', content: searchContext });
    }

    const res = await fetch(`${settings.API_BASE_URL ?? OLLAMA_API_BASE_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/event-stream' },
      body: JSON.stringify({
        model,
        messages: chatMessages,
        options: {
          seed: settings.seed ?? undefined,
          temperature: settings.temperature ?? undefined,
          repeat_penalty: settings.repeat_penalty ?? undefined,
          top_k: settings.top_k ?? undefined,
          top_p: settings.top_p ?? undefined,
          num_ctx: settings.num_ctx ?? undefined,
          ...(settings.options ?? {})
        },
        format: settings.requestFormat ?? undefined
      })
    }).catch(() => null);

    if (res && res.ok) {
      const reader = res.body
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(splitStream('\n'))
        .getReader();

      while (true) {
        const { value, done } = await reader.read();
        const currentCtx = c();

        if (done || currentCtx.stopResponseFlag || _chatId !== currentCtx.chatId) {
          responseMessage.done = true;
          currentCtx.notifyUpdate();
          break;
        }

        try {
          let lines = value.split('\n');
          for (const line of lines) {
            if (line !== '') {
              let data = JSON.parse(line);
              if ('detail' in data) throw data;

              if (data.done == false) {
                if (responseMessage.content == '' && data.message.content == '\n') {
                  continue;
                } else {
                  responseMessage.content += data.message.content;
                  currentCtx.notifyUpdate();
                }
              } else {
                responseMessage.done = true;
                responseMessage.context = data.context ?? null;
                responseMessage.info = {
                  total_duration: data.total_duration,
                  load_duration: data.load_duration,
                  sample_count: data.sample_count,
                  sample_duration: data.sample_duration,
                  prompt_eval_count: data.prompt_eval_count,
                  prompt_eval_duration: data.prompt_eval_duration,
                  eval_count: data.eval_count,
                  eval_duration: data.eval_duration
                };
                if (settings.responseAutoCopy) {
                  copyToClipboard(responseMessage.content);
                }
                currentCtx.notifyUpdate();
              }
            }
          }
        } catch (error: any) {
          if ('detail' in error) toast.error(error.detail);
          break;
        }

        if (autoScroll) {
          window.scrollTo({ top: document.body.scrollHeight });
        }
      }
    } else {
      responseMessage.error = true;
      responseMessage.content = 'Uh-oh! There was an issue connecting to Ollama.';
      responseMessage.done = true;
      if (res !== null) {
        try {
          const error = await res.json();
          if ('detail' in error) toast.error(error.detail);
          else toast.error(error.error);
          responseMessage.content = error.detail ?? error.error ?? responseMessage.content;
        } catch {}
      } else {
        toast.error('Uh-oh! There was an issue connecting to Ollama.');
      }
      c().notifyUpdate();
    }

    ctx.stopResponseFlag = false;
    await tick();
    if (autoScroll) {
      window.scrollTo({ top: document.body.scrollHeight });
    }

    // Save chat after streaming completes (batch save, not per-token)
    await db.updateChatById(_chatId, {
      title: title === '' ? 'New Chat' : title,
      models: selectedModels,
      options: {
        seed: settings.seed ?? undefined,
        temperature: settings.temperature ?? undefined,
        repeat_penalty: settings.repeat_penalty ?? undefined,
        top_k: settings.top_k ?? undefined,
        top_p: settings.top_p ?? undefined,
        num_ctx: settings.num_ctx ?? undefined,
        ...(settings.options ?? {})
      },
      messages: c().messages,
      history
    });

    const latestMessages = c().messages;
    if (latestMessages.length == 2 && latestMessages.at(1)?.content !== '') {
      window.history.replaceState(history.state, '', `/c/${_chatId}`);
      await generateChatTitle(_chatId, userPrompt, onTitleSet);
    }
  };

  const sendPrompt = async (userPrompt: string, parentId: string | null, _chatId: string, onTitleSet: (t: string) => void) => {
    const { selectedModels, chats, db } = c();
    await Promise.all(
      selectedModels.map(async (model) => {
        await sendPromptOllama(model, userPrompt, parentId, _chatId, onTitleSet);
      })
    );
    await chats.set(await db.getChats());
  };

  const submitPrompt = async (userPrompt: string, onTitleSet: (t: string) => void, isNewChat: boolean) => {
    const ctx = c();
    const { selectedModels, messages, history, chatId, settings, db } = ctx;

    if (selectedModels.includes('')) {
      toast.error('Model not selected');
      return;
    }
    if (messages.length != 0 && !messages.at(-1)?.done) {
      return;
    }

    document.getElementById('chat-textarea')?.style.setProperty('height', '');

    let userMessageId = uuidv4();
    let userMessage: Message = {
      id: userMessageId,
      parentId: messages.length !== 0 ? messages.at(-1)!.id : null,
      childrenIds: [],
      role: 'user',
      content: userPrompt,
      timestamp: datetimeNow()
    };

    if (messages.length !== 0) {
      history.messages[messages.at(-1)!.id].childrenIds.push(userMessageId);
    }

    history.messages[userMessageId] = userMessage;
    history.currentId = userMessageId;
    ctx.notifyUpdate();

    await tick();
    if (isNewChat && c().messages.length == 1) {
      const _chatId = chatId;
      await db.createNewChat({
        id: _chatId,
        title: 'New Chat',
        models: selectedModels,
        options: {
          seed: settings.seed ?? undefined,
          temperature: settings.temperature ?? undefined,
          repeat_penalty: settings.repeat_penalty ?? undefined,
          top_k: settings.top_k ?? undefined,
          top_p: settings.top_p ?? undefined,
          num_ctx: settings.num_ctx ?? undefined,
          ...(settings.options ?? {})
        },
        messages: c().messages,
        history
      });
    }

    setTimeout(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }, 50);

    await sendPrompt(userPrompt, userMessageId, chatId, onTitleSet);
  };

  const stopResponse = () => {
    c().stopResponseFlag = true;
  };

  const regenerateResponse = async (onTitleSet: (t: string) => void) => {
    const { messages, chatId } = c();
    if (messages.length != 0 && messages.at(-1)?.done == true) {
      messages.splice(messages.length - 1, 1);
      let userMessage = messages.at(-1)!;
      await sendPrompt(userMessage.content, userMessage.id, chatId, onTitleSet);
    }
  };

  return { sendPromptOllama, sendPrompt, submitPrompt, generateChatTitle, setChatTitle, stopResponse, regenerateResponse };
}
