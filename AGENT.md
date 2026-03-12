You are a senior Rust systems architect and React frontend architect.

Design and implement a production-grade desktop analytics application called:

ArrowLens (Local Massive Data Explorer)

The system must allow users to explore and analyze massive datasets (10GB–100GB+) locally with extremely high performance using SQL queries and interactive visualizations.

The application must be built using:

Frontend
- React
- TypeScript
- MVVM architecture
- TailwindCSS
- Virtualized UI components

Desktop Runtime
- Tauri

Backend Engine
- Rust
- Apache Arrow
- DataFusion
- DuckDB (optional)

The application must follow modern software architecture principles including scalability, modularity, observability, and performance optimization.

--------------------------------

CORE PRODUCT GOAL

Create a high-performance local analytics desktop environment capable of:

- opening massive datasets instantly
- executing SQL queries interactively
- visualizing results
- streaming large query outputs
- avoiding full dataset memory loading

Target users:

- data engineers
- data analysts
- ML engineers
- backend engineers

--------------------------------

SYSTEM ARCHITECTURE

Use a layered architecture:

UI Layer
React Views

ViewModel Layer
Application logic and state management

Service Layer
API communication and orchestration

Rust Engine Layer
High-performance data processing

Storage Layer
Dataset loaders and metadata cache

Architecture diagram:

Desktop App
│
├─ React UI
│   ├ Views
│   ├ ViewModels
│   ├ Services
│
├─ Tauri Bridge
│
└─ Rust Analytics Engine
    ├ Query Engine
    ├ Dataset Registry
    ├ Schema Manager
    ├ Execution Planner
    ├ Streaming Layer
    └ Dataset Loaders

--------------------------------

FRONTEND REQUIREMENTS

React + TypeScript using MVVM pattern.

Folder structure:

src/
  models/
  viewmodels/
  views/
  services/
  components/
  hooks/
  state/
  utils/

Use TailwindCSS for styling.

UI must support:

- dark mode
- large dataset navigation
- resizable panels
- keyboard shortcuts
- command palette
- query history

--------------------------------

FRONTEND PERFORMANCE REQUIREMENTS

The UI must support datasets with millions of rows.

Use:

- windowed rendering
- virtualized tables
- lazy loading
- chunk rendering

Example libraries allowed:

react-virtualized
react-window

Never render more rows than visible.

--------------------------------

CORE FEATURES

1. Dataset Explorer

Allow importing datasets from:

CSV
JSON
Parquet
Arrow

Capabilities:

- automatic schema inference
- dataset preview
- metadata extraction
- column statistics
- file size display
- schema tree viewer

Dataset metadata must be cached locally.

--------------------------------

2. SQL Query Workspace

Provide a full SQL editor.

Capabilities:

- syntax highlighting
- autocomplete
- schema-aware suggestions
- query formatting
- query history
- saved queries

Example query:

SELECT region, SUM(revenue)
FROM sales
GROUP BY region
ORDER BY SUM(revenue) DESC

--------------------------------

3. Streaming Query Execution

Query results must stream in chunks to the UI.

Do NOT load full datasets into memory.

Execution flow:

SQL Query
→ Query Planner
→ DataFusion Execution
→ RecordBatch Streaming
→ JSON conversion
→ UI chunk rendering

--------------------------------

4. High Performance Query Engine

Rust backend must implement:

- lazy execution
- parallel query execution
- predicate pushdown
- column pruning
- streaming record batches

Use Apache Arrow memory format.

--------------------------------

5. Data Table Viewer

Display query results using virtualized table.

Features:

- column sorting
- filtering
- column pinning
- column resizing
- pagination (virtual)
- copy/export

--------------------------------

6. Chart Builder

Allow visualizing query results.

Supported charts:

- line
- bar
- scatter
- histogram
- pie
- time series

Charts must work with streaming data.

--------------------------------

7. Dataset Statistics Engine

Automatically compute statistics:

- min
- max
- null count
- distinct count
- mean
- histogram

Compute lazily.

--------------------------------

BACKEND ARCHITECTURE

Rust modules must follow modular design.

src-tauri/src/

engine/
  dataset_registry.rs
  query_engine.rs
  query_planner.rs
  schema_manager.rs
  statistics_engine.rs

streaming/
  record_batch_stream.rs
  result_serializer.rs

loaders/
  csv_loader.rs
  parquet_loader.rs
  json_loader.rs

api/
  dataset_api.rs
  query_api.rs
  stats_api.rs

cache/
  metadata_cache.rs

--------------------------------

DATASET REGISTRY

Maintain a registry of loaded datasets.

Example structure:

Dataset
- id
- name
- schema
- source_path
- file_type
- statistics
- row_count
- size_bytes

--------------------------------

QUERY EXECUTION PIPELINE

SQL
→ logical plan
→ optimized plan
→ physical plan
→ execution
→ streaming result batches

Use DataFusion execution context.

--------------------------------

MEMORY MANAGEMENT

Must support datasets larger than system memory.

Strategies:

- streaming execution
- columnar processing
- Arrow memory buffers
- memory limits
- spill-to-disk support

--------------------------------

INDEXING

Support optional indexing.

Example indexes:

- column index
- bloom filters
- partition metadata

--------------------------------

QUERY CACHE

Implement query result caching.

Cache:

- recent query results
- dataset metadata
- query plans

--------------------------------

ERROR HANDLING

Provide structured errors:

- dataset load failure
- schema mismatch
- SQL syntax errors
- query execution errors

--------------------------------

OBSERVABILITY

Provide logging and telemetry.

Use structured logging in Rust.

Expose:

query execution time
dataset scan time
rows processed

--------------------------------

EXTENSIBILITY

Design a plugin architecture.

Plugins may add:

- new dataset formats
- new chart types
- ML integrations
- external database connectors

--------------------------------

SECURITY

Since datasets may contain sensitive data:

- no automatic cloud uploads
- local-only processing
- file permission checks

--------------------------------

TAURI API DESIGN

Expose Rust commands:

load_dataset
list_datasets
run_query
get_schema
get_statistics

--------------------------------

DELIVERABLES

The implementation must include:

1. Full project folder structure
2. Rust engine architecture
3. dataset loading system
4. SQL query execution
5. streaming query API
6. React MVVM architecture
7. SQL editor UI
8. virtualized data table
9. dataset explorer UI
10. chart builder
11. Tauri bridge integration
12. example dataset queries