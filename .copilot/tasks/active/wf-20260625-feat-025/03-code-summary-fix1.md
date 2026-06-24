# Code Summary — Security Fix 1 (MAJOR-1)

## Change made

**File:** `apps/web-next/public/robots.txt`

Added two `Disallow` directives before the catch-all `Allow: /` to prevent search
crawlers from indexing the `/workspace/` and `/me/` URL trees (operator and member
sections of the app).

### Before

```
User-agent: *
Allow: /

Sitemap: https://aiqadam.org/sitemap.xml
```

### After

```
User-agent: *
Disallow: /workspace/
Disallow: /me/
Allow: /

Sitemap: https://aiqadam.org/sitemap.xml
```

The `Disallow` rules are placed before `Allow: /` so that robots.txt order-of-specificity
is respected: more-specific rules first, then the broad allow.

## PageHead.astro verification

`apps/web-next/src/blocks/common/PageHead.astro` line 19 confirms:

```ts
const { title, description, ogImage = '/brand/aiqadam-mark.png' } = Astro.props;
```

The `ogImage` prop defaults to the static brand asset `/brand/aiqadam-mark.png`.
It is rendered directly as `<meta property="og:image" content={ogImage} />` with
Astro's HTML-escaped interpolation — no user-supplied URL injection risk.

---

gate_result:
  status: passed
  summary: "robots.txt disallow rules fixed for /workspace/ and /me/"
