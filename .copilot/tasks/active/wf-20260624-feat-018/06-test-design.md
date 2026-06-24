# Test Design — FR-MIG-023

## Test File Location

`apps/web/src/lib/utm.test.ts`

## Test Pattern

Follow existing web-next patterns (member-filters.test.ts):
- AAA pattern: Arrange, Act, Assert
- One `describe` block per function
- Pure function re-implementation to avoid ESM/alias issues
- Use `describe.each` for parameterized test cases

## Test Cases

### `validateUtmField`

```typescript
describe('validateUtmField', () => {
  describe('source field', () => {
    it('returns null for valid lowercase value', () => {
      expect(validateUtmField('source', 'binali-li')).toBeNull();
    });

    it('returns error for empty string', () => {
      expect(validateUtmField('source', '')).toBe('source is required');
    });

    it('returns error for uppercase', () => {
      expect(validateUtmField('source', 'BINALI')).toBe('source must be lowercase');
    });

    it('returns error for spaces', () => {
      expect(validateUtmField('source', 'binali li')).toBe('source has leading or trailing whitespace');
    });

    it('returns error for leading hyphen', () => {
      expect(validateUtmField('source', '-binali')).toBe('source cannot start or end with a hyphen');
    });

    it('returns error for consecutive hyphens', () => {
      expect(validateUtmField('source', 'bina--li')).toBe('source cannot contain consecutive hyphens');
    });

    it('returns error for placeholder syntax', () => {
      expect(validateUtmField('source', 'sponsor-{slug}')).toBe('source still contains a {placeholder} — replace it with the real value');
    });

    it('returns error for disallowed characters', () => {
      expect(validateUtmField('source', 'binali@test')).toBe('source can only contain a–z, 0–9, hyphens, and underscores');
    });

    it('returns error for value over 64 chars', () => {
      const long = 'a'.repeat(65);
      expect(validateUtmField('source', long)).toBe('source is longer than 64 characters');
    });

    it('accepts underscores', () => {
      expect(validateUtmField('source', 'binali_li')).toBeNull();
    });
  });

  describe('medium field', () => {
    it('returns null for valid medium', () => {
      expect(validateUtmField('medium', 'linkedin_post')).toBeNull();
    });

    it('returns error for invalid medium value', () => {
      expect(validateUtmField('medium', 'facebook')).toBe('medium must be one of the canonical values (see the doc — §5.2)');
    });

    it('returns error for empty string', () => {
      expect(validateUtmField('medium', '')).toBe('medium is required');
    });
  });

  describe('campaign field', () => {
    it('returns null for valid campaign', () => {
      expect(validateUtmField('campaign', 'event-12')).toBeNull();
    });

    it('returns error for empty string', () => {
      expect(validateUtmField('campaign', '')).toBe('campaign is required');
    });
  });

  describe('content field', () => {
    it('returns null for empty string (optional)', () => {
      expect(validateUtmField('content', '')).toBeNull();
    });

    it('returns null for valid content', () => {
      expect(validateUtmField('content', 'headline-a')).toBeNull();
    });

    it('accepts underscores', () => {
      expect(validateUtmField('content', 'image_v2')).toBeNull();
    });
  });
});
```

### `buildUtmUrl`

