# Multi-Channel Customer Acquisition & Conversion Process (Camunda 7)

Individual lab project, course *Business Process Analysis & Design* (UIT, May 2026).

A lead-to-order business process modeled in BPMN 2.0 and executed on Camunda 7, with three service tasks automated by external-task workers.

![Process diagram](docs/QT08-QuyTrinhThuHut&ChuyenDoiKhachHangDaKenh.png)

## Process
- Lanes: Marketing, Sales / Customer Service, Warehouse
- Gateways: lead completeness, purchase intent, stock availability
- User tasks use Camunda forms (`process/forms/*.form`)

| Service task | Topic | Worker |
|---|---|---|
| Send multi-channel campaign | `send-campaign` | `bots/bot1-send-campaign` (email, Facebook, Telegram, Google Sheets) |
| Save lead & AI scoring | `save-score-lead` | `bots/bot2-save-score-lead` (Groq LLM, Google Sheets) |
| Generate PDF invoice & send confirmation email | `invoice-email` | `bots/bot4-invoice-email` (PDF, SMTP, Google Sheets) |

## Structure
```
process/          final BPMN (QT08)
process/forms/    5 Camunda forms used by the user tasks
process/drafts/   earlier BPMN versions
bots/             Node.js Camunda external-task workers
docs/             process diagram (PNG)
```

## Run a worker
1. Deploy `process/QT08-...bpmn` and the 5 forms in `process/forms/` to Camunda 7 (`http://localhost:8080/engine-rest`).
2. In each bot folder: copy `.env.example` to `.env`, fill in keys, put a Google service-account key at `credentials/google-service-account.json`.
3. `npm install && npm start`
