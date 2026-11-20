import { DEFAULT_MODEL } from './config.js';
import { macrosOf, r1 } from './utils.js';
import { STRENGTH_CATS, lastPerformance, typeOf } from './workouts.js';

async function callClaudeRaw(cfg, { system, content, maxTokens }) {
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
  const blocks = data.content || [];
  return {
    text: blocks.filter((b) => b.type === 'text').map((b) => b.text).join('').trim(),
    stop: data.stop_reason || '',
    types: blocks.map((b) => b.type).join(','),
  };
}

async function callClaude(cfg, args) {
  return (await callClaudeRaw(cfg, args)).text;
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
  'R3. If the item exists in USER_FOODS, set foodId to its id and use the foods own name. Convert units to grams with unitGrams (one unit = unitGrams grams; altUnits, when present, lists other units as {n:name,g:grams}; "כוס" with no match = 240).',
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
    id: f.id, name: f.name, per100g: { kcal: f.kcal, p: f.p, c: f.c, f: f.f, fb: f.fb || 0 }, unit: f.uname || null, unitGrams: f.serving, altUnits: f.alt || undefined,
  }));
  const today = ctx.entries.map((e) => ({ id: e.id, name: e.name, grams: r1(e.g), meal: e.meal, time: e.time, kcal: Math.round(e.kcal) }));
  const out = await callClaude(cfg, {
    system: AI_SYSTEM,
    maxTokens: 1024,
    content: 'USER_FOODS:\n' + JSON.stringify(foods) + '\n\nTODAY_LOG:\n' + JSON.stringify(today) + '\n\nMESSAGE:\n' + text,
  });
  return normalizeAi(out, ctx.foods);
}

/* ---------- אימונים ומשמרות הדרכה: ניתוח טקסט חופשי ---------- */
const STRENGTH_MUSCLES = STRENGTH_CATS.map((c) => c.id);

/* canShift: רק למשתמשת שהיא מדריכה. אצל מי שלא, המערכת לא מכירה בכלל פעולה כזו */
export const workoutSystem = (canShift) =>
  [
    'You convert a Hebrew workout-diary message into JSON. Reply with ONLY one JSON object, no prose, no code fences:',
    '{"actions":[ ... ]}',
    'Action types, chosen with the field "type":',
    '1) strength (weights): {"type":"strength","exercise":<Hebrew name>,"exId":<id from EXERCISES or null>,"muscle":<' + STRENGTH_MUSCLES.join('|') + '>,"sets":[{"reps":<n>,"kg":<n>}]}',
    '2) machine cardio (treadmill, elliptical, bike, rowing machine): {"type":"machine","exercise":<Hebrew name>,"exId":<id or null>,"minutes":<n>,"speed_kmh":<average speed, 0 if not given>}',
    '3) outdoor run: {"type":"run","exercise":"ריצת חוץ","exId":<id or null>,"distance_km":<n>,"minutes":<n>}',
    '4) machine pilates (the user own training): {"type":"pilates","exercise":"פילאטיס מכשירים","exId":<id or null>,"minutes":<n>}',
    canShift ? '5) teaching shift (paid work, NOT a workout): {"type":"shift","hours":<n>}' : '',
    'Muscle groups: chest=חזה, back=גב, shoulders=כתפיים, biceps=יד קדמית (ביצפס, כפיפת מרפקים, פטישים), triceps=יד אחורית (טריצפס, פשיטת מרפקים, מקבילים, צרפתי), legs=רגליים, abs=בטן.',
    'HARD RULES:',
    'W1. Every distinct exercise appears in "actions" EXACTLY ONCE with all of its data inside that one action. Never repeat an exercise.',
    'W2. Strength: expand set counts into separate set objects ("3 סטים של 12 עם 60 קילו" is three objects {"reps":12,"kg":60}). If sets differ, list each set with its own values in order. Body weight ("משקל גוף", pull-ups or push-ups with no load) means "kg":0. Extra load on a body-weight exercise ("מתח עם 10 קילו") is that load.',
    'W3. Always tag a strength exercise with the correct "muscle" group, even when the exercise is already in EXERCISES.',
    'W4. Treadmill and elliptical: only minutes and speed_kmh, never sets or reps. Outdoor run: only distance_km and minutes. Pilates: only minutes. If a number is not given use 0. Convert hours to minutes for "minutes".',
    'W5. Match each exercise to EXERCISES by meaning (Hebrew or English name, "en"; spelling, prefixes, machine/cable/dumbbell wording and synonyms differ) and return its id in "exId". If none matches, set "exId" to null and give a clean Hebrew name. Never invent an id. Treadmill ("הליכון") and walking on it are "machine"; running outside ("ריצה בחוץ", "רצתי X ק״מ") is "run".',
    'W6. If the user says the same as last time ("כמו בפעם שעברה", "אותו דבר"), copy the values from LAST_PERFORMANCE for that exercise. Never return null for a number.',
    canShift
      ? 'S1. WORK vs WORKOUT. The user is a pilates instructor. Her own training uses verbs like עשיתי, התאמנתי, הייתי באימון: that is a "pilates" or other workout action. Teaching uses verbs like העברתי, הדרכתי, לימדתי, "שעות הדרכה", "שיעורים שהעברתי": that is ONE "shift" action with the total in hours (90 דקות = 1.5), and it is never also a workout. "העברתי 4 שעות הדרכה" is a shift. "עשיתי פילאטיס 50 דקות" is a workout. With no verb ("פילאטיס 50 דקות") it is her own workout.'
      : 'S1. This user does not teach. Never output a shift. Ignore statements about teaching hours.',
    'W7. Ignore anything that is not exercise. Output nothing except the JSON object.',
  ]
    .filter(Boolean)
    .join('\n');

