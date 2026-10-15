# Convenções Bun e exemplos de código

Conteúdo movido do AGENTS.md para manter o mapa curto. Nada foi removido.

## Bun no lugar de Node

- Use `bun <file>` em vez de `node <file>` ou `ts-node <file>`
- Use `bun test` em vez de `jest` ou `vitest`
- Use `bun build <file.html|file.ts|file.css>` em vez de `webpack` ou `esbuild`
- Use `bun install` em vez de `npm install`, `yarn install` ou `pnpm install`
- Use `bun run <script>` em vez de `npm run`, `yarn run` ou `pnpm run`
- Use `bunx <package> <command>` em vez de `npx <package> <command>`
- Bun carrega o `.env` sozinho; não use dotenv.

## APIs

- `Bun.serve()` suporta WebSockets, HTTPS e rotas. Não use `express`.
- `bun:sqlite` para SQLite. Não use `better-sqlite3`.
- `Bun.redis` para Redis. Não use `ioredis`.
- `Bun.sql` para Postgres. Não use `pg` nem `postgres.js`.
- `WebSocket` é nativo. Não use `ws`.
- Prefira `Bun.file` a `readFile` e `writeFile` de `node:fs`.
- Use `` Bun.$`ls` `` em vez de `execa`.

## Testes

Use `bun test`.

```ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend com HTML imports

Use HTML imports com `Bun.serve()`. Não use `vite`. HTML imports suportam React, CSS e Tailwind.

Servidor:

```ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // suporte opcional a websocket
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // tratar fechamento
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

Arquivos HTML podem importar `.tsx`, `.jsx` ou `.js` direto, e o bundler do Bun transpila. Tags `<link>` apontam para folhas de estilo, que o bundler de CSS processa.

```html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

```tsx
import React from "react";
import { createRoot } from "react-dom/client";

import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Rode com:

```sh
bun --hot ./index.ts
```

Para a documentação completa da API, leia `node_modules/bun-types/docs/**.mdx`.