```typescript
describe('buildUtmUrl', () => {
  it('builds URL with all required params', () => {
    const result = buildUtmUrl({
      destinationUrl: 'https://uz.aiqadam.org/events/12',
      source: 'binali-li',
      medium: 'linkedin_post',
      campaign: 'event-12',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url).toBe('https://uz.aiqadam.org/events/12?utm_source=binali-li&utm_medium=linkedin_post&utm_campaign=event-12');
    }
  });

  it('includes content when provided', () => {
    const result = buildUtmUrl({
      destinationUrl: 'https://uz.aiqadam.org/events/12',
      source: 'binali-li',
      medium: 'linkedin_post',
      campaign: 'event-12',
      content: 'headline-a',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url).toContain('utm_content=headline-a');
    }
  });

  it('excludes content when empty', () => {
    const result = buildUtmUrl({
      destinationUrl: 'https://uz.aiqadam.org/events/12',
      source: 'binali-li',
      medium: 'linkedin_post',
      campaign: 'event-12',
      content: '',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url).not.toContain('utm_content');
    }
  });

  it('replaces existing UTM params on destination URL', () => {
    const result = buildUtmUrl({
      destinationUrl: 'https://uz.aiqadam.org/events/12?utm_source=old-source&utm_medium=old-medium',
      source: 'binali-li',
      medium: 'linkedin_post',
      campaign: 'event-12',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url).toContain('utm_source=binali-li');
      expect(result.url).toContain('utm_medium=linkedin_post');
      expect(result.url).not.toContain('old-source');
      expect(result.url).not.toContain('old-medium');
    }
  });

  it('preserves non-UTM query params', () => {
    const result = buildUtmUrl({
      destinationUrl: 'https://uz.aiqadam.org/events/12?ref=partner&lang=uz',
      source: 'binali-li',
      medium: 'linkedin_post',
      campaign: 'event-12',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url).toContain('ref=partner');
      expect(result.url).toContain('lang=uz');
    }
  });

  it('returns field errors for empty destination', () => {
    const result = buildUtmUrl({
      destinationUrl: '',
      source: 'binali-li',
      medium: 'linkedin_post',
      campaign: 'event-12',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.destinationUrl).toBeDefined();
    }
  });

  it('returns field errors for invalid destination', () => {
    const result = buildUtmUrl({
      destinationUrl: 'not-a-url',
      source: 'binali-li',
      medium: 'linkedin_post',
      campaign: 'event-12',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.destinationUrl).toBeDefined();
    }
  });

  it('returns field errors for invalid source', () => {
    const result = buildUtmUrl({
      destinationUrl: 'https://uz.aiqadam.org/events/12',
      source: 'BINALI', // uppercase
      medium: 'linkedin_post',
      campaign: 'event-12',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.source).toBeDefined();
    }
  });

  it('returns field errors for invalid medium', () => {
    const result = buildUtmUrl({
      destinationUrl: 'https://uz.aiqadam.org/events/12',
      source: 'binali-li',
      medium: 'facebook', // not in UTM_MEDIUMS
      campaign: 'event-12',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.medium).toBeDefined();
    }
  });

  it('returns multiple field errors', () => {
    const result = buildUtmUrl({
      destinationUrl: '',
      source: 'BINALI',
      medium: '',
      campaign: '',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.fieldErrors).length).toBeGreaterThan(1);
    }
  });

  it('trims whitespace from all values', () => {
    const result = buildUtmUrl({
      destinationUrl: '  https://uz.aiqadam.org/events/12  ',
      source: '  binali-li  ',
      medium: 'linkedin_post',
      campaign: '  event-12  ',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url).toContain('utm_source=binali-li');
      expect(result.url).toContain('utm_campaign=event-12');
    }
  });
});
```

### `parseDestination`

```typescript
describe('parseDestination', () => {
  it('parses valid https URL', () => {
    const result = parseDestination('https://uz.aiqadam.org/events/12');
    expect(result.ok).toBe(true);
  });

  it('parses valid http URL', () => {
    const result = parseDestination('http://localhost:3000/test');
    expect(result.ok).toBe(true);
  });

  it('rejects empty string', () => {
    const result = parseDestination('');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('destination URL is required');
    }
  });

  it('rejects invalid URL', () => {
    const result = parseDestination('not a url');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('destination URL is not a valid URL — start it with https://');
    }
  });

  it('rejects non-http protocol', () => {
    const result = parseDestination('ftp://example.com');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('destination URL must use http:// or https://');
    }
  });
});
```

## Estimated Test Count

- `validateUtmField`: 16 tests
- `buildUtmUrl`: 10 tests
- `parseDestination`: 5 tests

**Total: ~31 unit tests**

## Dependencies to Add

```json
{
  "devDependencies": {
    "vitest": "^2.1.8"
  }
}
```

## vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
});
```
