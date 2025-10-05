# Component Architecture & API Flows

## 1. Frontend Component Architecture

```mermaid
graph TB
    subgraph "App Router (Next.js 14)"
        LAYOUT[layout.tsx]
        PAGE[page.tsx]
        ANNOTATE[annotate/[id]/page.tsx]
        EXPLORE[explore/page.tsx]
    end

    subgraph "UI Components (components/)"
        subgraph "Search Module"
            SEARCH_INPUT[SearchInput]
            SEARCH_RESULTS[SearchResults]
            RESULT_CARD[ResultCard]
            FILTER_PANE[FilterPane]
        end

        subgraph "Annotation Module"
            STREAMING[StreamingAnnotation]
            ANNOTATION_SEC[AnnotationSection]
            LINK_CHIPS[LinkChips]
            FEEDBACK[FeedbackModal]
        end

        subgraph "Visualization Module"
            KNOWLEDGE_GRAPH[KnowledgeGraph]
            NODE_DETAIL[NodeDetail]
            PATH_VIEWER[PathViewer]
        end

        subgraph "Common Components"
            LOADING[LoadingSpinner]
            ERROR_BOUNDARY[ErrorBoundary]
            MODAL[Modal]
            TOAST[Toast]
        end
    end

    subgraph "State Management"
        ZUSTAND[Store]
        SWR[SWR Cache]
        QUERY_CLIENT[Query Client]
    end

    subgraph "Services"
        API[API Service]
        WEBSOCKET[WebSocket Service]
        ANALYTICS[Analytics Service]
    end

    PAGE --> SEARCH_INPUT
    PAGE --> SEARCH_RESULTS
    SEARCH_RESULTS --> RESULT_CARD
    PAGE --> FILTER_PANE

    ANNOTATE --> STREAMING
    STREAMING --> ANNOTATION_SEC
    ANNOTATE --> LINK_CHIPS
    ANNOTATE --> FEEDBACK

    EXPLORE --> KNOWLEDGE_GRAPH
    EXPLORE --> NODE_DETAIL
    EXPLORE --> PATH_VIEWER

    SEARCH_INPUT --> API
    RESULT_CARD --> API
    STREAMING --> API
    KNOWLEDGE_GRAPH --> WEBSOCKET

    ZUSTAND --> SEARCH_INPUT
    ZUSTAND --> SEARCH_RESULTS
    ZUSTAND --> STREAMING
    SWR --> API
```

## 2. API Flow Diagrams

### 2.1 Search Flow

```mermaid
sequenceDiagram
    participant U as User
    participant UI as Frontend
    participant S as API/Search
    participant C as Cache
    participant L as LanceDB
    participant E as Embedding

    U->>UI: Enters query
    UI->>UI: Debounce (300ms)
    UI->>S: POST /api/search

    alt Cache Hit
        S->>C: Check cache
        C-->>S: Return cached results
        S->>UI: Results (cached)
    else Cache Miss
        S->>E: Generate query embedding
        E-->>S: Vector [1024]
        S->>L: Vector search (top_k=5)
        L-->>S: Matching passages
        alt Hybrid Search
            S->>L: BM25 search
            L-->>S: Keyword matches
            S->>S: Merge & rerank results
        end
        S->>C: Cache results
        S->>UI: Results
    end

    UI->>UI: Render results
    U->>UI: Click "生成注释"
    UI->>UI: Trigger annotation flow
```

### 2.2 Annotation Flow (Streaming)

```mermaid
sequenceDiagram
    participant UI as Frontend
    participant A as API/Annotate
    participant R as LLM Router
    participant G as GLM-4.5
    participant C as Cache

    UI->>A: POST /api/annotate
    activate A

    A->>C: Check cache
    alt Found in cache
        C-->>A: Cached annotation
        A->>UI: Stream cached data
    else Not cached
        A->>R: Get provider
        R->>R: Validate API keys
        R-->>A: Return GLM provider

        A->>G: Stream request
        activate G

        loop Streaming response
            G-->>A: Data chunk
            A->>A: Parse chunk
            A->>UI: SSE: {"type":"chunk"}
        end

        G-->>A: Final metadata
        A->>C: Cache result
        A->>UI: SSE: {"type":"end"}
        deactivate G
    end

    deactivate A

    UI->>UI: Update UI in real-time
```

### 2.3 Embedding Flow (Batch Processing)

```mermaid
sequenceDiagram
    participant S as Script
    participant API as API/Embed
    participant E as bge-m3 Model
    participant DB as LanceDB
    participant M as Monitor

    S->>API: Load sixclassics.jsonl
    loop For each passage
        API->>E: Generate embedding
        E-->>API: Vector [1024]
        API->>API: Validate dimensions
        API->>DB: Batch insert
        M->>M: Track progress
    end
    DB-->>S: Import complete
    S->>S: Log statistics
```

## 3. Data Flow Architecture

