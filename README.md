## Results (eval: 19 tasks, 15 simple / 4 hard, cache off, fallback off)

| Arm | Accuracy | Total cost | Cost per correct answer | p50 latency |
|---|---|---|---|---|
| all-cheap (Groq gpt-oss-20b) | 100% | $0.000313 | $0.0000165 | 851 ms |
| **routed** | **100%** | **$0.006707** | **$0.000353** | **922 ms** |
| all-premium (Gemini 3 Flash) | 100% | $0.012185 | $0.000641 | 1,648 ms |

Routing cut **cost per correct answer by 45%** and **median latency by 44%** vs all-premium with no
accuracy loss, sending 16% of traffic to premium. The cheap tier also scored 100% on this set, so the
router is conservative here; the next step is a harder eval to find where the cheap model fails.
Routed results are computed offline by applying the (deterministic) router to the real cheap and premium
answers. Costs are shadow costs at each provider's published price; all usage ran on free tiers.