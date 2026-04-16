## Component contracts in tests

- When a test needs to register a component, **do not** hand-author a “raw contract” object (e.g. `{ hash, name, imports, data, tasks, ... }`).
- Always build registrations using the public `@liquid-bricks/lib-component-builder` API and **derive** the contract via `.toJSON()`:
  - `import { component } from '@liquid-bricks/lib-component-builder'`
  - `const contract = component('MyComponent').data('x', { ... }).task('y', { ... }).toJSON()`
- Prefer using the derived `contract.hash` everywhere (lookups, instance creation, etc.). Only override `hash` when a test explicitly requires a specific value.
- If a test needs an intentionally-invalid registration payload, start from a derived contract and mutate the **minimum** fields necessary to make it invalid (e.g. wrong type, missing name/hash, malformed inject mapping).