```mermaid
graph LR
    subgraph "Input Layer"
        USER_QUERY[User Query]
        CLASSIC_TEXT[Classic Texts]
        USER_NOTES[User Notes]
    end

    subgraph "Processing Layer"
        EMBEDDING[Embedding Service]
        SEARCH[Search Engine]
        ANNOTATION[Annotation Service]
        RERANK[Reranking Service]
    end

    subgraph "Storage Layer"
        VECTOR_STORE[(Vector DB)]
        CACHE_STORE[(Cache)]
        METADATA_STORE[(Metadata)]
    end

    subgraph "Output Layer"
        SEARCH_RESULTS[Search Results]
        ANNOTATIONS[Annotations]
        LINKS[Semantic Links]
        GRAPH[Knowledge Graph]
    end

    USER_QUERY --> EMBEDDING
    CLASSIC_TEXT --> EMBEDDING
    USER_NOTES --> EMBEDDING

    EMBEDDING --> VECTOR_STORE
    SEARCH --> VECTOR_STORE
    SEARCH --> METADATA_STORE

    SEARCH --> RERANK
    RERANK --> SEARCH_RESULTS

    SEARCH_RESULTS --> ANNOTATION
    ANNOTATION --> CACHE_STORE
    ANNOTATION --> ANNOTATIONS
    ANNOTATION --> LINKS

    LINKS --> GRAPH
    ANNOTATIONS --> GRAPH
```

## 4. State Management Flow

```mermaid
stateDiagram-v2
    [*] --> Idle

    Idle --> Searching: User types query
    Searching --> Loading: API call
    Loading --> Results: Success
    Loading --> Error: Failure
    Results --> Idle: New search
    Error --> Idle: Retry

    Results --> Annotating: Click annotate
    Annotating --> Streaming: Start streaming
    Streaming --> Complete: Stream ends
    Streaming --> Error: Stream error
    Complete --> Results: Back to results
    Error --> Results: Retry annotation

    Results --> Exploring: Click link
    Exploring --> Searching: New search from link
```

## 5. Component Props & Interfaces

### 5.1 Search Components

```typescript
// SearchInput.tsx
interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  loading?: boolean;
  suggestions?: string[];
  placeholder?: string;
}

// SearchResults.tsx
interface SearchResultsProps {
  results: SearchResult[];
  loading: boolean;
  query: string;
  onLoadMore: () => void;
  hasMore: boolean;
}

// ResultCard.tsx
interface ResultCardProps {
  result: SearchResult;
  onAnnotate: (id: string) => void;
  onExplore: (links: Link[]) => void;
  cached?: boolean;
}
```

### 5.2 Annotation Components

```typescript
// StreamingAnnotation.tsx
interface StreamingAnnotationProps {
  query: string;
  passage: string;
  passageId: string;
  onComplete: (annotation: Annotation) => void;
  onError: (error: Error) => void;
}

// AnnotationSection.tsx
interface AnnotationSectionProps {
  title: string;
  content: string;
  type: "six_to_me" | "me_to_six";
  loading?: boolean;
}

// LinkChips.tsx
interface LinkChipsProps {
  links: Link[];
  onClick: (link: Link) => void;
  disabled?: boolean;
}
```

### 5.3 Visualization Components

```typescript
// KnowledgeGraph.tsx
interface KnowledgeGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick: (node: GraphNode) => void;
  onEdgeClick: (edge: GraphEdge) => void;
  layout?: "force" | "hierarchical" | "circular";
  filters?: GraphFilters;
}

// NodeDetail.tsx
interface NodeDetailProps {
  node: GraphNode;
  annotations: Annotation[];
  relatedNodes: GraphNode[];
  onClose: () => void;
}
```

## 6. Service Layer Architecture

```typescript
// Service interfaces
interface SearchService {
  search(query: SearchRequest): Promise<SearchResponse>;
  getSuggestions(query: string): Promise<string[]>;
  getHistory(): Promise<SearchHistory[]>;
}

interface AnnotationService {
  generate(request: AnnotationRequest): Promise<AsyncGenerator<AnnotationChunk>>;
  save(annotation: Annotation): Promise<void>;
  rate(annotationId: string, rating: number): Promise<void>;
}

interface CacheService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  invalidate(pattern: string): Promise<void>;
}

// Service factory
class ServiceFactory {
  private static instances: Map<string, any> = new Map();

  static get<T>(name: string): T {
    if (!this.instances.has(name)) {
      switch (name) {
        case "search":
          this.instances.set(name, new SearchService());
          break;
        case "annotation":
          this.instances.set(name, new AnnotationService());
          break;
        case "cache":
          this.instances.set(name, new CacheService());
          break;
      }
    }
    return this.instances.get(name);
  }
}
```

## 7. Error Boundary Implementation

```typescript
// components/ErrorBoundary.tsx
interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: any;
}

class ErrorBoundary extends Component<
  PropsWithChildren<{}>,
  ErrorBoundaryState
> {
  constructor(props: PropsWithChildren<{}>) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("Error caught by boundary:", error, errorInfo);
    // Log to service (Sentry, etc.)
    logError(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h2>Something went wrong</h2>
          <details>
            {this.state.error?.message}
          </details>
          <button onClick={() => this.setState({ hasError: false })}>
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

This component architecture provides a clear separation of concerns, making the system maintainable and scalable. Each component has well-defined responsibilities and interfaces, following React best practices and TypeScript for type safety.