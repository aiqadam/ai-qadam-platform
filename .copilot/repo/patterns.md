# Repository Patterns

Recurring implementation patterns discovered through actual workflows. Agents should consult this before re-inventing common solutions.

---

## NestJS Module Structure

Every module follows this layout:
```
apps/api/src/modules/<name>/
├── <name>.module.ts          # NestJS module registration
├── <name>.controller.ts      # HTTP handlers, auth guards, Zod validation
├── <name>.service.ts         # Business logic
├── <name>.repository.ts      # Drizzle queries (no business logic)
├── schema.ts                 # Drizzle table definitions
├── dto/
│   ├── create-<name>.dto.ts  # Input DTOs with Zod
│   └── <name>.response.ts    # Output DTOs
└── <name>.service.test.ts    # Unit tests
```

## Tenant-Scoped Repository Pattern

Every repository that accesses tenant-scoped data accepts a `TenantContext` and filters by `countryCode`:

```typescript
async findByEvent(eventId: EventId, tenant: TenantContext) {
  return this.db
    .select()
    .from(registrations)
    .where(
      and(
        eq(registrations.eventId, eventId),
        eq(registrations.countryCode, tenant.countryCode),  // always required
      )
    );
}
```

## Error Class Pattern

Each module defines typed errors in `<name>.errors.ts`:
```typescript
export class EventCapacityExceeded extends Error {
  constructor(public readonly eventId: EventId) {
    super(`Event ${eventId} has reached capacity`);
    this.name = 'EventCapacityExceeded';
  }
}
```

Controller catches and maps to RFC 7807 responses via the global exception filter.

## Zod Validation Pattern

Controllers validate external input with Zod before passing to the service:
```typescript
const CreateRegistrationSchema = z.object({
  eventId: z.string().uuid(),
  customFields: z.record(z.string()).optional(),
});

@Post()
async create(@Body() body: unknown, @CurrentUser() user: User) {
  const input = CreateRegistrationSchema.parse(body);
  return this.service.create(input, user);
}
```

## Drizzle Migration Workflow

1. Edit schema in `apps/api/src/modules/<name>/schema.ts`
2. Run `pnpm --filter api db:generate` to produce migration SQL
3. Review generated file in `apps/api/drizzle/`
4. Never hand-edit generated migration files — fix the schema and regenerate

## Integration Test Pattern (Testcontainers)

```typescript
let container: StartedPostgreSqlContainer;

beforeAll(async () => {
  container = await new PostgreSqlContainer().start();
  // run migrations against container
});

afterAll(async () => {
  await container.stop();
});

beforeEach(async () => {
  // wrap in transaction and roll back in afterEach for isolation
});
```

---

*(add patterns as workflows complete and new reusable solutions emerge)*
