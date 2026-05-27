# Duplicate Code Analysis Report

## Summary
The codebase contains **significant code duplication** across three main areas:
1. **IndexedDB initialization patterns** (2 instances)
2. **Base64 redaction regex patterns** (3 instances)
3. **Base64 to Blob conversion** (1 unique, but duplicated usage pattern)
4. **Object URL lifecycle management** (partially duplicated)

---

## 1. IndexedDB `openDB()` Pattern — DUPLICATE

### Files Affected:
- `src/lib/imageStore.ts` (lines 34-57)
- `src/lib/chatUiStore.ts` (lines 27-48)

### Issue:
Nearly identical `openDB()` function with only minor differences:
- Same pattern: promise caching, onupgradeneeded, onsuccess/onerror handlers
- Different: DB names, store names, and index creation logic

### Code Duplication:
```typescript
// Both files have this pattern:
let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    // ... onupgradeneeded, onsuccess, onerror handlers
  });
  
  return dbPromise;
}
```

### Recommendation:
**Create a shared IndexedDB helper** at `src/lib/indexedDbHelper.ts` with a generic factory function:
```typescript
export interface DBConfig {
  name: string;
  version: number;
  onUpgrade?: (db: IDBDatabase) => void;
}

export function createDbFactory(config: DBConfig) {
  let dbPromise: Promise<IDBDatabase> | null = null;
  
  return function openDB(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;
    
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(config.name, config.version);
      
      request.onupgradeneeded = () => {
        const db = request.result;
        config.onUpgrade?.(db);
      };
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        reject(request.error);
      };
    });
    
    return dbPromise;
  };
}
```

---

## 2. Base64 Redaction Regex — DUPLICATE (3 Instances)

### Files and Locations:
1. **`agents/chat/_stream.ts` (line 37)**
   ```typescript
   /"base64Image"\s*:\s*"[A-Za-z0-9+/=]{100,}"/g
   ```
   Replacement: `'"base64Image":"[REDACTED image data]"'`

2. **`agents/chat/index.ts` (line 45)**
   ```typescript
   /"base64Image"\s*:\s*"[A-Za-z0-9+/=]{100,}"/g
   ```
   Replacement: `'"base64Image":"[screenshot image saved to client]"'`

3. **`agents/history/index.ts` (line 35)**
   ```typescript
   /"base64Image"\s*:\s*"[A-Za-z0-9+/=]{100,}"/g
   ```
   Replacement: `'"base64Image":"[image stored on client]"'`

### Issue:
- Same regex pattern appears in all three files
- Only the replacement message differs
- Maintenance burden: any regex fix must be applied in 3 places

### Recommendation:
**Create a shared sanitization utility** at `agents/_sanitize.ts`:
```typescript
// agents/_sanitize.ts
export const BASE64_IMAGE_REGEX = /"base64Image"\s*:\s*"[A-Za-z0-9+/=]{100,}"/g;

export interface SanitizeOptions {
  placeholder?: string;
}

export function redactBase64ImageValue(
  value: unknown, 
  options: SanitizeOptions = {}
): unknown {
  const placeholder = options.placeholder ?? '[REDACTED image data]';
  
  if (typeof value === 'string') {
    return value.replace(BASE64_IMAGE_REGEX, `"base64Image":"${placeholder}"`);
  }
  if (Array.isArray(value)) {
    return value.map(v => redactBase64ImageValue(v, options));
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (key === 'base64Image' && typeof val === 'string' && val.length > 100) {
        result[key] = `[REDACTED ${val.length} chars]`;
      } else {
        result[key] = redactBase64ImageValue(val, options);
      }
    }
    return result;
  }
  return value;
}
```

Then update each file:
- `agents/chat/_stream.ts`: Use `redactBase64ImageValue(value, { placeholder: '[REDACTED image data]' })`
- `agents/chat/index.ts`: Use `redactBase64ImageValue(data, { placeholder: '[screenshot image saved to client]' })`
- `agents/history/index.ts`: Use `redactBase64ImageValue(text, { placeholder: '[image stored on client]' })`

---

## 3. Base64 to Blob Conversion

### File:
- `src/lib/imageStore.ts` (lines 60-67)

### Status:
**Currently unique**, but the implementation is foundational. Usage in:
- `src/App.tsx` (imported and used)
- Potential for growth if more modules need base64→Blob conversion

### Recommendation:
**Keep in `imageStore.ts`** — it's specific to image storage and already well-placed.

---

## 4. Object URL Lifecycle Management

### Files Affected:
- `src/lib/imageStore.ts` (lines 154-181)
  - `createObjectUrl()` and `revokeObjectUrl()` functions
  - Maintains `activeUrls` map

### Status:
**Currently unique**, but could be extracted if other modules need similar URL management.

### Recommendation:
**Keep in `imageStore.ts`** unless other modules need URL lifecycle management. Currently it's tightly coupled to image storage semantics.

---

## 5. Recursive Sanitization Logic

### Files Affected:
1. **`agents/chat/_stream.ts`** (lines 34-55): `redactBase64()` function
2. **`agents/chat/index.ts`** (lines 41-65): `sanitizeSessionData()` function

### Issue:
Both implement nearly identical recursive sanitization logic (traversing strings, arrays, objects).

### Recommendation:
**Use the shared sanitization utility** created in section #2. Both functions should delegate to `redactBase64ImageValue()`.

---

## Summary of Recommendations

| Issue | Type | Impact | Effort |
|-------|------|--------|--------|
| IndexedDB `openDB()` duplication | Code smell | Medium (maintenance) | Low |
| Base64 regex (3 instances) | Maintainability risk | High (bugfix surface) | Low |
| Recursive sanitization logic (2 instances) | Code smell | Medium | Low |

### Priority Actions:

1. **HIGH**: Create `agents/_sanitize.ts` with shared regex constant and sanitization function
   - Fixes 3 duplicate regex patterns
   - Reduces maintenance surface by 66%
   - ~20 lines of refactoring

2. **MEDIUM**: Create `src/lib/indexedDbHelper.ts` with generic DB factory
   - Eliminates `openDB()` duplication
   - Improves testability
   - ~30 lines of refactoring

3. **LOW**: Monitor for future base64↔Blob conversions
   - Current location (`imageStore.ts`) is appropriate
   - Consider extraction only if 3+ modules need it

---

## Implementation Order

1. Create `agents/_sanitize.ts`
2. Update `agents/chat/_stream.ts` to use new utility
3. Update `agents/chat/index.ts` to use new utility
4. Update `agents/history/index.ts` to use new utility
5. Create `src/lib/indexedDbHelper.ts`
6. Refactor `src/lib/imageStore.ts` to use factory
7. Refactor `src/lib/chatUiStore.ts` to use factory
8. Run tests and verify behavior

