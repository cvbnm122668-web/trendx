Market Agent is a local-first multi-source RAG and event-reasoning system for enterprise intelligence workflows. It collects public and user-provided evidence, normalizes it into a local retrieval store, and produces source-grounded outputs with freshness, credibility, stance, event classification, and human review.

The X-post workflow is only one downstream demonstration: it stress-tests whether retrieved evidence can be compressed into concise, auditable analyst-style outputs. The core contribution is the evidence pipeline, retrieval layer, structured reasoning agents, and review interface.

## What This Demonstrates

This repository is packaged as a research-oriented demo, not a finished trading
product. It demonstrates how a local evidence pipeline can support:

- privacy-preserving RAG over heterogeneous evidence
- claim-level reasoning instead of black-box summarization
- credibility and freshness labels for source-grounded outputs
- event and stance classification for government / market intelligence
- structured sanctions extraction with legal authority and market-impact fields
- a reproducible case study around Strait of Hormuz geopolitical risk

## Research Motivation

Many enterprise intelligence tasks are not simple question-answering problems.
Analysts need to reason over heterogeneous evidence:

- official statements and government pages
- trusted media reports that quote government officials
- SEC filings and regulatory documents
- PDFs, CSVs, screenshots, and internal research notes
- market and sector metadata

This project explores a local pipeline for explainable event reasoning:

```text
Raw Evidence
-> Local Evidence Store
-> Retrieval and Deduplication
-> Entity / Event / Stance Classification
-> Freshness and Credibility Reasoning
-> Market-Impact Mapping
-> Source-Grounded Report or X Post
```

Each generated claim keeps a source URL and structured reasoning fields, making
the output auditable rather than a black-box summary.

See `docs/reasoning_design.md` for the claim schema, reasoning pipeline,
credibility labels, evaluation ideas, and limitations.

## Key Capabilities

- **Local RAG store**: JSONL-based local evidence store for text, CSV summaries,
  PDFs, captions, and collected public documents.
- **Multi-source collection**: GDELT, RSS, SEC EDGAR, official government pages,
  public news metadata, and user-provided files.
- **Event reasoning**: classifies evidence by actor, event line, stance,
  credibility, freshness, and market link.
- **Conflict monitor**: specialized Hormuz / Iran-US-Israel monitor for official
  statements, trusted-media official quotes, shipping risk, military signals, and
  sanctions measures.
- **Content workflow**: converts evidence into English-only candidate X posts
  with source links and human review.
- **Web interface**: local Market Content Desk and RAG research console.

## Example Use Case: Strait of Hormuz Risk

The `government-conflict-agent` turns scattered public evidence into structured
event intelligence. It separates three reasoning lines:

- **Hormuz / Strait Line**: Strait of Hormuz, Persian Gulf, Gulf of Oman,
  shipping lanes, tanker traffic, safe passage, closure, reopening, and escort
  operations.
- **Government Position Line**: US, Iran, Israel, Gulf governments, EU, UK,
  China, Japan, India, international organizations, and security statements.
- **Sanctions Measures Line**: OFAC, Treasury, State Department, EU/UK/Canada/
  Australia/Japan sanctions, export controls, asset freezes, travel bans,
  shipping or insurance restrictions, and Iranian counter-sanctions.

For each item, the agent records:

- `actor`
- `line`
- `topic`
- `stance`
- `credibility`
- `freshness`
- `severity_score`
- `source_url`
- `symbols`
- structured sanctions fields when applicable

Credibility labels distinguish `official original` from `media quoted official`.

Example outputs are included in:

- `examples/government_conflict.example.md`
- `examples/government_conflict.example.json`
- `examples/content_pack.example.md`
- `examples/content_queue.example.json`

## Installation

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp config.example.yaml config.yaml
```

Optional PDF and web dependencies:

```bash
pip install -e ".[web,pdf]"
```

## Quick Start

Run the baseline daily evidence pipeline:

```bash
market-agent run --config config.yaml --out out/report.md
```

Run the local web interface:

```bash
market-agent web --config config.yaml --host 127.0.0.1 --port 8765
```

Open:

```text
http://127.0.0.1:8765
```

## Local RAG Ingestion

Ingest a research note:

```bash
market-agent ingest --config config.yaml --path notes.md --source research
```

Ingest market or sector CSV data:

```bash
market-agent ingest-csv --config config.yaml --path data/SPY.csv --ticker SPY --source market_data
```

Ingest a PDF:

```bash
market-agent ingest-pdf --config config.yaml --path reports/weekly.pdf --source research_pdf
```

Ingest a caption for a screenshot, chart, or other non-text asset:

```bash
market-agent ingest-asset \
  --config config.yaml \
  --path chart.png \
  --caption "Crude oil breakout with elevated energy-sector breadth." \
  --source screenshots
