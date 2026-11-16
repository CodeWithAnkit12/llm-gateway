export type EvalItem = {
  id: string;
  kind: "simple" | "hard";
  prompt: string;
  headers?: Record<string, string>; // routing hints, like a real client would send
  check: (answer: string) => boolean;
};

const has = (re: RegExp) => (answer: string) => re.test(answer);

function personJsonCheck(answer: string): boolean {
  const match = answer.match(/\{[\s\S]*\}/); // find the {...} part
  if (!match) return false;
  try {
    const obj = JSON.parse(match[0]) as Record<string, unknown>;
    return (
      String(obj.name).toLowerCase().includes("priya") &&
      Number(obj.age) === 29 &&
      /bengaluru|bangalore/i.test(String(obj.city))
    );
  } catch {
    return false;
  }
}

export const DATASET: EvalItem[] = [
  // ---------- 20 SIMPLE (80%) ----------
  {
    id: "s01",
    kind: "simple",
    prompt: "What is the capital of Australia? Answer with one word.",
    check: has(/canberra/i),
  },
  {
    id: "s02",
    kind: "simple",
    prompt: "What is 17 × 23? Reply with only the number.",
    check: has(/\b391\b/),
  },
  {
    id: "s03",
    kind: "simple",
    prompt: "Which planet is known as the Red Planet? One word.",
    check: has(/mars/i),
  },
  {
    id: "s04",
    kind: "simple",
    prompt: "What does HTTP status code 404 mean? Answer in at most 3 words.",
    check: has(/not\s*found/i),
  },
  {
    id: "s05",
    kind: "simple",
    prompt: "Convert 5 kilometers to meters. Reply with only the number.",
    check: has(/5,?000/),
  },
  {
    id: "s06",
    kind: "simple",
    prompt:
      "Is the sentence 'I love this product!' positive or negative? One word.",
    check: has(/positive/i),
  },
  {
    id: "s07",
    kind: "simple",
    prompt: "What is the chemical symbol for gold? Reply with only the symbol.",
    check: has(/\bAu\b/),
  },
  {
    id: "s08",
    kind: "simple",
    prompt: "How many days are in a leap year? Only the number.",
    check: has(/\b366\b/),
  },
  {
    id: "s09",
    kind: "simple",
    prompt:
      "Translate 'thank you' into Hindi, written in English letters. At most 3 words.",
    check: has(/dhanyava+d|shukriya/i),
  },
  {
    id: "s10",
    kind: "simple",
    prompt: "What is the largest ocean on Earth? At most 2 words.",
    check: has(/pacific/i),
  },
  {
    id: "s11",
    kind: "simple",
    prompt:
      "Extract the email address from: 'Contact Ravi at ravi.k@example.com for details.' Reply with only the email.",
    check: has(/ravi\.k@example\.com/i),
  },
  {
    id: "s12",
    kind: "simple",
    prompt: "What is the square root of 144? Only the number.",
    check: has(/\b12\b/),
  },
  {
    id: "s13",
    kind: "simple",
    prompt:
      "Which language runs natively in web browsers: Python, JavaScript or Rust? One word.",
    check: has(/javascript/i),
  },
  {
    id: "s14",
    kind: "simple",
    prompt:
      "What is the boiling point of water in Celsius at sea level? Only the number.",
    check: has(/\b100\b/),
  },
  {
    id: "s15",
    kind: "simple",
    prompt:
      "Classify this support ticket as 'billing' or 'technical': 'I was charged twice this month.' One word.",
    check: has(/billing/i),
  },
  {
    id: "s16",
    kind: "simple",
    prompt: "Who wrote 'Romeo and Juliet'? Only the surname.",
    check: has(/shakespeare/i),
  },
  {
    id: "s17",
    kind: "simple",
    prompt: "What is 15% of 200? Only the number.",
    check: has(/\b30\b/),
  },
  {
    id: "s18",
    kind: "simple",
    prompt: "What is the opposite of 'increase'? One word.",
    check: has(/decrease/i),
  },
  {
    id: "s19",
    kind: "simple",
    prompt: "How many bits are in one byte? Only the number.",
    check: has(/\b8\b/),
  },
  {
    id: "s20",
    kind: "simple",
    prompt: "What does 'CPU' stand for? At most 4 words.",
    check: has(/central\s+processing\s+unit/i),
  },

  // ---------- 5 HARD (20%) ----------
  {
    id: "h01",
    kind: "hard",
    headers: { "x-task-type": "reasoning" },
    prompt:
      "A train leaves at 9:40 and the journey takes 2 hours 35 minutes. At what time does it arrive? Think step by step, then give the final answer as HH:MM on the last line.",
    check: has(/12:15/),
  },
  {
    id: "h02",
    kind: "hard",
    headers: { "x-task-type": "reasoning" },
    prompt:
      "Box A has twice as many balls as box B. Box C has 5 fewer balls than box A. Together the three boxes have 45 balls. How many balls are in box B? End with 'Answer: <number>'.",
    check: has(/answer:\s*\**\s*10\b/i),
  },
  {
    id: "h03",
    kind: "hard",
    headers: { "x-task-type": "code" },
    prompt:
      "What does this JavaScript print?\n```js\nconst a = [1, 2, 3];\nconst b = a;\nb.push(4);\nconsole.log(a.length);\n```\nEnd with 'Answer: <value>'.",
    check: has(/answer:\s*\**\s*4\b/i),
  },
  {
    id: "h04",
    kind: "hard",
    headers: { "x-task-type": "extract" }, // NOT a "hard" type for our router → goes cheap!
    prompt:
      "Extract JSON with keys name, age, city from: 'Priya Sharma, aged 29, moved from Pune to Bengaluru last year.' The city is where she lives NOW. Reply with only JSON.",
    check: personJsonCheck,
  },
  {
    id: "h05",
    kind: "hard",
    headers: { "x-task-type": "reasoning" },
    prompt:
      "If today is Wednesday, what day of the week will it be 100 days from today? End with 'Answer: <day>'.",
    check: has(/answer:\s*\**\s*friday/i),
  },
];