const muscleOk = (c) => (STRENGTH_MUSCLES.includes(c) ? c : null);
const TYPES = ['strength', 'machine', 'run', 'pilates'];

export function normalizeWorkout(out, exercises, canShift) {
  const a = out.indexOf('{');
  const z = out.lastIndexOf('}');
  if (a < 0 || z <= a) throw new Error('תשובה לא תקינה');
  const raw = JSON.parse(out.slice(a, z + 1)).actions;
  if (!Array.isArray(raw)) throw new Error('תשובה לא תקינה');
  const actions = [];
  let shiftMin = 0;
  for (const x of raw) {
    if (!x) continue;
    if (x.type === 'shift') {
      if (canShift) shiftMin += Math.min(numv(x.hours), 24) * 60 + Math.min(numv(x.minutes), 1440);
      continue;
    }
    const ex = x.exId ? exercises.find((e) => e.id === x.exId) : null;
    const name = ex ? ex.name : String(x.exercise || x.name || '').trim();
    if (!name) continue;
    const type = ex ? typeOf(ex) : TYPES.includes(x.type) ? x.type : 'strength';
    const act = { type, exId: ex ? ex.id : null, name, cat: ex && type === 'strength' && !muscleOk(x.muscle) ? ex.cat : muscleOk(x.muscle) || (ex ? ex.cat : null) };
    if (type === 'strength') act.sets = (Array.isArray(x.sets) ? x.sets : []).map((s) => ({ reps: numv(s && s.reps), kg: numv(s && s.kg) })).filter((s) => s.reps > 0);
    else {
      act.minutes = Math.min(numv(x.minutes), 600);
      act.speed = Math.min(numv(x.speed_kmh != null ? x.speed_kmh : x.speed), 40);
      act.km = Math.min(numv(x.distance_km != null ? x.distance_km : x.km), 200);
    }
    actions.push(act);
  }
  if (shiftMin > 0) actions.push({ type: 'shift', minutes: Math.round(shiftMin) });
  return { actions, unknown: [] };
}

export async function aiWorkout(text, ctx, cfg) {
  const exercises = ctx.exercises.map((e) => ({ id: e.id, name: e.name, ...(e.en ? { en: e.en } : {}), muscle: e.cat, type: typeOf(e) }));
  const last = ctx.exercises
    .map((e) => ({ e, w: lastPerformance(ctx.user, e.id, ctx.today) }))
    .filter((x) => x.w)
    .map((x) => ({
      exId: x.e.id, name: x.e.name, date: x.w.date,
      ...(typeOf(x.e) === 'strength' ? { sets: x.w.sets.map((s) => ({ reps: s.reps, kg: s.kg })) } : { minutes: x.w.minutes, speed_kmh: x.w.speed, distance_km: x.w.km }),
    }));
  const out = await callClaude(cfg, {
    system: workoutSystem(!!ctx.canShift),
    maxTokens: 1500,
    content: 'EXERCISES:\n' + JSON.stringify(exercises) + '\n\nLAST_PERFORMANCE:\n' + JSON.stringify(last) + '\n\nMESSAGE:\n' + text,
  });
  return normalizeWorkout(out, ctx.exercises, !!ctx.canShift);
}
