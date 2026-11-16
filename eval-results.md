# Eval results (2026-11-16)

19 questions (15 simple / 4 hard). Cache off, fallback off. Cheap = Groq gpt-oss-20b, premium = Gemini 3 Flash. Routed is computed offline by applying the router's rules to the real cheap/premium answers. Shadow cost at list prices.

| Arm | Accuracy | Total cost | Cost per correct answer | p50 | p95 | Errors |
|---|---|---|---|---|---|---|
| all-cheap | 100% (19/19) | $0.000313 | $0.0000165 | 851 ms | 1971 ms | 0 |
| routed | 100% (19/19) | $0.006707 | $0.0003530 | 922 ms | 4295 ms | 0 |
| all-premium | 100% (19/19) | $0.012185 | $0.0006413 | 1648 ms | 4295 ms | 0 |

## Headline (routed vs all-premium)
- Total cost: **45.0% lower**
- Cost per correct answer: **45.0% lower**
- Accuracy: routed 19/19 vs premium 19/19
- Routed sent **16%** of requests to the premium model

## Per question
| Question | Kind | all-cheap | routed | all-premium |
|---|---|---|---|---|
| s01 | simple | ✅ | ✅ | ✅ |
| s02 | simple | ✅ | ✅ | ✅ |
| s03 | simple | ✅ | ✅ | ✅ |
| s04 | simple | ✅ | ✅ | ✅ |
| s05 | simple | ✅ | ✅ | ✅ |
| s06 | simple | ✅ | ✅ | ✅ |
| s07 | simple | ✅ | ✅ | ✅ |
| s08 | simple | ✅ | ✅ | ✅ |
| s09 | simple | ✅ | ✅ | ✅ |
| s10 | simple | ✅ | ✅ | ✅ |
| s11 | simple | ✅ | ✅ | ✅ |
| s12 | simple | ✅ | ✅ | ✅ |
| s13 | simple | ✅ | ✅ | ✅ |
| s14 | simple | ✅ | ✅ | ✅ |
| s15 | simple | ✅ | ✅ | ✅ |
| h01 | hard | ✅ | ✅ | ✅ |
| h02 | hard | ✅ | ✅ | ✅ |
| h03 | hard | ✅ | ✅ | ✅ |
| h04 | hard | ✅ | ✅ | ✅ |