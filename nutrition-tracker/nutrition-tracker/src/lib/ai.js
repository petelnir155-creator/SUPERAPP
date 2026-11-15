import { DEFAULT_MODEL } from './config.js';
import { macrosOf, nowTime, r1 } from './utils.js';

async function callClaude(cfg, { system, content, maxTokens }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': cfg.key.trim(),
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: (cfg.model || '').trim() || DEFAULT_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content }],
    }),
  });
  if (!res.ok) {
    let msg = '';
    try {
      const j = await res.json();
      msg = j && j.error && j.error.message ? j.error.message : '';
    } catch (e) {
      /* no body */
    }
    throw new Error('HTTP ' + res.status + (msg ? ': ' + msg : ''));
  }
  const data = await res.json();
  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

/* ---------- הזנה: הוספה ועדכון הקשרי ---------- */
export const AI_SYSTEM = [
  'You convert a Hebrew food-diary message into JSON actions. Reply with ONLY one JSON object, no prose, no code fences:',
  '{"actions":[ ... ]}',
  'Two action types:',
  '1) {"action":"add","name":<Hebrew dish name>,"grams":<total grams or ml eaten, number>,"kcal":<total>,"p":<protein g>,"c":<carb g>,"f":<fat g>,"fb":<dietary fiber g>,"foodId":<id from USER_FOODS or null>}',
  '2) {"action":"update","id":<id of an entry from TODAY_LOG>,"grams":<the NEW total grams for that entry>}',
  'HARD RULES:',
  'R1. NO DUPLICATES. Every distinct food in the message appears in "actions" EXACTLY ONCE. Never output the same food twice, never output an item and also one of its parts.',
  'R2. A dish whose name contains "עם" (for example "הפוך עם מייפל") is ONE item. Do not split it into its components. If a matching dish exists in USER_FOODS, return it once with its foodId.',
  'R3. If the item exists in USER_FOODS, set foodId to its id and use the foods own name. Convert units to grams with unitGrams (one unit = unitGrams grams; "כוס" with no match = 240).',
  'R4. CORRECTIONS. If the message corrects something already in TODAY_LOG (cues: "ולא", "בעצם", "בסוף", "תקן", "שיניתי", "במקום", "התכוונתי", or a number that replaces an earlier amount of the same food), return ONE "update" action with that entrys id and the new total grams. NEVER add a new row for a correction, and never also add the old amount. The number after "ולא" is the OLD wrong value and must be ignored.',
  'R5. Only use "update" with an id that appears in TODAY_LOG. If nothing matches, use "add".',
  'R6. If an amount is missing assume a typical portion. Use realistic estimates. Output nothing except the JSON object.',
  'R7. FIBER. Always return "fb" (total dietary fiber in grams for the whole eaten amount, 0 if none) for every estimated item, using realistic values (for example vegetables, legumes, whole grains and fruit contain fiber; meat, fish, eggs, oil and dairy are about 0).',
].join('\n');

const numv = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export function normalizeAi(out, foods) {
  const a = out.indexOf('{');
  const z = out.lastIndexOf('}');
  const a2 = out.indexOf('[');
  const z2 = out.lastIndexOf(']');
  let raw;
  if (a >= 0 && z > a && (a2 < 0 || a < a2)) raw = JSON.parse(out.slice(a, z + 1)).actions;
  else if (a2 >= 0 && z2 > a2) raw = JSON.parse(out.slice(a2, z2 + 1));
  if (!Array.isArray(raw)) throw new Error('תשובה לא תקינה');
  const actions = [];
  for (const x of raw) {
    if (!x) continue;
    const grams = Math.min(numv(x.grams), 5000);
    if (x.action === 'update') {
      if (x.id && grams > 0) actions.push({ action: 'update', id: String(x.id), grams });
      continue;
    }
    if (!x.name || !(grams > 0)) continue;
    const food = x.foodId ? foods.find((f) => f.id === x.foodId) : null;
    if (food) {
      actions.push({ action: 'add', foodId: food.id, name: food.name, qty: Math.round(grams), unit: 'gram', g: grams, est: false, ...macrosOf(food, grams) });
    } else {
      actions.push({
        action: 'add', foodId: null, name: String(x.name), qty: Math.round(grams), unit: 'gram', g: grams, est: true,
        kcal: Math.min(numv(x.kcal), 5000), p: numv(x.p), c: numv(x.c), f: numv(x.f), fb: Math.min(numv(x.fb), 200),
      });
    }
  }
  return { actions, unknown: [] };
}

export async function aiActions(text, ctx, cfg) {
  const foods = ctx.foods.map((f) => ({
    id: f.id, name: f.name, per100g: { kcal: f.kcal, p: f.p, c: f.c, f: f.f, fb: f.fb || 0 }, unit: f.uname || null, unitGrams: f.serving,
  }));
  const today = ctx.entries.map((e) => ({ id: e.id, name: e.name, grams: r1(e.g), meal: e.meal, time: e.time, kcal: Math.round(e.kcal) }));
  const out = await callClaude(cfg, {
    system: AI_SYSTEM,
    maxTokens: 1024,
    content: 'USER_FOODS:\n' + JSON.stringify(foods) + '\n\nTODAY_LOG:\n' + JSON.stringify(today) + '\n\nMESSAGE:\n' + text,
  });
  return normalizeAi(out, ctx.foods);
}

/* ---------- המלצה: "מה לאכול עכשיו?" ---------- */
export const SUGGEST_SYSTEM = [
  'You are a concise nutrition assistant inside a personal food tracker. Reply in Hebrew only.',
  'You get the remaining calories and protein for today, the foods already eaten today, and the user own food list (per 100g, with unit sizes).',
  'Give ONE short, practical recommendation of 1-2 options, at most 60 words, plain text without markdown or bullets.',
  'Prefer foods from USER_FOODS and state concrete amounts in grams or units with approximate kcal and protein. Aim to close the protein gap within the remaining calories, without complications.',
  'Fiber is a secondary goal: if REMAINING_TODAY.fiber_g is still high (more than 10), prefer an option that also adds fiber (vegetables, fruit, legumes, whole grains) and mention the approximate fiber.',
  'If remaining calories are zero or negative, say so in one sentence and suggest only a low-calorie, high-protein option or to stop eating. If protein is already reached, do not push more protein.',
  'Do not add disclaimers, greetings or questions.',
].join('\n');

export async function aiSuggest(info, cfg) {
  const content =
    'REMAINING_TODAY: ' + JSON.stringify(info.remaining) +
    '\nGOALS: ' + JSON.stringify(info.goals) +
    '\nEATEN_TODAY: ' + JSON.stringify(info.eaten) +
    '\nUSER_FOODS: ' + JSON.stringify(info.foods) +
    '\nTIME_NOW: ' + nowTime();
  const out = await callClaude(cfg, { system: SUGGEST_SYSTEM, maxTokens: 400, content });
  if (!out) throw new Error('תשובה ריקה');
  return out;
}
