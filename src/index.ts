// ...existing code...
/**
 * Library entrypoint - re-export public surface.
 * Keep this file small and ESM-friendly.
 */

import { PerplexityClient } from './perplexity';
import type { Chunk as PerplexityChunk } from './perplexity';
import { PerplexityAsyncClient } from './perplexity_async';
import { LabsClient } from './labs';
import { Emailnator } from './emailnator';
import { Driver } from './driver';

// Named exports (clean, single source-of-truth)
export { PerplexityClient, PerplexityAsyncClient, LabsClient, Emailnator, Driver };
export type { PerplexityChunk };

// Helpers and types
export * from './search_helpers';
export * from './types';

// Default export for convenience (prefer named imports)
export default {
  PerplexityClient,
  PerplexityAsyncClient,
  LabsClient,
  Emailnator,
  Driver
};