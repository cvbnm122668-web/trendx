# TrendX: Source-Grounded Trend Monitoring and Review Workflow

TrendX is a browser-based system for monitoring public web trends and converting selected articles into concise, source-linked draft outputs for human review.

The current demo uses X posts as the output format because they are short, constrained, and easy to inspect. The broader goal is to test an evidence-to-output workflow: collect public signals, rank and filter noisy sources, preserve attribution, generate concise drafts, and keep a human in the review loop.

Live demo: https://cvbnm122668-web.github.io/trendx/

# Overview

````markdown

TrendX helps users move from noisy public information to reviewable, source-grounded outputs.

```text
Public Sources
-> Article Collection
-> Deduplication and Trend Scoring
-> Category / Keyword Filtering
-> Human Selection
-> Draft Generation
-> Edit, Copy, or Export




The public demo is fully client-side and runs on GitHub Pages without a backend.

Features
Collects trending articles from technology, world news, and business sources.
Aggregates browser-accessible RSS, Hacker News, and Reddit data.
Supports category filters, keyword search, and sorting by trend score, recency, or source.
Computes lightweight trend scores using recency, engagement, and headline signals.
Deduplicates overlapping articles by normalized title.
Lets users select up to 40 articles for draft generation.
Generates editable X-post drafts with source links.
Tracks character count for the 280-character constraint.
Supports copy, regenerate, copy-all, and .txt export.
Provides a two-panel review interface: evidence selection on the left, generated outputs on the right.
Data Sources
The demo uses public, browser-accessible sources:

RSS feeds through a public RSS-to-JSON proxy
Hacker News Firebase API
Reddit JSON endpoints
Source categories include:

Technology: TechCrunch, The Verge, Wired, Ars Technica, MIT Technology Review, Hacker News
World: BBC World, NPR, Al Jazeera, The Guardian, DW News, Reddit news communities
Business: CNBC, MarketWatch, Investopedia, Inc., Fast Company, Reddit investing/business communities
Why Use X Posts as the Output Format?
X posts are used as a compact evaluation surface, not as the main research contribution.

A short post forces the system to make several decisions clearly:

Which source is worth using?
What is the central claim?
Can the output stay concise?
Is attribution preserved?
Can a human quickly inspect and edit the result?
Does the generated text remain grounded in the selected evidence?
This makes the interface useful for studying source-grounded generation, evidence review, and human-in-the-loop output workflows.

System Design
The GitHub Pages version is intentionally lightweight:

````markdown

index.html
style.css
app.js

```text


data fetching
filtering
trend scoring
deduplication
article selection
draft generation
editing and export
This makes the project easy to inspect, deploy, and reproduce.

Research Relevance
TrendX is a small front-end prototype for a broader RAG and evidence-reasoning workflow.

The current demo does not require a backend retrieval store, but the interface maps naturally to RAG research tasks:

source collection and filtering
retrieval result inspection
citation and attribution checking
freshness and source-quality review
human evaluation of generated outputs
dashboard design for failure analysis
Future versions can connect this interface to a local RAG store, structured document metadata, citation verification, event extraction, and benchmark evaluation.

Future Work
Add local evidence storage and retrieval.
Add source credibility and freshness labels.
Cluster duplicate stories across independent sources.
Add citation verification for generated drafts.
Support analyst-style summaries in addition to X posts.
Add failure labels for unsupported, stale, or weakly grounded outputs.
Connect the review interface to RAG benchmark construction and evaluation dashboards.
Positioning
TrendX demonstrates an end-to-end evidence workflow: collecting public signals, ranking noisy sources, preserving attribution, generating concise outputs, and designing a review interface for human oversight.

The most relevant contribution is not the post template itself, but the workflow around evidence collection, source grounding, output review, and extensibility toward RAG evaluation.
```
