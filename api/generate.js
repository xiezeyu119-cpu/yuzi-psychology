export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: '服务端未配置 GROQ_API_KEY',
      hint: '请在 Vercel 项目 Settings → Environment Variables 中配置'
    });
    return;
  }

  try {
    const { agent, payload } = req.body || {};

    if (!agent) {
      res.status(400).json({ error: 'Missing agent type' });
      return;
    }

    const systemBase = `
你是小红书账号「鱼仔的心理树洞」背后的内容创作助理，负责身心疗愈、情感关系、女性成长方向的内容。
账号风格：有故事感、有共鸣、温柔但有力量；语言口语化但不鸡汤，尊重用户边界，不制造焦虑。
目标用户：25-35岁女性，长期处于高压、内耗、情绪不稳定、亲密关系困扰等状态。

所有输出必须贴近日常对话语气，避免生硬的专业术语；有心理学底层逻辑，但不要大段理论堆砌。
    `.trim();

    let system = systemBase;
    let userPrompt = '';
    let maxTokens = 1800;

    if (agent === 'content') {
      const { keyword, style, count } = payload || {};
      system += `

你现在的身份是「内容生产 Agent」，负责根据关键词生成多条小红书心理学笔记。
输出时必须使用严格 JSON 格式，结构为：
{
  "posts": [
    {
      "title": "string，适合封面的爆款标题",
      "body": "string，小红书正文，按自然段换行，不要带标题和标签",
      "tags": ["#标签1", "#标签2", "..."],
      "style": "healing_story | practical | emotional",
      "thinking": "string，简要说明这个笔记的切入角度、结构设计和心理学考量"
    }
  ]
}

不要输出任何多余文字（包括解释、前后缀），只输出 JSON。
每条都要兼顾：有故事感、有共鸣、有具体可执行的小建议。
      `.trim();

      userPrompt = `
关键词：${keyword}
风格偏好：${style}
需要条数：${count}

请按照要求生成 ${count} 条不同角度的笔记。
      `.trim();
    } else if (agent === 'radar') {
      const { keyword } = payload || {};
      system += `

你现在的身份是「爆款雷达 Agent」，负责帮创作者评估情绪话题的流行切入角度。
输出时必须使用严格 JSON 格式，结构为：
{
  "keyword": "string，输入的情绪关键词",
  "ideas": [
    {
      "angleTitle": "string，这个角度的工作标题",
      "summary": "string，用1-2句话概括这个选题在讲什么",
      "painPoints": ["string，用户痛点1", "string，用户痛点2", "..."],
      "suggestions": ["string，建议怎么写/用什么故事切入", "..."]
    }
  ]
}

只输出 JSON，不要多余说明。
      `.trim();

      userPrompt = `
情绪关键词：${keyword}
请给出 3 个不同角度的选题方向。
      `.trim();
    } else if (agent === 'titles') {
      const { topic } = payload || {};
      system += `

你现在的身份是「标题测试 Agent」，负责为一个主题生成多种风格的小红书标题。
输出时必须使用严格 JSON 格式，结构为：
{
  "topic": "string，输入的主题",
  "titles": [
    {
      "title": "string，小红书风格标题",
      "style": "suspense | empathy | practical | contrast | curiosity | list | story | other",
      "why": "string，用通俗语言解释：这个标题为什么有可能会爆，从用户心理、信息差、情绪价值等角度说明"
    }
  ]
}

只输出 JSON，不要多余说明。
      `.trim();

      userPrompt = `
主题：${topic}
请给出 8 个不同风格的标题。
      `.trim();
    } else {
      res.status(400).json({ error: 'Unknown agent type' });
      return;
    }

    const apiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userPrompt }
        ]
      })
    });

    if (!apiRes.ok) {
      const errorText = await apiRes.text();
      res.status(apiRes.status).json({ error: 'Groq API error', detail: errorText });
      return;
    }

    const data = await apiRes.json();
    const textContent = (data.choices?.[0]?.message?.content || '').trim();

    let parsed;
    try {
      parsed = JSON.parse(textContent);
    } catch (e) {
      res.status(500).json({
        error: 'Failed to parse model JSON',
        raw: textContent
      });
      return;
    }

    res.status(200).json({ agent, data: parsed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Unexpected server error' });
  }
}
