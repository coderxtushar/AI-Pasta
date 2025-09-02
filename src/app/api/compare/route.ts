import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(req: NextRequest) {
  const { prompt, models, keys } = await req.json();
  const results: any[] = [];

  for (const m of models) {
    try {
      if (m === "gpt-4o-mini") {
        const client = new OpenAI({ apiKey: keys.openai });
        const res = await client.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }]
        });
        results.push({ model: m, text: res.choices[0].message.content });
      }

      if (m === "claude-3-5-sonnet") {
        const anthropic = new Anthropic({ apiKey: keys.anthropic });
        const res = await anthropic.messages.create({
          model: "claude-3-5-sonnet",
          max_tokens: 512,
          messages: [{ role: "user", content: prompt }]
        });
        results.push({ model: m, text: res.content[0] }); //res.content[0].text
      }
      
      if (m === "groq") {
        const anthropic = new Anthropic({ apiKey: keys.anthropic });
        const res = await anthropic.messages.create({
          model: "groq",
          max_tokens: 512,
          messages: [{ role: "user", content: prompt }]
        });
        results.push({ model: m, text: res.content[0] }); //res.content[0].text
      }
    } catch (e: any) {
      results.push({ model: m, error: e.message });
    }
  }

  return NextResponse.json({ results });
}