```

Query the local RAG store:

```bash
market-agent rag-query --config config.yaml --query "Hormuz shipping risk" --top-k 8
```

## Event Reasoning Commands

Strict Strait of Hormuz / shipping / oil-route monitor:

```bash
market-agent government-conflict-agent \
  --config config.yaml \
  --mode hormuz-brief \
  --out out/hormuz_brief.md \
  --json-out out/hormuz_brief.json
```

Iran / US / Israel official positions and concrete sanctions monitor:

```bash
market-agent government-conflict-agent \
  --config config.yaml \
  --mode conflict-brief \
  --out out/conflict_brief.md \
  --json-out out/conflict_brief.json
```

Broader safe content digest:

```bash
market-agent content-digest-agent \
  --config config.yaml \
  --max-posts 50 \
  --out out/content_digest_posts.md \
  --json-out out/content_digest_posts.json
```

Official-source geopolitical hook queue:

```bash
market-agent geopolitical-agent \
  --config config.yaml \
  --max-posts 40 \
  --out out/geopolitical_posts.md \
  --json-out out/geopolitical_posts.json
```

Energy-only news hook queue:

```bash
market-agent energy-agent \
  --config config.yaml \
  --max-posts 40 \
  --out out/energy_posts.md \
  --json-out out/energy_posts.json
```

Public stock-market positioning clues:

```bash
market-agent stock-order-agent \
  --config config.yaml \
  --max-posts 40 \
  --out out/stock_order_flow.md \
  --json-out out/stock_order_flow.json
```

Energy futures/options positioning clues:

```bash
market-agent energy-order-agent \
  --config config.yaml \
  --max-posts 40 \
  --out out/energy_order_flow.md \
  --json-out out/energy_order_flow.json
```

Topics likely to receive large discussion volume on X:

```bash
market-agent x-trend-agent \
  --config config.yaml \
  --max-topics 30 \
  --out out/x_trend_posts.md \
  --json-out out/x_trend_posts.json
```

## Web Interface

The default homepage is **Market Content Desk**, an English-only evidence-backed
content queue. It supports:

- refreshing a content pack from the browser
- optionally collecting fresh evidence before generation
- copying a single English X post
- downloading the JSON editorial queue
- writing `out/content_pack.md` and `out/content_queue.json`

The local RAG research console is available at:

```text
http://127.0.0.1:8765/research
```

## API Status

The system can run without paid LLM or market-data APIs. This is intentional for
the prototype stage: it demonstrates a local-first architecture suitable for
privacy-sensitive enterprise environments. When API budget or internal model
access is available, the same evidence pipeline can be connected to OpenAI-
compatible models, enterprise LLM gateways, or private retrieval services.

## Research Fit

The project is designed to connect practical enterprise intelligence workflows
with research questions in data management, knowledge integration, multimodal RAG,
and explainable reasoning:

- How should heterogeneous evidence be normalized into comparable claims?
- How can a system preserve source provenance through retrieval and generation?
- How should freshness, credibility, stance, and event type affect final reports?
- How can local RAG be extended into a small event graph or knowledge graph?
- How can claim-level outputs be evaluated against human-labeled reasoning traces?

## Repository Guide

- `src/market_agent/`: package source code
- `src/market_agent/agents/government_conflict_agent.py`: Hormuz / conflict /
  sanctions reasoning agent
- `src/market_agent/rag/`: local evidence store, retrieval, and trend utilities
- `docs/reasoning_design.md`: research-demo reasoning design
- `docs/financial_multimodal_rag.md`: broader local RAG architecture notes
- `examples/`: sample Markdown and JSON outputs
- `tests/`: unit tests for core reasoning and rendering behavior

## Limitations

- The prototype uses public/free sources and may miss dynamic or blocked official
  pages.
- Some official pages do not expose clean timestamps, so strict modes may exclude
  useful but stale-looking records.
- Current reasoning is mostly deterministic; model-backed extraction can improve
  entity resolution, stance detection, and multi-hop explanations.
- Outputs are research artifacts for human review, not investment advice.

## Repository Description

Recommended GitHub description:

```text
Privacy-preserving local RAG and event-reasoning agent for enterprise intelligence.
```

Alternative:

```text
Local multi-source RAG system for explainable event reasoning over official statements, filings, PDFs, CSVs, and market intelligence.
```

## Notes

- The project uses public metadata, official documents, user-provided evidence,
  and local storage.
- It does not bypass paywalls or login-protected content.
- Generated reports are intended for analyst review, not automated publication or
  trading.
